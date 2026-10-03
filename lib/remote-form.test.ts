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
  extraFieldsPayload,
  numericInputProblem,
  parseConcurrency,
  parseFloatInput,
  parseIntegerInput,
  parseNullableFloat,
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

  it("rejects a fractional value rather than truncating it", () => {
    expect(parseConcurrency("10.7")).toBeNull();
  });

  it("parses a valid integer", () => {
    expect(parseConcurrency("10")).toBe(10);
  });

  it("returns null for a huge digit string instead of overflowing to a non-safe-integer (F-9)", () => {
    // Repro: "9".repeat(56) previously produced 1e+56 via Number.trunc, silently overflowing.
    expect(parseConcurrency("9".repeat(56))).toBeNull();
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

  it("rejects a fractional value rather than truncating it", () => {
    expect(parseNullableInteger("7.9")).toBeNull();
  });

  it("enforces a minimum when given", () => {
    expect(parseNullableInteger("-3", -3)).toBe(-3);
    expect(parseNullableInteger("-4", -3)).toBeNull();
  });

  it("returns null for a huge digit string instead of overflowing to a non-safe-integer (F-9)", () => {
    // Repro: "9".repeat(56) previously produced 1e+56 via Number.trunc, silently overflowing.
    expect(parseNullableInteger("9".repeat(56))).toBeNull();
  });
});

describe("parseIntegerInput", () => {
  it("treats blank as ok with no value, never zero", () => {
    expect(parseIntegerInput("")).toEqual({ ok: true, value: null });
    expect(parseIntegerInput("  ")).toEqual({ ok: true, value: null });
  });

  it("accepts a safe integer and the safe-integer boundary", () => {
    expect(parseIntegerInput("42")).toEqual({ ok: true, value: 42 });
    expect(parseIntegerInput(String(Number.MAX_SAFE_INTEGER))).toEqual({
      ok: true,
      value: Number.MAX_SAFE_INTEGER,
    });
  });

  it("rejects one past the safe-integer boundary, 1e+56, exponent and hex forms", () => {
    expect(parseIntegerInput("9007199254740992")).toEqual({ ok: false });
    expect(parseIntegerInput("9".repeat(56))).toEqual({ ok: false });
    expect(parseIntegerInput("1e+56")).toEqual({ ok: false });
    expect(parseIntegerInput("0x10")).toEqual({ ok: false });
    expect(parseIntegerInput("Infinity")).toEqual({ ok: false });
  });

  it("rejects 1.5 and non-numeric text", () => {
    expect(parseIntegerInput("1.5")).toEqual({ ok: false });
    expect(parseIntegerInput("abc")).toEqual({ ok: false });
  });

  it("enforces the minimum: 1 rejects 0, 0 accepts 0 and rejects -1", () => {
    expect(parseIntegerInput("0", 1)).toEqual({ ok: false });
    expect(parseIntegerInput("1", 1)).toEqual({ ok: true, value: 1 });
    expect(parseIntegerInput("0", 0)).toEqual({ ok: true, value: 0 });
    expect(parseIntegerInput("-1", 0)).toEqual({ ok: false });
  });
});

describe("parseFloatInput", () => {
  it("treats blank as ok with no value, never zero", () => {
    expect(parseFloatInput("")).toEqual({ ok: true, value: null });
  });

  it("accepts 1.5 without truncating, and forms like .5, 2. and 1e3", () => {
    expect(parseFloatInput("1.5")).toEqual({ ok: true, value: 1.5 });
    expect(parseFloatInput(".5")).toEqual({ ok: true, value: 0.5 });
    expect(parseFloatInput("2.")).toEqual({ ok: true, value: 2 });
    expect(parseFloatInput("1e3")).toEqual({ ok: true, value: 1000 });
  });

  it("rejects non-finite results and non-numeric text", () => {
    expect(parseFloatInput("1e999")).toEqual({ ok: false });
    expect(parseFloatInput("Infinity")).toEqual({ ok: false });
    expect(parseFloatInput("NaN")).toEqual({ ok: false });
    expect(parseFloatInput("1.5s")).toEqual({ ok: false });
    expect(parseFloatInput("0x10")).toEqual({ ok: false });
  });

  it("enforces a minimum of 0: accepts 0 and 0.5, rejects a negative", () => {
    expect(parseFloatInput("0", 0)).toEqual({ ok: true, value: 0 });
    expect(parseFloatInput("0.5", 0)).toEqual({ ok: true, value: 0.5 });
    expect(parseFloatInput("-0.5", 0)).toEqual({ ok: false });
  });

  it("accepts a negative when there is no minimum", () => {
    expect(parseFloatInput("-2.5")).toEqual({ ok: true, value: -2.5 });
  });
});

describe("parseNullableFloat", () => {
  it("returns the number, or null for blank or invalid", () => {
    expect(parseNullableFloat("1.5")).toBe(1.5);
    expect(parseNullableFloat("")).toBeNull();
    expect(parseNullableFloat("abc")).toBeNull();
    expect(parseNullableFloat("-1", 0)).toBeNull();
  });
});

describe("numericInputProblem", () => {
  const numericPlugin: PulpPluginDescriptor = {
    ...baseDescriptor,
    extraRemoteFields: [
      { name: "total_timeout", type: "float", label: "Total Timeout", minimum: 0 },
      { name: "max_retries", type: "integer", label: "Max Retries" },
    ],
  };
  const numericForm = (over: Partial<RemoteFormState> = {}, extra = {}): RemoteFormState => ({
    ...baseForm(numericPlugin),
    ...over,
    extra: { total_timeout: "", max_retries: "", ...extra },
  });

  it("is null when everything is blank or valid", () => {
    expect(numericInputProblem(numericForm(), numericPlugin)).toBeNull();
    expect(
      numericInputProblem(
        numericForm({ download_concurrency: "4" }, { total_timeout: "0.5", max_retries: "0" }),
        numericPlugin
      )
    ).toBeNull();
  });

  it("names a bad download concurrency instead of dropping it", () => {
    expect(numericInputProblem(numericForm({ download_concurrency: "abc" }), numericPlugin)).toBe(
      "Download concurrency must be a whole number of at least 1."
    );
    expect(numericInputProblem(numericForm({ download_concurrency: "0" }), numericPlugin)).toMatch(
      /at least 1/
    );
    expect(
      numericInputProblem(numericForm({ download_concurrency: "9".repeat(56) }), numericPlugin)
    ).toMatch(/Download concurrency/);
  });

  it("names a bad extra field with its minimum", () => {
    expect(numericInputProblem(numericForm({}, { total_timeout: "-1" }), numericPlugin)).toBe(
      "Total Timeout must be a number of at least 0."
    );
    expect(numericInputProblem(numericForm({}, { max_retries: "1.5" }), numericPlugin)).toBe(
      "Max Retries must be a whole number."
    );
  });
});

describe("extraFieldsPayload float and minimum", () => {
  const floatPlugin: PulpPluginDescriptor = {
    ...baseDescriptor,
    extraRemoteFields: [{ name: "total_timeout", type: "float", label: "Total", minimum: 0 }],
  };

  it("sends a float untruncated, and omits a blank one", () => {
    const form = (text: string): RemoteFormState => ({
      ...baseForm(floatPlugin),
      extra: { total_timeout: text },
    });
    expect(extraFieldsPayload(form("1.5"), floatPlugin)).toEqual({ total_timeout: 1.5 });
    expect(extraFieldsPayload(form(""), floatPlugin)).toEqual({});
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
