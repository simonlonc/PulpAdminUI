// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DistributionCreateModal } from "@/components/pulp/distribution-create-modal";
import { DistributionEditModal } from "@/components/pulp/distribution-edit-modal";
import { PULP_PLUGINS, type PulpPluginDescriptor } from "@/lib/pulp-plugins";
import type { PulpDistribution, PulpDistributionDetail } from "@/services/pulp/types";

// A descriptor that carries the spec's default for hidden, as a registry-derived one does.
const rpm: PulpPluginDescriptor = {
  ...PULP_PLUGINS.find((plugin) => plugin.kind === "rpm")!,
  baseFieldHints: { hidden: { placeholder: "Pulp default", default: false } },
};

vi.mock("@/components/pulp/plugins-context", () => ({
  usePulpPluginsContext: () => ({ plugins: [rpm], getPlugin: () => rpm }),
}));
vi.mock("@/components/pulp/use-pulp-repository-options", () => ({
  usePulpRepositoryOptions: () => ({ repositoryOptions: [] }),
}));
vi.mock("@/components/pulp/use-pulp-publication-options", () => ({
  usePulpPublicationOptions: () => ({ publicationOptions: [] }),
}));

const { getMock, updateMock, createMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  updateMock: vi.fn(),
  createMock: vi.fn(),
}));
vi.mock("@/services/pulp/content-guard-service", () => ({
  pulpContentGuardService: { list: async () => ({ results: [] }) },
}));
vi.mock("@/services/pulp/distribution-service", () => ({
  pulpDistributionService: { get: getMock, update: updateMock, createDistribution: createMock },
}));

const distribution: PulpDistribution = {
  pulp_href: "/pulp/api/v3/distributions/rpm/rpm/abc/",
  pulp_created: "2024-01-01T00:00:00Z",
  base_path: "bp",
  base_url: "http://x/bp/",
  name: "dist",
  repository: null,
  content_guard: null,
  pulp_labels: {},
};

function detail(hidden: boolean | undefined): PulpDistributionDetail {
  return { ...distribution, publication: null, hidden };
}

beforeEach(() => {
  updateMock.mockResolvedValue({ ok: true });
  createMock.mockResolvedValue({ ok: true, data: {} });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const details = (container: HTMLElement) => container.querySelector("details")!;

async function renderEdit(hidden: boolean | undefined) {
  getMock.mockResolvedValue(detail(hidden));
  const view = render(<DistributionEditModal distribution={distribution} onClose={() => {}} onSaved={() => {}} />);
  await screen.findByLabelText("Hidden from the content app", { selector: "input" }).catch(() => null);
  await waitFor(() => expect(screen.queryByText("Loading…")).toBeNull());
  return view;
}

describe("DistributionEditModal hidden", () => {
  it("is closed and unchecked when the distribution is not hidden", async () => {
    const { container } = await renderEdit(false);
    expect(details(container).open).toBe(false);
    expect((screen.getByLabelText("Hidden from the content app") as HTMLInputElement).checked).toBe(false);
  });

  it("is closed and unchecked when the response carries no hidden at all", async () => {
    const { container } = await renderEdit(undefined);
    expect(details(container).open).toBe(false);
  });

  it("is open, counted and checked when the stored value is true", async () => {
    const { container } = await renderEdit(true);
    expect(details(container).open).toBe(true);
    expect(screen.getByText("Advanced (1 set)")).toBeTruthy();
    expect((screen.getByLabelText("Hidden from the content app") as HTMLInputElement).checked).toBe(true);
  });

  it("saves hidden false after it is unchecked, and true when left as stored", async () => {
    await renderEdit(true);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));
    expect(updateMock.mock.calls[0][1].hidden).toBe(true);

    fireEvent.click(screen.getByLabelText("Hidden from the content app"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(2));
    expect(updateMock.mock.calls[1][1].hidden).toBe(false);
  });
});

describe("DistributionCreateModal hidden", () => {
  function renderCreate() {
    return render(<DistributionCreateModal onClose={() => {}} onCreated={() => {}} />);
  }

  it("is closed and unchecked by default, the spec default being false", () => {
    const { container } = renderCreate();
    expect(details(container).open).toBe(false);
    expect((screen.getByLabelText("Hidden from the content app") as HTMLInputElement).checked).toBe(false);
  });

  it("counts the field and sends hidden true once checked", async () => {
    renderCreate();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "n" } });
    fireEvent.change(screen.getByLabelText("Base path"), { target: { value: "p" } });
    fireEvent.click(screen.getByLabelText("Hidden from the content app"));
    expect(screen.getByText("Advanced (1 set)")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect(createMock.mock.calls[0][1].hidden).toBe(true);
  });

  it("sends hidden false when left alone", async () => {
    renderCreate();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "n" } });
    fireEvent.change(screen.getByLabelText("Base path"), { target: { value: "p" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect(createMock.mock.calls[0][1].hidden).toBe(false);
  });
});
