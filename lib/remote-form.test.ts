import { describe, expect, it } from "vitest";

import {
  emptyExtraFields,
  emptyRemoteForm,
  extraFieldsFromRemote,
  formFromRemote,
  formToCreatePayload,
  formToUpdatePayload,
  invalidJsonExtraField,
  missingRequiredExtraField,
  parseConcurrency,
  parseNullableInteger,
  trimOrNull,
  type RemoteFormState,
} from "@/lib/remote-form";
import type { PulpPluginDescriptor } from "@/lib/pulp-plugins";
import type { PulpRemote } from "@/services/pulp/types";

const baseDescriptor: Omit<PulpPluginDescriptor, "extraRemoteFields"> = {
  kind: "widget",
  label: "Widget",
  article: "a",
  repositoryPath: "/repositories/widget/widget/",
  remotePath: "/remotes/widget/widget/",
  remoteUrlPlaceholder: "https://example.com/widgets/",
  publicationPath: null,
  distributionPath: "/distributions/widget/widget/",
  contentEndpoints: [],
  supportsPublish: false,
  supportsSync: false,
  syncFields: [],
  extraRepoFields: [],
};

const noExtraFieldsPlugin: PulpPluginDescriptor = { ...baseDescriptor, extraRemoteFields: [] };

const booleanFieldPlugin: PulpPluginDescriptor = {
  ...baseDescriptor,
  extraRemoteFields: [{ name: "sync_sources", type: "boolean", label: "Sync sources" }],
};

const stringListFieldPlugin: PulpPluginDescriptor = {
  ...baseDescriptor,
  extraRemoteFields: [
    { name: "package_types", type: "string_list", label: "Package types", placeholder: "sdist" },
  ],
};

const jsonFieldPlugin: PulpPluginDescriptor = {
  ...baseDescriptor,
  extraRemoteFields: [
    { name: "includes", type: "json", label: "Includes", placeholder: '{"rails":"~>7.0"}' },
  ],
};

/** One field of every type, keyed to real optional PulpRemote properties so fixtures type-check. */
const multiFieldPlugin: PulpPluginDescriptor = {
  ...baseDescriptor,
  extraRemoteFields: [
    { name: "sync_sources", type: "boolean", label: "Sync sources" },
    { name: "package_types", type: "string_list", label: "Package types" },
    { name: "includes", type: "json", label: "Includes" },
    { name: "gpgkey", type: "string", label: "GPG key" },
    { name: "keep_latest_packages", type: "integer", label: "Keep latest packages" },
    { name: "distributions", type: "string", required: true, label: "Distributions" },
  ],
};

const requiredStringListFieldPlugin: PulpPluginDescriptor = {
  ...baseDescriptor,
  extraRemoteFields: [
    { name: "package_types", type: "string_list", required: true, label: "Package types" },
  ],
};

const requiredBooleanFieldPlugin: PulpPluginDescriptor = {
  ...baseDescriptor,
  extraRemoteFields: [{ name: "sync_sources", type: "boolean", required: true, label: "Sync sources" }],
};

function baseForm(plugin: PulpPluginDescriptor): RemoteFormState {
  return emptyRemoteForm(plugin);
}

const minimalRemote: PulpRemote = {
  pulp_href: "/pulp/api/v3/remotes/widget/widget/00000000-0000-0000-0000-000000000000/",
  pulp_created: "2024-01-01T00:00:00Z",
  pulp_last_updated: null,
  name: "minimal",
  url: "https://example.com/",
  policy: "immediate",
  tls_validation: true,
  pulp_labels: {},
  ca_cert: null,
  client_cert: null,
  proxy_url: null,
  download_concurrency: null,
};

const fullRemote: PulpRemote = {
  pulp_href: "/pulp/api/v3/remotes/widget/widget/11111111-1111-1111-1111-111111111111/",
  pulp_created: "2024-01-01T00:00:00Z",
  pulp_last_updated: "2024-01-02T00:00:00Z",
  name: "full-remote",
  url: "https://example.com/widgets/",
  policy: "on_demand",
  tls_validation: false,
  pulp_labels: { env: "prod" },
  ca_cert: "CA-CERT-TEXT",
  client_cert: "CLIENT-CERT-TEXT",
  proxy_url: "http://proxy.example.com:3128",
  download_concurrency: 5,
  sync_sources: true,
  package_types: ["sdist", "bdist_wheel"],
  includes: { rails: "~>7.0" },
  gpgkey: "GPG-KEY-TEXT",
  keep_latest_packages: 3,
  distributions: "bookworm",
};

describe("emptyExtraFields", () => {
  it("is empty for a plugin with no extra fields", () => {
    expect(emptyExtraFields(noExtraFieldsPlugin)).toEqual({});
  });

  it("defaults a boolean extra field to false", () => {
    expect(emptyExtraFields(booleanFieldPlugin)).toEqual({ sync_sources: false });
  });

  it("defaults a string_list extra field to an empty array", () => {
    expect(emptyExtraFields(stringListFieldPlugin)).toEqual({ package_types: [] });
  });

  it("defaults a json extra field to an empty string", () => {
    expect(emptyExtraFields(jsonFieldPlugin)).toEqual({ includes: "" });
  });
});

describe("emptyRemoteForm", () => {
  it("returns blank common fields and the plugin's empty extra fields", () => {
    expect(emptyRemoteForm(noExtraFieldsPlugin)).toEqual({
      name: "",
      url: "",
      policy: "immediate",
      tls_validation: true,
      proxy_url: "",
      username: "",
      password: "",
      ca_cert: "",
      client_cert: "",
      client_key: "",
      download_concurrency: "",
      extra: {},
    });
  });

  it("includes the plugin's extra field defaults", () => {
    expect(emptyRemoteForm(multiFieldPlugin).extra).toEqual({
      sync_sources: false,
      package_types: [],
      includes: "",
      gpgkey: "",
      keep_latest_packages: "",
      distributions: "",
    });
  });
});

describe("extraFieldsFromRemote", () => {
  it("reads every field type off a populated remote", () => {
    expect(extraFieldsFromRemote(fullRemote, multiFieldPlugin)).toEqual({
      sync_sources: true,
      package_types: ["sdist", "bdist_wheel"],
      includes: JSON.stringify({ rails: "~>7.0" }, null, 2),
      gpgkey: "GPG-KEY-TEXT",
      keep_latest_packages: "3",
      distributions: "bookworm",
    });
  });

  it("falls back to type-appropriate blanks when fields are absent", () => {
    expect(extraFieldsFromRemote(minimalRemote, multiFieldPlugin)).toEqual({
      sync_sources: false,
      package_types: [],
      includes: "",
      gpgkey: "",
      keep_latest_packages: "",
      distributions: "",
    });
  });
});

describe("formFromRemote", () => {
  it("round-trips a populated remote into form state, blanking write-only secrets", () => {
    expect(formFromRemote(fullRemote, multiFieldPlugin)).toEqual({
      name: "full-remote",
      url: "https://example.com/widgets/",
      policy: "on_demand",
      tls_validation: false,
      proxy_url: "http://proxy.example.com:3128",
      username: "",
      password: "",
      ca_cert: "CA-CERT-TEXT",
      client_cert: "CLIENT-CERT-TEXT",
      client_key: "",
      download_concurrency: "5",
      extra: {
        sync_sources: true,
        package_types: ["sdist", "bdist_wheel"],
        includes: JSON.stringify({ rails: "~>7.0" }, null, 2),
        gpgkey: "GPG-KEY-TEXT",
        keep_latest_packages: "3",
        distributions: "bookworm",
      },
    });
  });

  it("blanks null/absent optional fields instead of rendering them literally", () => {
    expect(formFromRemote(minimalRemote, multiFieldPlugin)).toEqual({
      name: "minimal",
      url: "https://example.com/",
      policy: "immediate",
      tls_validation: true,
      proxy_url: "",
      username: "",
      password: "",
      ca_cert: "",
      client_cert: "",
      client_key: "",
      download_concurrency: "",
      extra: {
        sync_sources: false,
        package_types: [],
        includes: "",
        gpgkey: "",
        keep_latest_packages: "",
        distributions: "",
      },
    });
  });
});

describe("trimOrNull", () => {
  it("returns null for an empty string", () => {
    expect(trimOrNull("")).toBeNull();
  });

  it("returns null for a whitespace-only string", () => {
    expect(trimOrNull("   ")).toBeNull();
  });

  it("trims surrounding whitespace from a valid value", () => {
    expect(trimOrNull("  hello  ")).toBe("hello");
  });

  it("returns an already-trimmed value unchanged", () => {
    expect(trimOrNull("hello")).toBe("hello");
  });
});

describe("parseConcurrency", () => {
  it("returns null for an empty string", () => {
    expect(parseConcurrency("")).toBeNull();
  });

  it("returns null for a whitespace-only string", () => {
    expect(parseConcurrency("   ")).toBeNull();
  });

  it("returns null for a non-numeric string", () => {
    expect(parseConcurrency("abc")).toBeNull();
  });

  it("returns null for zero", () => {
    expect(parseConcurrency("0")).toBeNull();
  });

  it("returns null for a negative number", () => {
    expect(parseConcurrency("-5")).toBeNull();
  });

  it("truncates a valid fractional value", () => {
    expect(parseConcurrency("10.7")).toBe(10);
  });

  it("parses a valid integer", () => {
    expect(parseConcurrency("10")).toBe(10);
  });
});

describe("parseNullableInteger", () => {
  it("returns null for an empty string", () => {
    expect(parseNullableInteger("")).toBeNull();
  });

  it("returns null for a whitespace-only string", () => {
    expect(parseNullableInteger("   ")).toBeNull();
  });

  it("returns null for a non-numeric string", () => {
    expect(parseNullableInteger("abc")).toBeNull();
  });

  it("accepts zero, unlike parseConcurrency", () => {
    expect(parseNullableInteger("0")).toBe(0);
  });

  it("accepts a negative number, unlike parseConcurrency", () => {
    expect(parseNullableInteger("-3")).toBe(-3);
  });

  it("truncates a valid fractional value", () => {
    expect(parseNullableInteger("7.9")).toBe(7);
  });
});

describe("missingRequiredExtraField", () => {
  it("returns null when there are no required extra fields", () => {
    expect(missingRequiredExtraField(baseForm(noExtraFieldsPlugin), noExtraFieldsPlugin)).toBeNull();
  });

  it("returns the field when a required string field is blank", () => {
    const form = baseForm(multiFieldPlugin);
    expect(missingRequiredExtraField(form, multiFieldPlugin)?.name).toBe("distributions");
  });

  it("returns null when the required string field is filled in", () => {
    const form = baseForm(multiFieldPlugin);
    form.extra.distributions = "bookworm";
    expect(missingRequiredExtraField(form, multiFieldPlugin)).toBeNull();
  });

  it("returns the field when a required string_list field has no non-blank entries", () => {
    const form = baseForm(requiredStringListFieldPlugin);
    form.extra.package_types = ["", "   "];
    expect(missingRequiredExtraField(form, requiredStringListFieldPlugin)?.name).toBe("package_types");
  });

  it("returns null when the required string_list field has a non-blank entry", () => {
    const form = baseForm(requiredStringListFieldPlugin);
    form.extra.package_types = ["sdist"];
    expect(missingRequiredExtraField(form, requiredStringListFieldPlugin)).toBeNull();
  });

  it("never flags a required boolean field as missing", () => {
    const form = baseForm(requiredBooleanFieldPlugin);
    form.extra.sync_sources = false;
    expect(missingRequiredExtraField(form, requiredBooleanFieldPlugin)).toBeNull();
  });
});

describe("invalidJsonExtraField", () => {
  it("returns null when there are no json fields", () => {
    expect(invalidJsonExtraField(baseForm(noExtraFieldsPlugin), noExtraFieldsPlugin)).toBeNull();
  });

  it("returns null when the json field is blank", () => {
    const form = baseForm(jsonFieldPlugin);
    expect(invalidJsonExtraField(form, jsonFieldPlugin)).toBeNull();
  });

  it("returns null when the json field parses", () => {
    const form = baseForm(jsonFieldPlugin);
    form.extra.includes = '{"rails": "~>7.0"}';
    expect(invalidJsonExtraField(form, jsonFieldPlugin)).toBeNull();
  });

  it("returns the field when its text is malformed JSON", () => {
    const form = baseForm(jsonFieldPlugin);
    form.extra.includes = "{not json}";
    expect(invalidJsonExtraField(form, jsonFieldPlugin)?.name).toBe("includes");
  });
});

describe("formToCreatePayload", () => {
  it("trims name/url, nulls blank optional fields, and merges extra fields", () => {
    const form = baseForm(multiFieldPlugin);
    form.name = "  my-remote  ";
    form.url = "  https://example.com/  ";
    form.extra.distributions = "bookworm";

    const payload = formToCreatePayload(form, multiFieldPlugin);
    expect(payload.name).toBe("my-remote");
    expect(payload.url).toBe("https://example.com/");
    expect(payload.policy).toBe("immediate");
    expect(payload.tls_validation).toBe(true);
    expect(payload.proxy_url).toBeNull();
    expect(payload.username).toBeNull();
    expect(payload.password).toBeNull();
    expect(payload.ca_cert).toBeNull();
    expect(payload.client_cert).toBeNull();
    expect(payload.client_key).toBeNull();
    expect(payload.download_concurrency).toBeNull();
    expect(payload.distributions).toBe("bookworm");
  });

  it("sends secrets as typed on create (there is nothing to preserve yet)", () => {
    const form = baseForm(noExtraFieldsPlugin);
    form.name = "my-remote";
    form.url = "https://example.com/";
    form.username = "admin";
    form.password = "secret";
    form.client_key = "  KEY  ";

    const payload = formToCreatePayload(form, noExtraFieldsPlugin);
    expect(payload.username).toBe("admin");
    expect(payload.password).toBe("secret");
    expect(payload.client_key).toBe("KEY");
  });
});

describe("formToUpdatePayload", () => {
  it("omits username, password and client_key when left blank, so Pulp leaves them unchanged", () => {
    const form = baseForm(noExtraFieldsPlugin);
    form.name = "my-remote";
    form.url = "https://example.com/";
    // username/password/client_key left at their empty-form default.

    const payload = formToUpdatePayload(form, noExtraFieldsPlugin);
    expect("username" in payload).toBe(false);
    expect("password" in payload).toBe(false);
    expect("client_key" in payload).toBe(false);
  });

  it("sends username, password and client_key only when the user typed a new value", () => {
    const form = baseForm(noExtraFieldsPlugin);
    form.name = "my-remote";
    form.url = "https://example.com/";
    form.username = "  admin  ";
    form.password = "  newsecret  ";
    form.client_key = "  NEWKEY  ";

    const payload = formToUpdatePayload(form, noExtraFieldsPlugin);
    expect(payload.username).toBe("admin");
    expect(payload.password).toBe("newsecret");
    expect(payload.client_key).toBe("NEWKEY");
  });

  it("whitespace-only secrets count as blank and are also omitted", () => {
    const form = baseForm(noExtraFieldsPlugin);
    form.name = "my-remote";
    form.url = "https://example.com/";
    form.password = "   ";

    const payload = formToUpdatePayload(form, noExtraFieldsPlugin);
    expect("password" in payload).toBe(false);
  });

  it("documents today's behavior: ca_cert and client_cert are NOT preserved when blanked (unlike username/password/client_key)", () => {
    // Editing a remote that already has a ca_cert/client_cert, with the field cleared in the
    // form, sends an explicit null and clears it server-side on update. This differs from the
    // username/password/client_key handling above and looks like it could be an oversight, but
    // this test only pins down the current behavior rather than changing it.
    const form = formFromRemote(fullRemote, noExtraFieldsPlugin);
    form.ca_cert = "";
    form.client_cert = "";

    const payload = formToUpdatePayload(form, noExtraFieldsPlugin);
    expect(payload.ca_cert).toBeNull();
    expect(payload.client_cert).toBeNull();
  });

  it("merges extra field values into the payload", () => {
    const form = baseForm(booleanFieldPlugin);
    form.name = "my-remote";
    form.url = "https://example.com/";
    form.extra.sync_sources = true;

    const payload = formToUpdatePayload(form, booleanFieldPlugin);
    expect(payload.sync_sources).toBe(true);
  });
});
