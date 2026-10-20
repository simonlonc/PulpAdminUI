// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RepositoryDeleteModal } from "@/components/pulp/repository-delete-modal";
import { PULP_PLUGINS } from "@/lib/pulp-plugins";
import type { PulpDistribution, PulpRepository } from "@/services/pulp/types";

const file = PULP_PLUGINS.find((plugin) => plugin.kind === "file")!;

const { removeRepositoryMock, removeDistributionMock } = vi.hoisted(() => ({
  removeRepositoryMock: vi.fn(),
  removeDistributionMock: vi.fn(),
}));

vi.mock("@/components/pulp/plugins-context", () => ({
  usePulpPluginsContext: () => ({ getPlugin: () => file }),
}));
vi.mock("@/services/pulp/repository-management-service", () => ({
  pulpRepositoryManagementService: { remove: removeRepositoryMock },
}));
vi.mock("@/services/pulp/distribution-service", () => ({
  pulpDistributionService: { remove: removeDistributionMock },
}));

const repo = { pulp_href: "/pulp/api/v3/repositories/file/file/r/", name: "repo" } as PulpRepository;
const distribution = {
  pulp_href: "/pulp/api/v3/distributions/file/file/d/",
  name: "dist",
  repository: repo.pulp_href,
} as PulpDistribution;

const onDeleted = vi.fn();

beforeEach(() => {
  removeRepositoryMock.mockResolvedValue({ ok: true });
  removeDistributionMock.mockResolvedValue({ ok: true });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderModal() {
  return render(
    <RepositoryDeleteModal
      repo={repo}
      kind="file"
      distributions={[distribution]}
      onClose={() => {}}
      onDeleted={onDeleted}
      onBusyChange={() => {}}
    />
  );
}

const deleteRepository = () => fireEvent.click(screen.getByRole("button", { name: "Delete repository" }));

describe("RepositoryDeleteModal", () => {
  it("shows a failed delete inside the dialog and does not call onDeleted", async () => {
    removeRepositoryMock.mockResolvedValue({ ok: false, detail: "boom" });
    renderModal();
    deleteRepository();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("boom");
    expect(screen.getByRole("dialog").contains(alert)).toBe(true);
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it("removes the linked distribution and the repository, then calls onDeleted", async () => {
    renderModal();
    deleteRepository();

    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(removeDistributionMock).toHaveBeenCalledWith(distribution.pulp_href);
    expect(removeRepositoryMock).toHaveBeenCalledWith("file", repo.pulp_href);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
