import {
  findContentForHrefIn,
  findPluginForRepositoryHrefIn,
  PulpPluginDescriptor,
} from "@/lib/pulp-plugins";

/**
 * Parsing and routing for the global pulp_href / PRN lookup (app/search). Pure module — no
 * server imports — so it can run in both the resolve API route and the client-side search page.
 */

export type PulpResourceFamily =
  | "repository"
  | "repositoryVersion"
  | "remote"
  | "distribution"
  | "publication"
  | "content"
  | "contentGuard"
  | "task"
  | "taskGroup"
  | "taskSchedule"
  | "user"
  | "group"
  | "role"
  | "worker";

const PULP_API_MARKER = "/pulp/api/v3/";
const PRN_PATTERN = /^prn:[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+:.+$/;

/**
 * What a pasted string names: a Pulp href (normalised to a relative, trailing-slash path) or a
 * PRN. Returns null when the input is empty or matches neither shape.
 */
export function parsePulpResourceRef(
  input: string
): { kind: "href"; href: string } | { kind: "prn"; prn: string } | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return null;
  }

  if (PRN_PATTERN.test(trimmed)) {
    return { kind: "prn", prn: trimmed };
  }

  let path: string;
  try {
    path = new URL(trimmed).pathname;
  } catch {
    path = trimmed.split(/[?#]/)[0];
  }

  if (!path.includes(PULP_API_MARKER)) {
    return null;
  }

  const normalized = path.endsWith("/") ? path : `${path}/`;
  return { kind: "href", href: normalized };
}

/**
 * The resource family a pulp_href belongs to, derived from the path segments after
 * "/pulp/api/v3/" — detail responses carry no pulp_type field to read this from instead.
 */
export function pulpResourceFamilyFromHref(href: string): PulpResourceFamily | null {
  const markerIndex = href.indexOf(PULP_API_MARKER);
  if (markerIndex === -1) {
    return null;
  }

  const segments = href
    .slice(markerIndex + PULP_API_MARKER.length)
    .split("/")
    .filter((segment) => segment.length > 0);

  switch (segments[0]) {
    case "repositories":
      return segments.includes("versions") ? "repositoryVersion" : "repository";
    case "remotes":
      return "remote";
    case "distributions":
      return "distribution";
    case "publications":
      return "publication";
    case "content":
      return "content";
    case "contentguards":
      return "contentGuard";
    case "tasks":
      return "task";
    case "task-groups":
      return "taskGroup";
    case "task-schedules":
      return "taskSchedule";
    case "users":
      return "user";
    case "groups":
      return "group";
    case "roles":
      return "role";
    case "workers":
      return "worker";
    default:
      return null;
  }
}

/**
 * The relative Pulp list path to query with `prn__in` for a PRN's model, e.g.
 * "prn:rpm.rpmrepository:<uuid>" -> "/repositories/". Exact core models are checked before the
 * suffix rules so e.g. "core.task" resolves to "/tasks/" rather than falling through to
 * "/content/". The exact models are the ones the server actually reports: a user is
 * "auth.user" and a worker is "core.appstatus", not the names their endpoints suggest.
 * Returns null when `prn` isn't a well-formed PRN.
 */
export function pulpListPathForPrn(prn: string): string | null {
  const match = prn.match(/^prn:([a-zA-Z0-9_]+)\.([a-zA-Z0-9_]+):/);
  if (!match) {
    return null;
  }

  const [, appLabel, model] = match;
  switch (`${appLabel}.${model}`) {
    case "core.task":
      return "/tasks/";
    case "core.taskschedule":
      return "/task-schedules/";
    case "auth.user":
      return "/users/";
    case "core.group":
      return "/groups/";
    case "core.role":
      return "/roles/";
    case "core.appstatus":
      return "/workers/";
  }

  if (model.endsWith("repositoryversion")) {
    return "/repository_versions/";
  }
  if (model.endsWith("repository")) {
    return "/repositories/";
  }
  if (model.endsWith("remote")) {
    return "/remotes/";
  }
  if (model.endsWith("distribution")) {
    return "/distributions/";
  }
  if (model.endsWith("publication")) {
    return "/publications/";
  }
  if (model.endsWith("contentguard") || model.endsWith("certguard")) {
    return "/contentguards/";
  }

  return "/content/";
}

/**
 * The in-app route for a resolved href, or null when its family has no page to show it on.
 * `name` is required for the families whose list page is filtered by search; omitted (not
 * queried) when null.
 */
export function pulpResourceTargetIn(
  plugins: readonly PulpPluginDescriptor[],
  href: string,
  name: string | null
): string | null {
  const family = pulpResourceFamilyFromHref(href);
  if (!family) {
    return null;
  }

  const encodedHref = encodeURIComponent(href);
  const encodedName = name != null ? encodeURIComponent(name) : null;

  switch (family) {
    case "repository": {
      const plugin = findPluginForRepositoryHrefIn(plugins, href);
      return plugin ? `/repositories/edit?kind=${plugin.kind}&pulp_href=${encodedHref}` : "/repositories/list";
    }
    case "repositoryVersion": {
      const plugin = findPluginForRepositoryHrefIn(plugins, href);
      return plugin ? `/repositories/version?kind=${plugin.kind}&pulp_href=${encodedHref}` : "/repositories/list";
    }
    case "remote":
      return encodedName ? `/remotes/list?search=${encodedName}` : "/remotes/list";
    case "distribution":
      return encodedName ? `/distributions/list?search=${encodedName}` : "/distributions/list";
    case "publication":
      return "/publications/list";
    case "content": {
      const content = findContentForHrefIn(plugins, href);
      return content
        ? `/content/${content.kind}/${content.id}?path=${encodeURIComponent(content.path)}`
        : "/content/list";
    }
    case "contentGuard":
      return encodedName ? `/content-guards/list?search=${encodedName}` : "/content-guards/list";
    case "task":
      return `/tasks/detail?pulp_href=${encodedHref}`;
    case "taskGroup":
      return `/task-groups/detail?pulp_href=${encodedHref}`;
    case "taskSchedule":
      return "/task-schedules/list";
    case "user":
      return "/users/list";
    case "group":
      return "/groups/list";
    case "role":
      return "/roles/list";
    case "worker":
      return "/workers/list";
    default:
      return null;
  }
}
