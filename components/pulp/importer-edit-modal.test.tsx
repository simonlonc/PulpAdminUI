// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ImporterEditModal } from "@/components/pulp/importer-edit-modal";
import type { PulpImporter, PulpSearchGroup } from "@/services/pulp/types";

const { updateMock, searchMock } = vi.hoisted(() => ({ updateMock: vi.fn(), searchMock: vi.fn() }));

vi.mock("@/services/pulp/import-service", () => ({
  pulpImportService: { update: updateMock },
}));
vi.mock("@/services/pulp/search-service", () => ({
  pulpSearchService: { search: searchMock },
}));

const importer: PulpImporter = {
  pulp_href: "/pulp/api/v3/importers/core/pulp/i1/",
  prn: "prn:core.pulpimporter:i1",
  pulp_created: "2026-01-01T00:00:00Z",
  pulp_last_updated: "2026-01-01T00:00:00Z",
  name: "from-upstream",
  repo_mapping: { "src-one": "dst-one", "src-two": "dst-two" },
};

const onClose = vi.fn();
const onSaved = vi.fn();

/** What the search route returns for a term: the repository family holds the given names. */
function searchResult(
  repositories: string[],
  overrides: Partial<PulpSearchGroup> = {}
): PulpSearchGroup[] {
  return [
    {
      family: "repository",
      count: repositories.length,
      results: repositories.map((name) => ({
        pulp_href: `/pulp/api/v3/repositories/file/file/${name}/`,
        prn: `prn:file.filerepository:${name}`,
        name,
      })),
      error: null,
      ...overrides,
    },
    { family: "remote", count: 0, results: [], error: null },
  ];
}

/** Every destination exists unless the test says otherwise. */
function everyRepositoryExists() {
  searchMock.mockImplementation(async (term: string) => searchResult([term]));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderModal(value: PulpImporter = importer) {
  return render(<ImporterEditModal importer={value} onClose={onClose} onSaved={onSaved} />);
}

const save = () => fireEvent.click(screen.getByRole("button", { name: "Save" }));
const setName = (value: string) =>
  fireEvent.change(screen.getByLabelText("Name"), { target: { value } });
const setLocalName = (index: number, value: string) =>
  fireEvent.change(screen.getAllByLabelText("Repository on this Pulp")[index], {
    target: { value },
  });

describe("ImporterEditModal", () => {
  it("prefills the name and one row per mapping entry", () => {
    renderModal();

    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("from-upstream");
    expect(
      screen.getAllByLabelText("Repository in the export").map((input) => (input as HTMLInputElement).value)
    ).toEqual(["src-one", "src-two"]);
    expect(
      screen.getAllByLabelText("Repository on this Pulp").map((input) => (input as HTMLInputElement).value)
    ).toEqual(["dst-one", "dst-two"]);
  });

  it("no longer tells the user to delete and recreate the importer to change a mapping", () => {
    renderModal();

    expect(screen.queryByText(/delete the importer/i)).toBeNull();
  });

  it("sends only the name when only the name changed, without looking up any repository", async () => {
    updateMock.mockResolvedValue({ ok: true });
    renderModal();
    setName(" renamed ");
    save();

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(updateMock).toHaveBeenCalledWith(importer.pulp_href, { name: "renamed" });
    expect(searchMock).not.toHaveBeenCalled();
  });

  it("sends only repo_mapping when only the mapping changed, after confirming every destination exists", async () => {
    everyRepositoryExists();
    updateMock.mockResolvedValue({ ok: true });
    renderModal();
    setLocalName(1, " dst-three ");
    save();

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith(importer.pulp_href, {
      repo_mapping: { "src-one": "dst-one", "src-two": "dst-three" },
    });
    expect(searchMock.mock.calls.map((call) => call[0]).sort()).toEqual(["dst-one", "dst-three"]);
  });

  it("allows clearing the mapping entirely and sends an empty object without any lookup", async () => {
    updateMock.mockResolvedValue({ ok: true });
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Remove mapping src-one" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove mapping src-two" }));
    save();

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(updateMock).toHaveBeenCalledWith(importer.pulp_href, { repo_mapping: {} });
    expect(searchMock).not.toHaveBeenCalled();
  });

  it("blocks the save and names the repository when a destination does not exist, never calling update", async () => {
    searchMock.mockImplementation(async (term: string) =>
      searchResult(term === "ghost-repo" ? ["ghost-repo-2"] : [term])
    );
    renderModal();
    setLocalName(0, "ghost-repo");
    save();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain('Repository "ghost-repo" does not exist on this Pulp.');
    expect(alert.textContent).toContain("Nothing was saved");
    expect(updateMock).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("names every missing destination", async () => {
    searchMock.mockResolvedValue(searchResult([]));
    renderModal();
    setLocalName(0, "ghost-a");
    setLocalName(1, "ghost-b");
    save();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain('Repositories "ghost-a", "ghost-b" do not exist on this Pulp.');
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("matches the destination by exact name, so a longer name that merely contains it does not count", async () => {
    searchMock.mockImplementation(async (term: string) =>
      searchResult(term === "dst-new" ? ["dst-new-extra"] : [term])
    );
    renderModal();
    setLocalName(0, "dst-new");
    save();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain('Repository "dst-new" does not exist');
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("blocks the save when the lookup itself fails, never calling update", async () => {
    searchMock.mockRejectedValue(new Error("Pulp is unreachable"));
    renderModal();
    setLocalName(0, "dst-new");
    save();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Pulp is unreachable");
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("blocks the save when the repository lookup reports an error or was truncated, never calling update", async () => {
    searchMock.mockResolvedValue(searchResult([], { error: "boom" }));
    renderModal();
    setLocalName(0, "dst-new");
    save();

    const errored = await screen.findByRole("alert");
    expect(errored.textContent).toContain("Could not confirm that");
    expect(updateMock).not.toHaveBeenCalled();

    searchMock.mockResolvedValue(searchResult(["other"], { count: 250 }));
    save();

    await waitFor(() => expect(searchMock).toHaveBeenCalledTimes(4));
    expect((await screen.findByRole("alert")).textContent).toContain("Could not confirm that");
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("checks the mapping rows before any lookup", () => {
    renderModal();
    setLocalName(0, "");
    save();

    expect(screen.getByRole("alert").textContent).toBe(
      "Mapping row 1 needs a repository on both sides, or clear it."
    );
    expect(searchMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("does not call Pulp when nothing changed", () => {
    renderModal();
    save();

    expect(screen.getByRole("alert").textContent).toBe("Nothing has changed.");
    expect(searchMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("requires a name", () => {
    renderModal();
    setName(" ");
    save();

    expect(screen.getByRole("alert").textContent).toBe("Name is required.");
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("shows Pulp's error text as returned when the update fails, and stays open", async () => {
    updateMock.mockResolvedValue({ ok: false, detail: "name: importer with this name already exists." });
    renderModal();
    setName("taken");
    save();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("name: importer with this name already exists.");
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
