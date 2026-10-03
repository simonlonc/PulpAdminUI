// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RepositoryEditDebForm } from "@/components/pulp/repository-edit-deb-form";
import { RepositoryEditFileForm } from "@/components/pulp/repository-edit-file-form";
import { RepositoryEditRpmForm } from "@/components/pulp/repository-edit-rpm-form";
import type { RepositoryUpdatePayload } from "@/services/pulp/types";

afterEach(() => {
  cleanup();
});

const base: RepositoryUpdatePayload = {
  name: "repo",
  description: null,
  retain_repo_versions: null,
  retain_checkpoints: null,
  remote: null,
  autopublish: false,
  structured_repo: false,
  retain_package_versions: 0,
  gpgcheck: 0,
  repo_gpgcheck: 0,
  sqlite_metadata: false,
};

const formProps = {
  remotes: [],
  pulpHref: "/pulp/api/v3/repositories/x/y/abc/",
  canOnRepo: () => true,
  isSubmitting: false,
  saveAlsoPublish: false,
  setSaveAlsoPublish: () => {},
  saveAlsoDistribute: false,
  setSaveAlsoDistribute: () => {},
  onSubmit: () => {},
};

const forms = {
  file: (value: RepositoryUpdatePayload, onChange = () => {}) => (
    <RepositoryEditFileForm {...formProps} value={value} onChange={onChange} />
  ),
  deb: (value: RepositoryUpdatePayload, onChange = () => {}) => (
    <RepositoryEditDebForm {...formProps} value={value} onChange={onChange} />
  ),
  rpm: (value: RepositoryUpdatePayload, onChange = () => {}) => (
    <RepositoryEditRpmForm {...formProps} value={value} onChange={onChange} />
  ),
};

const details = (container: HTMLElement) => container.querySelector("details")!;

describe.each(Object.keys(forms) as (keyof typeof forms)[])("repository edit form (%s) retain_checkpoints", (kind) => {
  it("keeps the Advanced section closed when retain_checkpoints is unset", () => {
    const { container } = render(forms[kind](base));
    expect(details(container).open).toBe(false);
    expect(screen.getByText("Advanced")).toBeTruthy();
  });

  it("opens the section, counts the field and shows the stored value when it is set", () => {
    const { container } = render(forms[kind]({ ...base, retain_checkpoints: 4 }));
    expect(details(container).open).toBe(true);
    expect(screen.getByText("Advanced (1 set)")).toBeTruthy();
    const input = screen.getByLabelText("Retain checkpoints (optional)") as HTMLInputElement;
    expect(input.value).toBe("4");
    expect(input.min).toBe("1");
    expect(input.placeholder).toBe("Keep all");
  });

  it("reports a typed number, and null when cleared", () => {
    const onChange = vi.fn();
    render(forms[kind]({ ...base, retain_checkpoints: 4 }, onChange));
    const input = screen.getByLabelText("Retain checkpoints (optional)");
    fireEvent.change(input, { target: { value: "7" } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ retain_checkpoints: 7 }));
    fireEvent.change(input, { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ retain_checkpoints: null }));
  });

  it("shows a bad stored or typed value with a message and an open section instead of rewriting it", () => {
    const { container } = render(forms[kind]({ ...base, retain_checkpoints: 0 }));
    expect(details(container).open).toBe(true);
    expect(screen.getByRole("alert").textContent).toBe("Retain checkpoints must be a whole number of at least 1.");
    expect((screen.getByLabelText("Retain checkpoints (optional)") as HTMLInputElement).value).toBe("0");
  });
});
