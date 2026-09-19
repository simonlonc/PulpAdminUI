// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Pencil, Trash2 } from "lucide-react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { RowActionMenu } from "@/components/pulp/row-action-menu";

// Radix positions its menu with pointer-capture and ResizeObserver APIs that
// jsdom does not implement. Stub them so the menu can open under test.
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
});

function openMenu() {
  const trigger = screen.getByRole("button", { name: "Actions for epel" });
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
  return trigger;
}

describe("RowActionMenu", () => {
  it("reports the open event so callers can fetch permissions lazily", () => {
    // The E4 permission gate hangs the my_permissions fetch on this event: it
    // is the only thing that keeps the request off page load, one per opened
    // menu instead of one per visible row.
    const onOpenChange = vi.fn();
    render(
      <RowActionMenu
        label="epel"
        onOpenChange={onOpenChange}
        items={[{ key: "edit", label: "Edit", icon: Pencil, onSelect: vi.fn() }]}
      />
    );

    openMenu();

    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it("renders action items, link items and separators", () => {
    render(
      <RowActionMenu
        label="epel"
        items={[
          { key: "edit", label: "Edit", icon: Pencil, onSelect: vi.fn() },
          { key: "sep", separator: true },
          { key: "versions", label: "Versions", icon: Pencil, href: "/repositories/versions" },
        ]}
      />
    );

    openMenu();

    expect(screen.getByRole("menuitem", { name: "Edit" })).toBeDefined();
    expect(screen.getByRole("menuitem", { name: "Versions" }).getAttribute("href")).toBe(
      "/repositories/versions"
    );
    expect(screen.getByRole("separator")).toBeDefined();
  });

  it("fires onSelect for an enabled item", () => {
    const onSelect = vi.fn();
    render(
      <RowActionMenu
        label="epel"
        items={[{ key: "edit", label: "Edit", icon: Pencil, onSelect }]}
      />
    );

    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit" }));

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("renders a disabled item instead of omitting it, and does not fire its onSelect", () => {
    // A gated action stays visible so the user can see the action exists and
    // that they may not perform it, rather than the row silently losing it.
    const onSelect = vi.fn();
    render(
      <RowActionMenu
        label="epel"
        items={[{ key: "delete", label: "Delete", icon: Trash2, destructive: true, disabled: true, onSelect }]}
      />
    );

    openMenu();

    const item = screen.getByRole("menuitem", { name: "Delete" });
    expect(item.getAttribute("data-disabled")).not.toBeNull();
    fireEvent.click(item);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("renders a disabled link item as disabled", () => {
    // Repositories gates its Edit item, which is a link rather than an action,
    // so the disabled state has to reach the asChild branch too.
    render(
      <RowActionMenu
        label="epel"
        items={[
          { key: "edit", label: "Edit", icon: Pencil, href: "/repositories/edit", disabled: true },
        ]}
      />
    );

    openMenu();

    expect(screen.getByRole("menuitem", { name: "Edit" }).getAttribute("data-disabled")).not.toBeNull();
  });

  it("skips falsy items so call sites can write conditional actions inline", () => {
    render(
      <RowActionMenu
        label="epel"
        items={[
          { key: "edit", label: "Edit", icon: Pencil, onSelect: vi.fn() },
          false,
          null,
          undefined,
        ]}
      />
    );

    openMenu();

    expect(screen.getAllByRole("menuitem")).toHaveLength(1);
  });

  it("disables the trigger when the row is busy", () => {
    render(
      <RowActionMenu
        label="epel"
        disabled
        items={[{ key: "edit", label: "Edit", icon: Pencil, onSelect: vi.fn() }]}
      />
    );

    expect(screen.getByRole("button", { name: "Actions for epel" }).hasAttribute("disabled")).toBe(
      true
    );
  });
});
