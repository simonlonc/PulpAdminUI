// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DistributionCreateModal } from "@/components/pulp/distribution-create-modal";
import { DistributionEditModal } from "@/components/pulp/distribution-edit-modal";
import { PULP_PLUGINS, type PulpPluginDescriptor } from "@/lib/pulp-plugins";
import type { PulpDistribution, PulpDistributionDetail } from "@/services/pulp/types";

const base = PULP_PLUGINS.find((plugin) => plugin.kind === "rpm")!;
const file = PULP_PLUGINS.find((plugin) => plugin.kind === "file")!;
const withVersion: PulpPluginDescriptor = {
  ...base,
  baseFieldHints: {
    hidden: { placeholder: "Pulp default", default: false },
    repository_version: { placeholder: "Pulp default" },
  },
};
const withoutVersion: PulpPluginDescriptor = {
  ...file,
  baseFieldHints: { hidden: { placeholder: "Pulp default", default: false } },
};

const REPO = "/pulp/api/v3/repositories/rpm/rpm/r1/";
const V1 = `${REPO}versions/1/`;
const V2 = `${REPO}versions/2/`;

vi.mock("@/components/pulp/plugins-context", () => ({
  usePulpPluginsContext: () => ({
    plugins: [withVersion, withoutVersion],
    getPlugin: (kind: string) => (kind === "file" ? withoutVersion : withVersion),
  }),
}));
vi.mock("@/components/pulp/use-pulp-repository-options", () => ({
  usePulpRepositoryOptions: () => ({
    repositoryOptions: [{ href: REPO, name: "repo-one", kind: "rpm", latestVersionHref: V2 }],
  }),
}));
vi.mock("@/components/pulp/use-pulp-publication-options", () => ({
  usePulpPublicationOptions: () => ({ publicationOptions: [] }),
}));

const { getMock, updateMock, createMock, versionsMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  updateMock: vi.fn(),
  createMock: vi.fn(),
  versionsMock: vi.fn(),
}));
vi.mock("@/services/pulp/content-guard-service", () => ({
  pulpContentGuardService: { list: async () => ({ results: [] }) },
}));
vi.mock("@/services/pulp/distribution-service", () => ({
  pulpDistributionService: { get: getMock, update: updateMock, createDistribution: createMock },
}));
vi.mock("@/services/pulp/repository-management-service", () => ({
  pulpRepositoryManagementService: { listRepositoryVersions: versionsMock },
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

beforeEach(() => {
  updateMock.mockResolvedValue({ ok: true });
  createMock.mockResolvedValue({ ok: true, data: {} });
  versionsMock.mockResolvedValue({
    count: 2,
    results: [
      { pulp_href: V1, number: 1, pulp_created: "2024-01-01", repository: REPO },
      { pulp_href: V2, number: 2, pulp_created: "2024-02-01", repository: REPO },
    ],
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const optionValues = (label: string) =>
  Array.from((screen.getByLabelText(label) as HTMLSelectElement).options).map((o) => o.value);

describe("DistributionCreateModal repository version binding", () => {
  it("offers the option only for a type whose distribution accepts repository_version", () => {
    render(<DistributionCreateModal onClose={() => {}} onCreated={() => {}} />);
    expect(optionValues("Binding")).toContain("repository_version");
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "file" } });
    expect(optionValues("Binding")).not.toContain("repository_version");
  });

  it("resets the binding when the type changes to one without the option", () => {
    render(<DistributionCreateModal onClose={() => {}} onCreated={() => {}} />);
    fireEvent.change(screen.getByLabelText("Binding"), { target: { value: "repository_version" } });
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "file" } });
    expect((screen.getByLabelText("Binding") as HTMLSelectElement).value).toBe("none");
  });

  it("picks a repository, lists its versions newest first, and sends the version with the others null", async () => {
    render(<DistributionCreateModal onClose={() => {}} onCreated={() => {}} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "n" } });
    fireEvent.change(screen.getByLabelText("Base path"), { target: { value: "p" } });
    fireEvent.change(screen.getByLabelText("Binding"), { target: { value: "repository_version" } });
    expect(screen.getByText(/will not follow new versions/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Repository"), { target: { value: REPO } });
    await waitFor(() => expect(optionValues("Repository version")).toEqual(["", V2, V1]));
    expect(versionsMock).toHaveBeenCalledWith("rpm", REPO);
    expect(screen.getByText("Version 1 (2024-01-01)")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(screen.getByText("Select a repository version.")).toBeTruthy();
    expect(createMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Repository version"), { target: { value: V1 } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect(createMock.mock.calls[0][1]).toMatchObject({
      repository: null,
      publication: null,
      repository_version: V1,
    });
  });
});

describe("DistributionEditModal repository version binding", () => {
  function detail(extra: Partial<PulpDistributionDetail>): PulpDistributionDetail {
    return { ...distribution, publication: null, hidden: false, ...extra };
  }

  async function renderEdit(extra: Partial<PulpDistributionDetail>) {
    getMock.mockResolvedValue(detail(extra));
    render(<DistributionEditModal distribution={distribution} onClose={() => {}} onSaved={() => {}} />);
    await waitFor(() => expect(screen.queryByText("Loading…")).toBeNull());
  }

  it("opens with the pinned version's binding, repository and version preselected", async () => {
    await renderEdit({ repository_version: V1 });
    expect((screen.getByLabelText("Binding") as HTMLSelectElement).value).toBe("repository_version");
    expect((screen.getByLabelText("Repository") as HTMLSelectElement).value).toBe(REPO);
    await waitFor(() => expect((screen.getByLabelText("Repository version") as HTMLSelectElement).value).toBe(V1));
  });

  it("saves a switch to Repository with the version nulled", async () => {
    await renderEdit({ repository_version: V1 });
    fireEvent.change(screen.getByLabelText("Binding"), { target: { value: "repository" } });
    fireEvent.change(screen.getByLabelText("Repository"), { target: { value: REPO } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));
    expect(updateMock.mock.calls[0][1]).toMatchObject({
      repository: REPO,
      publication: null,
      repository_version: null,
    });
  });

  it("saves a pinned version with repository and publication nulled", async () => {
    await renderEdit({ repository: REPO });
    fireEvent.change(screen.getByLabelText("Binding"), { target: { value: "repository_version" } });
    fireEvent.change(screen.getByLabelText("Repository"), { target: { value: REPO } });
    await waitFor(() => expect(optionValues("Repository version")).toContain(V2));
    fireEvent.change(screen.getByLabelText("Repository version"), { target: { value: V2 } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));
    expect(updateMock.mock.calls[0][1]).toMatchObject({
      repository: null,
      publication: null,
      repository_version: V2,
    });
  });
});
