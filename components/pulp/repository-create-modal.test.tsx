// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RepositoryCreateModal } from "@/components/pulp/repository-create-modal";
import { PULP_PLUGINS } from "@/lib/pulp-plugins";

const file = PULP_PLUGINS.find((plugin) => plugin.kind === "file")!;

const { setErrorMock, createMock } = vi.hoisted(() => ({ setErrorMock: vi.fn(), createMock: vi.fn() }));

vi.mock("@/components/pulp/auth-context", () => ({
  usePulpAuthContext: () => ({ setError: setErrorMock }),
}));
vi.mock("@/components/pulp/plugins-context", () => ({
  usePulpPluginsContext: () => ({ plugins: [file], getPlugin: () => file }),
}));
vi.mock("@/services/pulp/remote-service", () => ({
  pulpRemoteService: { list: async () => ({ results: [] }) },
}));
vi.mock("@/services/pulp/repository-management-service", () => ({
  pulpRepositoryManagementService: { create: createMock },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderModal() {
  return render(
    <RepositoryCreateModal initialKind="file" onClose={() => {}} onCreated={() => {}} onBusyChange={() => {}} />
  );
}

function submit(checkpoints: string) {
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "repo" } });
  if (checkpoints !== "") {
    fireEvent.change(screen.getByLabelText("Retain checkpoints (optional)"), { target: { value: checkpoints } });
  }
  fireEvent.submit(screen.getByRole("button", { name: "Create" }).closest("form")!);
}

describe("RepositoryCreateModal retain_checkpoints", () => {
  it("starts with a closed Advanced section and a Keep all placeholder", () => {
    const { container } = renderModal();
    expect(container.querySelector("details")!.open).toBe(false);
    const input = screen.getByLabelText("Retain checkpoints (optional)") as HTMLInputElement;
    expect(input.placeholder).toBe("Keep all");
    expect(input.min).toBe("1");
  });

  it("sends null when left blank", async () => {
    createMock.mockResolvedValue({ ok: true, data: { name: "repo", pulp_href: null, task: null } });
    renderModal();
    submit("");
    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect(createMock.mock.calls[0][1].retain_checkpoints).toBeNull();
  });

  it("sends the number when set", async () => {
    createMock.mockResolvedValue({ ok: true, data: { name: "repo", pulp_href: null, task: null } });
    renderModal();
    submit("2");
    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect(createMock.mock.calls[0][1].retain_checkpoints).toBe(2);
  });

  it("rejects 0 visibly, opens the section and does not call create", () => {
    const { container } = renderModal();
    submit("0");
    expect(setErrorMock).toHaveBeenCalledWith("Retain checkpoints must be a whole number of at least 1.");
    expect(createMock).not.toHaveBeenCalled();
    expect(container.querySelector("details")!.open).toBe(true);
  });
});
