// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminShell } from "@/components/pulp/admin-shell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));
vi.mock("@/components/pulp/project-context", () => ({
  usePulpProjectName: () => "Pulp",
}));

afterEach(() => {
  cleanup();
});

function renderShell() {
  render(
    <AdminShell
      title="Dashboard"
      description="Overview"
      hasSession
      sessionUser="admin"
      isLoading={false}
      error={null}
      onLogout={vi.fn()}
    >
      <p>Page content</p>
    </AdminShell>
  );
  return screen.getByRole("button", { name: "Navigation menu" });
}

describe("AdminShell navigation drawer", () => {
  it("starts closed and points the toggle at the sidebar", () => {
    const toggle = renderShell();

    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.getElementById(toggle.getAttribute("aria-controls") ?? "")?.tagName).toBe(
      "ASIDE"
    );
    expect(screen.getByText("Page content")).toBeDefined();
  });

  it("opens from the toggle and moves focus into the drawer", () => {
    const toggle = renderShell();

    fireEvent.click(toggle);

    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    // The brand link is the first link in the sidebar.
    expect(document.activeElement).toBe(screen.getAllByRole("link")[0]);
  });

  it("closes on Escape and returns focus to the toggle", () => {
    const toggle = renderShell();
    fireEvent.click(toggle);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(toggle);
  });

  it("closes when a navigation link is clicked", () => {
    const toggle = renderShell();
    fireEvent.click(toggle);

    fireEvent.click(screen.getByRole("link", { name: /Global search/ }));

    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("closes when the backdrop is tapped", () => {
    const toggle = renderShell();
    fireEvent.click(toggle);

    fireEvent.click(document.querySelector("div[aria-hidden='true']") as Element);

    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });
});
