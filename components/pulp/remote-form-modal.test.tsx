// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RemoteFormModal } from "@/components/pulp/remote-form-modal";
import { PULP_PLUGINS } from "@/lib/pulp-plugins";
import type { PulpRemote } from "@/services/pulp/types";

const rpm = PULP_PLUGINS.find((plugin) => plugin.kind === "rpm")!;

vi.mock("@/components/pulp/plugins-context", () => ({
  usePulpPluginsContext: () => ({ getPlugin: () => rpm }),
}));

afterEach(() => {
  cleanup();
});

const remote: PulpRemote = {
  pulp_href: "/pulp/api/v3/remotes/rpm/rpm/00000000-0000-0000-0000-000000000000/",
  pulp_created: "2024-01-01T00:00:00Z",
  pulp_last_updated: null,
  name: "epel",
  url: "https://example.com/",
  policy: "immediate",
  tls_validation: true,
  pulp_labels: {},
  ca_cert: null,
  client_cert: null,
  proxy_url: null,
  download_concurrency: null,
  rate_limit: null,
  max_retries: null,
  connect_timeout: null,
  sock_connect_timeout: null,
  sock_read_timeout: null,
  total_timeout: null,
  headers: [],
};

function renderModal(editing: PulpRemote | null) {
  return render(
    <RemoteFormModal
      kind="rpm"
      editing={editing}
      onClose={() => {}}
      onSaved={() => {}}
      onBusyChange={() => {}}
    />
  );
}

const details = (container: HTMLElement) => container.querySelector("details")!;

describe("RemoteFormModal Advanced section", () => {
  it("is closed when every advanced field is empty", () => {
    const { container } = renderModal(remote);
    expect(details(container).open).toBe(false);
    expect(screen.getByText("Advanced")).toBeTruthy();
  });

  it("is closed on a new remote", () => {
    const { container } = renderModal(null);
    expect(details(container).open).toBe(false);
  });

  it("is open and counts the field when rate_limit is set", () => {
    const { container } = renderModal({ ...remote, rate_limit: 5 });
    expect(details(container).open).toBe(true);
    expect(screen.getByText("Advanced (1 set)")).toBeTruthy();
    expect((screen.getByLabelText("Rate limit (optional)") as HTMLInputElement).value).toBe("5");
  });

  it("is open when Pulp reports a proxy credential as set", () => {
    const { container } = renderModal({
      ...remote,
      hidden_fields: [{ name: "proxy_username", is_set: true }],
    });
    expect(details(container).open).toBe(true);
    expect(
      (screen.getByLabelText("Proxy username (optional)") as HTMLInputElement).placeholder
    ).toMatch(/Leave blank to keep current/);
  });

  it("opens itself on a validation error inside it", () => {
    const { container } = renderModal(remote);
    fireEvent.change(screen.getByLabelText("Rate limit (optional)"), {
      target: { value: "abc" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByRole("alert").textContent).toBe("Rate limit must be a whole number.");
    expect(details(container).open).toBe(true);
  });
});
