// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RepositoryCreateModal } from "@/components/pulp/repository-create-modal";
import { findPluginForRemoteHrefIn, PULP_PLUGINS } from "@/lib/pulp-plugins";

const file = PULP_PLUGINS.find((plugin) => plugin.kind === "file")!;
const rpm = PULP_PLUGINS.find((plugin) => plugin.kind === "rpm")!;

const { setErrorMock, createMock, listAllMock } = vi.hoisted(() => ({
  setErrorMock: vi.fn(),
  createMock: vi.fn(),
  listAllMock: vi.fn(),
}));

vi.mock("@/components/pulp/auth-context", () => ({
  usePulpAuthContext: () => ({ setError: setErrorMock }),
}));
vi.mock("@/components/pulp/plugins-context", () => ({
  usePulpPluginsContext: () => ({
    plugins: [file, rpm],
    getPlugin: (kind: string) => (kind === "rpm" ? rpm : file),
    findPluginForRemoteHref: (href: string) => findPluginForRemoteHrefIn([file, rpm], href),
  }),
}));
vi.mock("@/services/pulp/remote-service", () => ({
  pulpRemoteService: { listAll: listAllMock },
}));
vi.mock("@/services/pulp/repository-management-service", () => ({
  pulpRepositoryManagementService: { create: createMock },
}));

beforeEach(() => {
  listAllMock.mockResolvedValue([]);
});

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

describe("RepositoryCreateModal remotes", () => {
  it("lists remotes in one request and shows only those of the chosen type", async () => {
    listAllMock.mockResolvedValue([
      { pulp_href: "/pulp/api/v3/remotes/file/file/1/", name: "files", url: "https://f.test/" },
      { pulp_href: "/pulp/api/v3/remotes/rpm/rpm/2/", name: "epel", url: "https://r.test/" },
      { pulp_href: "/pulp/api/v3/remotes/ansible/role/3/", name: "unknown", url: "https://a.test/" },
    ]);
    renderModal();
    const remoteSelect = screen.getByLabelText("Remote") as HTMLSelectElement;
    const options = () => Array.from(remoteSelect.options).map((o) => o.textContent);

    await waitFor(() => expect(options()).toContain("files — https://f.test/"));
    expect(options()).not.toContain("epel — https://r.test/");
    expect(options().some((text) => text?.startsWith("unknown"))).toBe(false);
    expect(listAllMock).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "rpm" } });
    await waitFor(() => expect(options()).toContain("epel — https://r.test/"));
    expect(options()).not.toContain("files — https://f.test/");
    expect(listAllMock).toHaveBeenCalledTimes(1);
  });
});
