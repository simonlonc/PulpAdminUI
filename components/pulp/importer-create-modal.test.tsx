// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ImporterCreateModal } from "@/components/pulp/importer-create-modal";

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock("@/services/pulp/import-service", () => ({
  pulpImportService: { create: createMock },
}));

const onClose = vi.fn();
const onCreated = vi.fn();

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderModal() {
  return render(<ImporterCreateModal onClose={onClose} onCreated={onCreated} />);
}

const create = () => fireEvent.click(screen.getByRole("button", { name: "Create" }));
const addMapping = () => fireEvent.click(screen.getByRole("button", { name: "Add mapping" }));
const setName = (value: string) =>
  fireEvent.change(screen.getByLabelText("Name"), { target: { value } });

/** Fills the mapping row at `index`, adding it first when it does not exist yet. */
function fillRow(index: number, exportName: string, localName: string) {
  while (screen.queryAllByLabelText("Repository in the export").length <= index) {
    addMapping();
  }
  fireEvent.change(screen.getAllByLabelText("Repository in the export")[index], {
    target: { value: exportName },
  });
  fireEvent.change(screen.getAllByLabelText("Repository on this Pulp")[index], {
    target: { value: localName },
  });
}

describe("ImporterCreateModal", () => {
  it("explains that the mapping is optional and that the right-hand repositories must exist", () => {
    renderModal();

    expect(screen.getByText(/Without a mapping, Pulp matches repositories by the names in the export/)).toBeTruthy();
    expect(screen.getByText(/Every repository named on the right must already exist on this Pulp/)).toBeTruthy();
  });

  it("creates with just a name when there are no mapping rows", async () => {
    createMock.mockResolvedValue({ ok: true, data: {} });
    renderModal();
    setName(" aa-test-imp ");
    create();

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(createMock).toHaveBeenCalledWith({ name: "aa-test-imp" });
    expect(Object.keys(createMock.mock.calls[0][0])).toEqual(["name"]);
  });

  it("turns the key/value rows into repo_mapping, trimmed, dropping rows with both sides blank", async () => {
    createMock.mockResolvedValue({ ok: true, data: {} });
    renderModal();
    setName("aa-test-imp");
    fillRow(0, " aa-probe-src ", " aa-probe-dst ");
    fillRow(1, "   ", "");
    fillRow(2, "other-src", "other-dst");
    create();

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(createMock).toHaveBeenCalledWith({
      name: "aa-test-imp",
      repo_mapping: { "aa-probe-src": "aa-probe-dst", "other-src": "other-dst" },
    });
  });

  it("omits repo_mapping when every row is blank", async () => {
    createMock.mockResolvedValue({ ok: true, data: {} });
    renderModal();
    setName("aa-test-imp");
    addMapping();
    create();

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect(createMock).toHaveBeenCalledWith({ name: "aa-test-imp" });
  });

  it("removes a row", async () => {
    createMock.mockResolvedValue({ ok: true, data: {} });
    renderModal();
    setName("aa-test-imp");
    fillRow(0, "drop-src", "drop-dst");
    fillRow(1, "keep-src", "keep-dst");
    fireEvent.click(screen.getByRole("button", { name: "Remove mapping drop-src" }));
    create();

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect(createMock.mock.calls[0][0].repo_mapping).toEqual({ "keep-src": "keep-dst" });
  });

  it.each([
    ["only the left side", "aa-probe-src", ""],
    ["only the right side", "", "aa-probe-dst"],
  ])("blocks submit when a row has %s filled", (_label, exportName, localName) => {
    renderModal();
    setName("aa-test-imp");
    fillRow(0, "ok-src", "ok-dst");
    fillRow(1, exportName, localName);
    create();

    expect(screen.getByRole("alert").textContent).toBe(
      "Mapping row 2 needs a repository on both sides, or clear it."
    );
    expect(createMock).not.toHaveBeenCalled();
  });

  it("blocks submit when the same repository in the export is mapped twice", () => {
    renderModal();
    setName("aa-test-imp");
    fillRow(0, "aa-probe-src", "one");
    fillRow(1, "aa-probe-src", "two");
    create();

    expect(screen.getByRole("alert").textContent).toBe('Repository "aa-probe-src" is mapped twice.');
    expect(createMock).not.toHaveBeenCalled();
  });

  it("requires a name before calling Pulp", () => {
    renderModal();
    create();

    expect(screen.getByRole("alert").textContent).toBe("Name is required.");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("shows Pulp's error text as returned when create fails, and stays open", async () => {
    createMock.mockResolvedValue({
      ok: false,
      detail: "Failed to find repositories from repo_mapping: names: ['aa-probe-dst']",
    });
    renderModal();
    setName("aa-test-imp");
    fillRow(0, "aa-probe-src", "aa-probe-dst");
    create();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(
      "Failed to find repositories from repo_mapping: names: ['aa-probe-dst']"
    );
    expect(onCreated).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
