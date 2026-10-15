// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import TasksListPage from "@/app/tasks/list/page";
import type { PulpTask } from "@/services/pulp/types";

const DONE_HREF = "/pulp/api/v3/tasks/01a13c6e-2388-71e5-a84d-b0184e3e1084/";
const RUNNING_HREF = "/pulp/api/v3/tasks/01a13747-c3e4-7d38-a7fd-08d92b417815/";

function makeTask(overrides: Partial<PulpTask>): PulpTask {
  return {
    pulp_href: DONE_HREF,
    pulp_created: "2026-10-14T22:00:13Z",
    state: "completed",
    name: "pulpcore.app.tasks.orphan.orphan_cleanup",
    logging_cid: "",
    started_at: "2026-10-14T22:00:14Z",
    finished_at: "2026-10-14T22:00:15Z",
    error: null,
    worker: null,
    parent_task: null,
    child_tasks: [],
    task_group: null,
    progress_reports: [],
    created_resources: [],
    reserved_resources_record: [],
    ...overrides,
  };
}

const { listState } = vi.hoisted(() => ({
  listState: { results: [] as PulpTask[], loading: false },
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
    setError: vi.fn(),
    logout: vi.fn(),
  }),
}));
vi.mock("@/components/pulp/use-require-auth", () => ({ useRequireAuth: () => false }));
vi.mock("@/components/pulp/use-pulp-list-query", () => ({
  usePulpListQuery: () => ({
    query: { search: "", pageSize: 100, page: 1, ordering: "", q: "" },
    setOrdering: vi.fn(),
    setPage: vi.fn(),
    setPageSize: vi.fn(),
    setFilters: vi.fn(),
    setExtraParams: vi.fn(),
  }),
}));
vi.mock("@/components/pulp/use-pulp-tasks", () => ({
  usePulpTasks: () => ({
    data: { results: listState.results, count: listState.results.length },
    loading: listState.loading,
    totalPages: 1,
    reload: vi.fn(),
  }),
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

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const NAME = "orphan.orphan_cleanup";

/*
 * jsdom applies no CSS, so the table (hidden below sm) and the card list (hidden from sm up)
 * are both in the document: every row has two "Actions for" triggers, the table's first.
 */
async function openMenu(layout: "table" | "cards", name: string) {
  const triggers = screen.getAllByRole("button", { name: `Actions for ${name}` });
  expect(triggers).toHaveLength(2);
  const trigger = layout === "table" ? triggers[0] : triggers[1];
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
  return (await screen.findAllByRole("menuitem")).map((item) => item.textContent);
}

describe("TasksListPage", () => {
  it("lists each task as a card below sm with its state, times and the row menu", () => {
    listState.results = [
      makeTask({}),
      makeTask({ pulp_href: RUNNING_HREF, state: "running", finished_at: null }),
    ];
    render(<TasksListPage />);

    const cards = within(screen.getByRole("list", { name: "Tasks" })).getAllByRole("listitem");
    expect(cards).toHaveLength(2);
    expect(within(cards[0]).getByText("completed")).toBeTruthy();
    expect(within(cards[0]).getByText(NAME)).toBeTruthy();
    expect(within(cards[0]).getByText("01a13c6e-2388-71e5-a84d-b0184e3e1084")).toBeTruthy();
    expect(within(cards[0]).getByText("Finished")).toBeTruthy();
    expect(within(cards[0]).getByRole("button", { name: `Actions for ${NAME}` })).toBeTruthy();
    expect(within(cards[1]).getByText("running")).toBeTruthy();
    // The table is still rendered for sm and up.
    expect(
      screen.getAllByRole("columnheader").map((header) => header.textContent?.trim())
    ).toEqual(["State", "Task", "Name", "Created", "Started", "Finished", "Worker", "Actions"]);
  });

  it("gives the card the same row menu as the table: Details, plus Cancel while running", async () => {
    async function menuItems(layout: "table" | "cards", task: PulpTask) {
      listState.results = [task];
      const { unmount } = render(<TasksListPage />);
      const items = await openMenu(layout, NAME);
      unmount();
      return items;
    }

    const completed = makeTask({});
    const running = makeTask({ pulp_href: RUNNING_HREF, state: "running" });
    expect(await menuItems("cards", completed)).toEqual(["Details"]);
    expect(await menuItems("table", completed)).toEqual(["Details"]);
    expect(await menuItems("cards", running)).toEqual(["Details", "Cancel"]);
    expect(await menuItems("table", running)).toEqual(["Details", "Cancel"]);
  });

  it("opens the cancel dialog from the card's menu", async () => {
    listState.results = [makeTask({ pulp_href: RUNNING_HREF, state: "running" })];
    render(<TasksListPage />);

    await openMenu("cards", NAME);
    fireEvent.click(screen.getByRole("menuitem", { name: "Cancel" }));

    expect(await screen.findByRole("dialog", { name: /^Cancel task / })).toBeTruthy();
  });

  it("keeps the sort buttons reachable from the card list", () => {
    listState.results = [makeTask({})];
    render(<TasksListPage />);

    // One set in the table head, one above the cards.
    for (const label of ["State", "Name", "Created", "Started", "Finished"]) {
      expect(screen.getAllByRole("button", { name: label })).toHaveLength(2);
    }
  });

  it("says so in the card list when there are no tasks", () => {
    listState.results = [];
    render(<TasksListPage />);

    expect(
      within(screen.getByRole("list", { name: "Tasks" })).getByText("No tasks on this page.")
    ).toBeTruthy();
  });
});
