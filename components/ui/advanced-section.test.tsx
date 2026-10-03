// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AdvancedSection } from "@/components/ui/advanced-section";

afterEach(() => {
  cleanup();
});

const details = (container: HTMLElement) => container.querySelector("details")!;

describe("AdvancedSection", () => {
  it("is closed with nothing set", () => {
    const { container } = render(
      <AdvancedSection>
        <input aria-label="x" />
      </AdvancedSection>
    );
    expect(details(container).open).toBe(false);
    expect(screen.getByText("Advanced")).toBeTruthy();
  });

  it("opens on first render and counts non-default fields", () => {
    const { container } = render(
      <AdvancedSection setCount={2}>
        <input aria-label="x" />
      </AdvancedSection>
    );
    expect(details(container).open).toBe(true);
    expect(screen.getByText("Advanced (2 set)")).toBeTruthy();
  });

  it("opens for an error even with nothing set", () => {
    const { container } = render(
      <AdvancedSection hasError>
        <input aria-label="x" />
      </AdvancedSection>
    );
    expect(details(container).open).toBe(true);
    expect(screen.getByText("Advanced")).toBeTruthy();
  });

  it("opens when an error appears after a closed first render", () => {
    const { container, rerender } = render(<AdvancedSection>x</AdvancedSection>);
    expect(details(container).open).toBe(false);
    rerender(<AdvancedSection hasError>x</AdvancedSection>);
    expect(details(container).open).toBe(true);
  });

  it("lets the user toggle, and does not re-close or re-open on re-render", () => {
    const { container, rerender } = render(<AdvancedSection setCount={1}>x</AdvancedSection>);
    const d = details(container);
    d.open = false; // user collapses it
    rerender(<AdvancedSection setCount={1}>y</AdvancedSection>);
    expect(d.open).toBe(false);
    fireEvent.click(screen.getByText("Advanced (1 set)"));
    d.open = true;
    rerender(<AdvancedSection setCount={0}>y</AdvancedSection>);
    expect(d.open).toBe(true);
  });
});
