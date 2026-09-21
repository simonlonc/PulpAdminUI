/**
 * F-3 (currently broken): isAllowedLabelApiPath (labels/route.ts:26) and
 * isAllowedObjectRoleApiPath (object-roles/route.ts:22) test
 * `apiPath.endsWith("/") && ALLOWED_*_PREFIXES.some((p) => apiPath.startsWith(p))`
 * against `apiPath`, which is normalizePulpHrefToApiPath's result -- and that
 * result still carries the query string. A relative `pulp_href` whose query
 * itself ends in "/" (e.g. "/repositories/rpm/rpm/?a=/") passes both checks
 * even though the *path* component is just "/repositories/rpm/rpm/": the
 * route then builds `${apiPath}set_label/`, and because "?a=/" is already a
 * query string, appending "set_label/" after it lands inside the query
 * (`?a=/set_label/`) rather than becoming the final path segment. Every
 * upstream call this route makes ends up hitting the bare resource, not the
 * action endpoint.
 *
 * This is checked by inspecting the URL the stubbed `fetch` was actually
 * called with, parsed with the WHATWG `URL` class (an independent authority,
 * not a re-derivation of the route's own string logic): the action suffix
 * must be the last path segment, never inside the query.
 *
 * Scope: only labels/route.ts and object-roles/route.ts (the two routes named
 * in this task). object-roles/my-permissions/route.ts has a similar-shaped
 * allowlist but is out of scope here.
 *
 * This tier only runs under `npm run fuzz` (see vitest.fuzz.config.ts); it is
 * excluded from `npm test`.
 */

import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { encodePulpAuth } from "@/lib/pulp";

const { cookieState } = vi.hoisted(() => ({
  cookieState: { value: undefined as string | undefined },
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieState.value === undefined ? undefined : { name, value: cookieState.value },
    delete: () => {
      cookieState.value = undefined;
    },
    set: (name: string, value: string) => {
      cookieState.value = value;
    },
  }),
}));

import { POST as labelsPost, DELETE as labelsDelete } from "@/app/api/pulp/labels/route";
import { GET as rolesGet, POST as rolesPost, DELETE as rolesDelete } from "@/app/api/pulp/object-roles/route";

// Mirrors ALLOWED_LABEL_PATH_PREFIXES / ALLOWED_OBJECT_ROLE_PATH_PREFIXES, read as data (not
// re-derived logic): the arbitrary below only ever picks a prefix each route's own allowlist
// already accepts, so a rejection can never be mistaken for the fix being present.
const ALLOWED_LABEL_PATH_PREFIXES = [
  "/repositories/",
  "/remotes/",
  "/distributions/",
  "/publications/",
  "/content/",
] as const;
const ALLOWED_OBJECT_ROLE_PATH_PREFIXES = ["/repositories/", "/remotes/", "/distributions/", "/contentguards/"] as const;

/** Query-string tails that all end in "/" -- the family that reaches the bug. */
const QUERY_TAIL_SUFFIXES = ["/", "//", "/x/", "/a/b/"] as const;

/**
 * A relative pulp_href built from one of this route's own allowed prefixes, with a query string
 * that itself ends in "/". Guaranteed to pass isAllowed*ApiPath (prefix matches, and the whole
 * string -- including the query -- ends with "/"), so this always reaches the vulnerable
 * `${apiPath}${actionSuffix}` concatenation rather than being rejected before it.
 */
function vulnerableHrefArb(allowedPrefixes: readonly string[]): fc.Arbitrary<string> {
  return fc
    .tuple(
      fc.constantFrom(...allowedPrefixes),
      fc.webSegment().filter((s) => s.length > 0),
      fc.webSegment().filter((s) => s.length > 0),
      fc.constantFrom(...QUERY_TAIL_SUFFIXES)
    )
    .map(([prefix, resource, queryKey, tail]) => `${prefix}${resource}/?${queryKey}=${tail}`);
}

// The task's own recorded counterexamples, applied to every case below (including object-roles,
// where "/content/?q=/" isn't on that route's allowlist at all and is correctly rejected --
// still a valid, non-vacuous check that the reject path takes precedence over the bug).
const SHARED_HREF_EXAMPLES = ["/repositories/rpm/rpm/?a=/", "/content/?q=/"];

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubEnv("PULP_SESSION_SECRET", "0".repeat(64));
  vi.stubEnv("PULP_BASE_URL", "http://pulp.test/pulp/api/v3");
  cookieState.value = encodePulpAuth({ username: "admin", password: "admin" });
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, roles: [] }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

type Case = {
  label: string;
  allowedPrefixes: readonly string[];
  actionSuffix: string;
  invoke: (pulpHrefValue: string) => Promise<Response>;
};

const cases: Case[] = [
  {
    label: "POST /api/pulp/labels (set_label/)",
    allowedPrefixes: ALLOWED_LABEL_PATH_PREFIXES,
    actionSuffix: "set_label/",
    invoke: (href) =>
      labelsPost(
        new Request("http://x/y", {
          method: "POST",
          body: JSON.stringify({ pulp_href: href, key: "k", value: "v" }),
        }),
        undefined
      ),
  },
  {
    label: "DELETE /api/pulp/labels (unset_label/)",
    allowedPrefixes: ALLOWED_LABEL_PATH_PREFIXES,
    actionSuffix: "unset_label/",
    invoke: (href) =>
      labelsDelete(
        new Request("http://x/y", {
          method: "DELETE",
          body: JSON.stringify({ pulp_href: href, key: "k" }),
        }),
        undefined
      ),
  },
  {
    label: "GET /api/pulp/object-roles (list_roles/)",
    allowedPrefixes: ALLOWED_OBJECT_ROLE_PATH_PREFIXES,
    actionSuffix: "list_roles/",
    invoke: (href) =>
      rolesGet(new Request(`http://x/y?pulp_href=${encodeURIComponent(href)}`), undefined),
  },
  {
    label: "POST /api/pulp/object-roles (add_role/)",
    allowedPrefixes: ALLOWED_OBJECT_ROLE_PATH_PREFIXES,
    actionSuffix: "add_role/",
    invoke: (href) =>
      rolesPost(
        new Request("http://x/y", {
          method: "POST",
          body: JSON.stringify({ pulp_href: href, role: "r" }),
        }),
        undefined
      ),
  },
  {
    label: "DELETE /api/pulp/object-roles (remove_role/)",
    allowedPrefixes: ALLOWED_OBJECT_ROLE_PATH_PREFIXES,
    actionSuffix: "remove_role/",
    invoke: (href) =>
      rolesDelete(
        new Request("http://x/y", {
          method: "DELETE",
          body: JSON.stringify({ pulp_href: href, role: "r" }),
        }),
        undefined
      ),
  },
];

describe.each(cases.map((c): [string, Case] => [c.label, c]))("%s", (_label, testCase) => {
  it("F-3: when the upstream is called, the action suffix is the last path segment (never in the query)", async () => {
    await fc.assert(
      fc.asyncProperty(vulnerableHrefArb(testCase.allowedPrefixes), async (href) => {
        fetchMock.mockClear();
        await testCase.invoke(href);

        if (fetchMock.mock.calls.length === 0) {
          // The allowlist legitimately rejected this href before ever calling fetch (e.g. a
          // shared example href that isn't on *this* route's own prefix list) -- nothing to
          // check for this run.
          return;
        }

        const calledUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));

        expect(testCase.allowedPrefixes.some((prefix) => calledUrl.pathname.includes(prefix))).toBe(
          true
        );
        expect(calledUrl.pathname.endsWith(testCase.actionSuffix)).toBe(true);
      }),
      { examples: SHARED_HREF_EXAMPLES.map((href): [string] => [href]) }
    );
  });
});
