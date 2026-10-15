// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ContentListPage from "@/app/content/list/page";
import type { PulpContentItem } from "@/services/pulp/types";

const PACKAGE_HREF = "/pulp/api/v3/content/rpm/packages/01a136dd-61c5-702a-aa55-6b0af160971e/";
const FILE_HREF = "/pulp/api/v3/content/file/files/01a136dd-61c5-702a-aa55-6b0af160972e/";
const ADVISORY_HREF = "/pulp/api/v3/content/rpm/advisories/01a136dd-61c5-702a-aa55-6b0af160973e/";

const ITEMS: PulpContentItem[] = [
  {
    pulp_href: PACKAGE_HREF,
    pulp_created: "2026-10-01T19:31:08Z",
    artifacts: { "bash-5.2.26-3.el10.x86_64.rpm": "/pulp/api/v3/artifacts/a/" },
  },
  {
    pulp_href: FILE_HREF,
    pulp_created: "2026-10-02T19:31:08Z",
    artifacts: { "README.md": "/pulp/api/v3/artifacts/b/" },
  },
  { pulp_href: ADVISORY_HREF, pulp_created: "2026-10-03T19:31:08Z", artifacts: {} },
];

const { listState } = vi.hoisted(() => ({
  listState: { items: [] as PulpContentItem[], loading: false },
}));

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
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
    logout: vi.fn(),
  }),
}));
vi.mock("@/components/pulp/plugins-context", () => ({
  usePulpPluginsContext: () => ({
    plugins: [],
    getPlugin: () => ({ label: "File" }),
    // Only the file content is routable here; rpm packages take the /content/packages/ route.
    findContentForHref: (href: string) =>
      href === FILE_HREF
        ? { kind: "file", path: "/pulp/api/v3/content/file/files/", id: "01a136dd" }
        : null,
  }),
}));
vi.mock("@/components/pulp/use-require-auth", () => ({ useRequireAuth: () => false }));
vi.mock("@/components/pulp/use-pulp-repository-options", () => ({
  usePulpRepositoryOptions: () => ({ repositoryOptions: [] }),
}));
vi.mock("@/components/pulp/use-pulp-list-query", () => ({
  usePulpListQuery: () => ({
    query: { search: "", pageSize: 50, page: 1, ordering: "", q: "" },
    params: new URLSearchParams(),
    setPage: vi.fn(),
    setPageSize: vi.fn(),
    setFilters: vi.fn(),
    setExtraParams: vi.fn(),
  }),
}));
vi.mock("@/components/pulp/use-pulp-content", () => ({
  usePulpContent: () => ({
    contentItems: listState.items,
    count: listState.items.length,
    loading: listState.loading,
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ContentListPage", () => {
  it("lists each content record as a card below sm with its created time and artifacts", () => {
    listState.items = ITEMS;
    render(<ContentListPage />);

    const cards = within(screen.getByRole("list", { name: "Content" })).getAllByRole("listitem");
    expect(cards).toHaveLength(3);
    expect(within(cards[0]).getByText(PACKAGE_HREF)).toBeTruthy();
    expect(within(cards[0]).getByText("2026-10-01T19:31:08Z")).toBeTruthy();
    expect(within(cards[0]).getByText("bash-5.2.26-3.el10.x86_64.rpm")).toBeTruthy();
    // No artifacts: the same "-" placeholder the table shows.
    expect(within(cards[2]).getByText("Artifacts").nextElementSibling?.textContent).toBe("-");
    // The table is still rendered for sm and up.
    expect(
      screen.getAllByRole("columnheader").map((header) => header.textContent?.trim())
    ).toEqual(["Pulp Href", "Created", "Artifact Names", "Actions"]);
  });

  it("gives the card the same action as the table row, with the same link", () => {
    listState.items = ITEMS;
    render(<ContentListPage />);

    const cards = within(screen.getByRole("list", { name: "Content" })).getAllByRole("listitem");
    const tableRows = screen.getAllByRole("row").slice(1);
    expect(tableRows).toHaveLength(3);

    const pkgCard = within(cards[0]).getByRole("link", { name: "View package" });
    const pkgRow = within(tableRows[0]).getByRole("link", { name: "View package" });
    expect(pkgCard.getAttribute("href")).toBe("/content/packages/01a136dd-61c5-702a-aa55-6b0af160971e");
    expect(pkgCard.getAttribute("href")).toBe(pkgRow.getAttribute("href"));

    const fileCard = within(cards[1]).getByRole("link", { name: "View content" });
    const fileRow = within(tableRows[1]).getByRole("link", { name: "View content" });
    expect(fileCard.getAttribute("href")).toBe(fileRow.getAttribute("href"));

    // A record with no detail page has no link in either layout.
    expect(within(cards[2]).queryByRole("link")).toBeNull();
    expect(within(tableRows[2]).queryByRole("link")).toBeNull();
  });

  it("says so in the card list when there is no content", () => {
    listState.items = [];
    render(<ContentListPage />);

    expect(
      within(screen.getByRole("list", { name: "Content" })).getByText("No content on this page.")
    ).toBeTruthy();
  });
});
