// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ListQueryBar } from "@/components/pulp/list-query-bar";

afterEach(() => {
  cleanup();
});

describe("ListQueryBar", () => {
  it("submits search, q and labelSelect together in a single onFiltersChange call", () => {
    // Regression: handleSubmit used to fire onSearchChange, onQChange and
    // onLabelSelectChange separately. Each setter spread the same pre-submit
    // query and called router.replace, so only the last call's key survived
    // and the other two were silently discarded. There must be exactly one
    // onFiltersChange call carrying every shown filter.
    const onFiltersChange = vi.fn();
    render(
      <ListQueryBar
        search=""
        pageSize={100}
        onPageSizeChange={vi.fn()}
        onFiltersChange={onFiltersChange}
        showSearch
        showQ
        showLabelSelect
      />
    );

    fireEvent.change(screen.getByPlaceholderText("Search by name"), {
      target: { value: "epel" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Advanced filter" }));
    fireEvent.change(screen.getByPlaceholderText("state=completed AND name__contains=sync"), {
      target: { value: "name=rpm" },
    });
    fireEvent.change(screen.getByPlaceholderText("env=prod"), {
      target: { value: "env=prod" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(onFiltersChange).toHaveBeenCalledTimes(1);
    expect(onFiltersChange).toHaveBeenCalledWith({
      search: "epel",
      q: "name=rpm",
      labelSelect: "env=prod",
    });
  });

  it("omits the labelSelect key when showLabelSelect is not set", () => {
    const onFiltersChange = vi.fn();
    render(
      <ListQueryBar
        search=""
        pageSize={100}
        onPageSizeChange={vi.fn()}
        onFiltersChange={onFiltersChange}
        showSearch
        showQ
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Advanced filter" }));
    fireEvent.change(screen.getByPlaceholderText("Search by name"), {
      target: { value: "epel" },
    });
    fireEvent.change(screen.getByPlaceholderText("state=completed AND name__contains=sync"), {
      target: { value: "name=rpm" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(onFiltersChange).toHaveBeenCalledTimes(1);
    const patch = onFiltersChange.mock.calls[0][0];
    expect(Object.keys(patch).sort()).toEqual(["q", "search"]);
    expect(patch).not.toHaveProperty("labelSelect");
  });

  it("omits the search key when showSearch is false", () => {
    const onFiltersChange = vi.fn();
    render(
      <ListQueryBar
        search=""
        pageSize={100}
        onPageSizeChange={vi.fn()}
        onFiltersChange={onFiltersChange}
        showSearch={false}
        showQ
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Advanced filter" }));
    fireEvent.change(screen.getByPlaceholderText("state=completed AND name__contains=sync"), {
      target: { value: "name=rpm" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(onFiltersChange).toHaveBeenCalledTimes(1);
    const patch = onFiltersChange.mock.calls[0][0];
    expect(Object.keys(patch)).toEqual(["q"]);
    expect(patch).not.toHaveProperty("search");
  });

  it("trims whitespace from every draft before submitting", () => {
    const onFiltersChange = vi.fn();
    render(
      <ListQueryBar
        search=""
        pageSize={100}
        onPageSizeChange={vi.fn()}
        onFiltersChange={onFiltersChange}
        showSearch
        showQ
        showLabelSelect
      />
    );

    fireEvent.change(screen.getByPlaceholderText("Search by name"), {
      target: { value: "  epel  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Advanced filter" }));
    fireEvent.change(screen.getByPlaceholderText("state=completed AND name__contains=sync"), {
      target: { value: "  name=rpm  " },
    });
    fireEvent.change(screen.getByPlaceholderText("env=prod"), {
      target: { value: "  env=prod  " },
    });

    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(onFiltersChange).toHaveBeenCalledWith({
      search: "epel",
      q: "name=rpm",
      labelSelect: "env=prod",
    });
  });

  it("clears only the search filter when the search Clear button is clicked", () => {
    const onFiltersChange = vi.fn();
    render(
      <ListQueryBar
        search="epel"
        pageSize={100}
        onPageSizeChange={vi.fn()}
        onFiltersChange={onFiltersChange}
        showSearch
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(onFiltersChange).toHaveBeenCalledTimes(1);
    expect(onFiltersChange).toHaveBeenCalledWith({ search: "" });
  });

  it("clears only the q filter when the advanced filter Clear button is clicked", () => {
    const onFiltersChange = vi.fn();
    render(
      <ListQueryBar
        search=""
        pageSize={100}
        onPageSizeChange={vi.fn()}
        onFiltersChange={onFiltersChange}
        showSearch
        showQ
        q="name=rpm"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(onFiltersChange).toHaveBeenCalledTimes(1);
    expect(onFiltersChange).toHaveBeenCalledWith({ q: "" });
  });

  it("clears only the labelSelect filter when the label Clear button is clicked", () => {
    const onFiltersChange = vi.fn();
    render(
      <ListQueryBar
        search=""
        pageSize={100}
        onPageSizeChange={vi.fn()}
        onFiltersChange={onFiltersChange}
        showSearch
        showLabelSelect
        labelSelect="env=prod"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(onFiltersChange).toHaveBeenCalledTimes(1);
    expect(onFiltersChange).toHaveBeenCalledWith({ labelSelect: "" });
  });
});
