// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import RemotesListPage from "@/app/remotes/list/page";
import { PULP_PLUGINS } from "@/lib/pulp-plugins";
import type { PulpRemote } from "@/services/pulp/types";

const EPEL_HREF = "/pulp/api/v3/remotes/rpm/rpm/01a112b2-c604-7235-b47a-d54ff46459b6/";

const EPEL: PulpRemote = {
  pulp_href: EPEL_HREF,
  pulp_created: "2026-10-06T19:31:58Z",
  pulp_last_updated: null,
  name: "epel-10",
  url: "https://dl.fedoraproject.org/pub/epel/10/Everything/x86_64",
  policy: "immediate",
  tls_validation: true,
  pulp_labels: { env: "prod" },
  ca_cert: null,
  client_cert: null,
  proxy_url: null,
  download_concurrency: null,
};

const { listMock, ensurePermissionsMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
  ensurePermissionsMock: vi.fn(),
}));

vi.mock("@/components/pulp/admin-shell", () => ({
  AdminShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/pulp/auth-context", () => ({
  usePulpAuthContext: () => ({
    sessionUser: "admin",
    isLoading: false,
    isCheckingSession: false,
    hasSession: true,
    error: null,
    setError: vi.fn(),
    logout: vi.fn(),
  }),
}));
vi.mock("@/components/pulp/plugins-context", () => ({
  usePulpPluginsContext: () => ({ plugins: PULP_PLUGINS }),
}));
vi.mock("@/components/pulp/use-require-auth", () => ({ useRequireAuth: () => false }));
vi.mock("@/components/pulp/use-pulp-object-permissions", () => ({
  usePulpObjectPermissions: () => ({ ensure: ensurePermissionsMock, can: () => true }),
}));
vi.mock("@/components/pulp/use-pulp-list-query", () => {
  // One stable object, like the real hook's memoized query: the page reloads on query change.
  const query = { search: "", pageSize: 25, page: 1, ordering: "", q: "", labelSelect: "" };
  const setters = {
    query,
    setOrdering: vi.fn(),
    setPage: vi.fn(),
    setPageSize: vi.fn(),
    setFilters: vi.fn(),
  };
  return { usePulpListQuery: () => setters };
});
vi.mock("@/services/pulp/remote-service", () => ({
  pulpRemoteService: { list: listMock, remove: vi.fn() },
}));
vi.mock("@/components/pulp/remote-form-modal", () => ({
  RemoteFormModal: ({ editing }: { editing: PulpRemote | null }) => (
    <div>stub form dialog for {editing ? editing.name : "new remote"}</div>
  ),
}));

// Radix positions its menu with pointer-capture and ResizeObserver APIs that
// jsdom does not implement. Stub them so the row menu can open under test.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

beforeEach(() => {
  listMock.mockResolvedValue({ count: 1, next: null, previous: null, results: [EPEL] });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/*
 * jsdom applies no CSS, so the table (hidden below sm) and the card list (hidden from sm up)
 * are both in the document: every row has two "Actions for" triggers, the table's first.
 */
async function openMenu(layout: "table" | "cards") {
  const triggers = await screen.findAllByRole("button", { name: "Actions for epel-10" });
  expect(triggers).toHaveLength(2);
  const trigger = layout === "table" ? triggers[0] : triggers[1];
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
  return (await screen.findAllByRole("menuitem")).map((item) => item.textContent);
}

describe("RemotesListPage", () => {
  it("lists each remote as a card below sm with every column the table has", async () => {
    render(<RemotesListPage />);

    // The first render shows the loading row; wait for the remote to arrive.
    await screen.findAllByRole("button", { name: "Actions for epel-10" });
    const cards = within(screen.getByRole("list", { name: "Remotes" })).getAllByRole("listitem");
    expect(cards).toHaveLength(1);
    const [card] = cards;
    expect(within(card).getByText("epel-10")).toBeTruthy();
    expect(
      within(card).getByText("https://dl.fedoraproject.org/pub/epel/10/Everything/x86_64")
    ).toBeTruthy();
    expect(within(card).getByText("immediate")).toBeTruthy();
    expect(within(card).getByText("on")).toBeTruthy();
    expect(within(card).getByText("env=prod")).toBeTruthy();
    for (const label of ["URL", "Policy", "TLS", "Updated", "Labels"]) {
      expect(within(card).getByText(label)).toBeTruthy();
    }
    // The table is still rendered for sm and up.
    expect(
      screen.getAllByRole("columnheader").map((header) => header.textContent?.trim())
    ).toEqual(["Name", "URL", "Policy", "TLS", "Updated", "Labels", "Actions"]);
  });

  it("gives the card the same row menu as the table and fetches permissions on open", async () => {
    const { unmount } = render(<RemotesListPage />);
    const fromCards = await openMenu("cards");
    expect(fromCards).toEqual(["Edit", "Labels", "Access", "Delete"]);
    expect(ensurePermissionsMock).toHaveBeenCalledWith(EPEL_HREF);
    unmount();

    render(<RemotesListPage />);
    expect(await openMenu("table")).toEqual(fromCards);
  });

  it("opens the edit dialog from the card's menu", async () => {
    render(<RemotesListPage />);

    await openMenu("cards");
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit" }));

    expect(await screen.findByText("stub form dialog for epel-10")).toBeTruthy();
  });

  it("says so in the card list when there are no remotes", async () => {
    listMock.mockResolvedValue({ count: 0, next: null, previous: null, results: [] });
    render(<RemotesListPage />);

    await waitFor(() =>
      expect(
        within(screen.getByRole("list", { name: "Remotes" })).getByText("No RPM remotes yet.")
      ).toBeTruthy()
    );
  });
});
