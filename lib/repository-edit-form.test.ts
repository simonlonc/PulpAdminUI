import { describe, expect, it } from "vitest";

import { debDetailToForm, fileDetailToForm, rpmDetailToForm } from "@/lib/repository-edit-form";
import type {
  PulpDebRepositoryDetail,
  PulpFileRepositoryDetail,
  PulpRpmRepositoryDetail,
} from "@/services/pulp/types";

const fullRpmDetail: PulpRpmRepositoryDetail = {
  kind: "rpm",
  pulp_href: "/pulp/api/v3/repositories/rpm/rpm/11111111-1111-1111-1111-111111111111/",
  name: "full-rpm",
  pulp_created: "2024-01-01T00:00:00Z",
  versions_href: "/pulp/api/v3/repositories/rpm/rpm/11111111-1111-1111-1111-111111111111/versions/",
  latest_version_href:
    "/pulp/api/v3/repositories/rpm/rpm/11111111-1111-1111-1111-111111111111/versions/3/",
  description: "A full rpm repository",
  retain_repo_versions: 5,
  remote: "/pulp/api/v3/remotes/rpm/rpm/22222222-2222-2222-2222-222222222222/",
  autopublish: true,
  metadata_signing_service: "/pulp/api/v3/signing-services/33333333-3333-3333-3333-333333333333/",
  retain_package_versions: 2,
  metadata_checksum_type: "sha256",
  package_checksum_type: "sha512",
  gpgcheck: 1,
  repo_gpgcheck: 1,
  sqlite_metadata: true,
};

const minimalRpmDetail: PulpRpmRepositoryDetail = {
  kind: "rpm",
  pulp_href: "/pulp/api/v3/repositories/rpm/rpm/44444444-4444-4444-4444-444444444444/",
  name: "minimal-rpm",
  pulp_created: null,
  versions_href: null,
  latest_version_href: null,
  description: null,
  retain_repo_versions: null,
  remote: null,
  autopublish: false,
  metadata_signing_service: null,
  retain_package_versions: 0,
  metadata_checksum_type: null,
  package_checksum_type: null,
  gpgcheck: 0,
  repo_gpgcheck: 0,
  sqlite_metadata: false,
};

const fullDebDetail: PulpDebRepositoryDetail = {
  kind: "deb",
  pulp_href: "/pulp/api/v3/repositories/deb/apt/55555555-5555-5555-5555-555555555555/",
  name: "full-deb",
  description: "A full deb repository",
  retain_repo_versions: 3,
  remote: "/pulp/api/v3/remotes/deb/apt/66666666-6666-6666-6666-666666666666/",
  autopublish: true,
  structured_repo: true,
};

const minimalDebDetail: PulpDebRepositoryDetail = {
  kind: "deb",
  pulp_href: "/pulp/api/v3/repositories/deb/apt/77777777-7777-7777-7777-777777777777/",
  name: "minimal-deb",
  description: null,
  retain_repo_versions: null,
  remote: null,
  autopublish: false,
  structured_repo: false,
};

const fullFileDetail: PulpFileRepositoryDetail = {
  kind: "file",
  pulp_href: "/pulp/api/v3/repositories/file/file/88888888-8888-8888-8888-888888888888/",
  name: "full-file",
  pulp_created: "2024-01-01T00:00:00Z",
  versions_href: "/pulp/api/v3/repositories/file/file/88888888-8888-8888-8888-888888888888/versions/",
  latest_version_href:
    "/pulp/api/v3/repositories/file/file/88888888-8888-8888-8888-888888888888/versions/1/",
  description: "A full file repository",
  retain_repo_versions: 10,
  remote: "/pulp/api/v3/remotes/file/file/99999999-9999-9999-9999-999999999999/",
  autopublish: true,
  manifest: "PULP_MANIFEST",
};

const minimalFileDetail: PulpFileRepositoryDetail = {
  kind: "file",
  pulp_href: "/pulp/api/v3/repositories/file/file/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/",
  name: "minimal-file",
  pulp_created: null,
  versions_href: null,
  latest_version_href: null,
  description: null,
  retain_repo_versions: null,
  remote: null,
  autopublish: false,
  manifest: null,
};

describe("rpmDetailToForm", () => {
  it("maps every field off a fully populated rpm detail", () => {
    expect(rpmDetailToForm(fullRpmDetail)).toEqual({
      name: "full-rpm",
      description: "A full rpm repository",
      retain_repo_versions: 5,
      remote: "/pulp/api/v3/remotes/rpm/rpm/22222222-2222-2222-2222-222222222222/",
      autopublish: true,
      metadata_signing_service: "/pulp/api/v3/signing-services/33333333-3333-3333-3333-333333333333/",
      retain_package_versions: 2,
      metadata_checksum_type: "sha256",
      package_checksum_type: "sha512",
      gpgcheck: 1,
      repo_gpgcheck: 1,
      sqlite_metadata: true,
    });
  });

  it("carries every optional/nullable field through as null when absent", () => {
    expect(rpmDetailToForm(minimalRpmDetail)).toEqual({
      name: "minimal-rpm",
      description: null,
      retain_repo_versions: null,
      remote: null,
      autopublish: false,
      metadata_signing_service: null,
      retain_package_versions: 0,
      metadata_checksum_type: null,
      package_checksum_type: null,
      gpgcheck: 0,
      repo_gpgcheck: 0,
      sqlite_metadata: false,
    });
  });

  it("does not collapse retain_repo_versions 0 into null", () => {
    const detail: PulpRpmRepositoryDetail = { ...fullRpmDetail, retain_repo_versions: 0 };
    expect(rpmDetailToForm(detail).retain_repo_versions).toBe(0);
    expect(rpmDetailToForm(detail).retain_repo_versions).not.toBeNull();
  });

  it("preserves a null remote and an empty-string description without altering them", () => {
    const detail: PulpRpmRepositoryDetail = { ...fullRpmDetail, remote: null, description: "" };
    const form = rpmDetailToForm(detail);
    expect(form.remote).toBeNull();
    expect(form.description).toBe("");
  });
});

describe("debDetailToForm", () => {
  it("maps every field off a fully populated deb detail", () => {
    expect(debDetailToForm(fullDebDetail)).toEqual({
      name: "full-deb",
      description: "A full deb repository",
      retain_repo_versions: 3,
      remote: "/pulp/api/v3/remotes/deb/apt/66666666-6666-6666-6666-666666666666/",
      autopublish: true,
      structured_repo: true,
    });
  });

  it("carries every optional/nullable field through as null when absent", () => {
    expect(debDetailToForm(minimalDebDetail)).toEqual({
      name: "minimal-deb",
      description: null,
      retain_repo_versions: null,
      remote: null,
      autopublish: false,
      structured_repo: false,
    });
  });

  it("does not collapse retain_repo_versions 0 into null", () => {
    const detail: PulpDebRepositoryDetail = { ...fullDebDetail, retain_repo_versions: 0 };
    expect(debDetailToForm(detail).retain_repo_versions).toBe(0);
    expect(debDetailToForm(detail).retain_repo_versions).not.toBeNull();
  });

  it("preserves a null remote and an empty-string description without altering them", () => {
    const detail: PulpDebRepositoryDetail = { ...fullDebDetail, remote: null, description: "" };
    const form = debDetailToForm(detail);
    expect(form.remote).toBeNull();
    expect(form.description).toBe("");
  });
});

describe("fileDetailToForm", () => {
  it("maps every field off a fully populated file detail", () => {
    expect(fileDetailToForm(fullFileDetail)).toEqual({
      name: "full-file",
      description: "A full file repository",
      retain_repo_versions: 10,
      remote: "/pulp/api/v3/remotes/file/file/99999999-9999-9999-9999-999999999999/",
      autopublish: true,
      manifest: "PULP_MANIFEST",
    });
  });

  it("carries every optional/nullable field through as null when absent", () => {
    expect(fileDetailToForm(minimalFileDetail)).toEqual({
      name: "minimal-file",
      description: null,
      retain_repo_versions: null,
      remote: null,
      autopublish: false,
      manifest: null,
    });
  });

  it("does not collapse retain_repo_versions 0 into null", () => {
    const detail: PulpFileRepositoryDetail = { ...fullFileDetail, retain_repo_versions: 0 };
    expect(fileDetailToForm(detail).retain_repo_versions).toBe(0);
    expect(fileDetailToForm(detail).retain_repo_versions).not.toBeNull();
  });

  it("preserves a null remote and an empty-string description without altering them", () => {
    const detail: PulpFileRepositoryDetail = { ...fullFileDetail, remote: null, description: "" };
    const form = fileDetailToForm(detail);
    expect(form.remote).toBeNull();
    expect(form.description).toBe("");
  });
});
