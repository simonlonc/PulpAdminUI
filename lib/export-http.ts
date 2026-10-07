/**
 * Optional mapping from the directory a Pulp export is written to, to an HTTP server that serves
 * that directory. The app server and Pulp run on different hosts, so this app never reads the
 * exported files; publishing one into a File repository hands Pulp's own worker a `file_url` to
 * download instead. `PULP_EXPORT_HTTP_BASE_URL` is the http(s) URL that serves a directory on the
 * Pulp host and `PULP_EXPORT_HTTP_PATH_PREFIX` is that directory's absolute path there, e.g.
 * `/var/lib/pulp/exports`. Either unset, or either invalid, means no mapping: the publish form
 * then asks for each URL by hand.
 */

import { logWarn } from "@/lib/log";

export type ExportHttpMapping = {
  /** Origin and path of the file server, without a trailing slash. */
  baseUrl: string;
  /** Absolute directory on the Pulp host that the file server serves. */
  pathPrefix: string;
};

const warned = new Set<string>();

function warnOnce(event: string, fields: { value?: string; missing?: string }) {
  const key = `${event}:${JSON.stringify(fields)}`;
  if (!warned.has(key)) {
    warned.add(key);
    logWarn(event, fields);
  }
}

/** The origin and path of an http(s) URL (no userinfo, query or hash), or null for anything else. */
function parseBaseUrl(rawValue: string): string | null {
  try {
    const parsed = new URL(rawValue);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export function getExportHttpMapping(): ExportHttpMapping | null {
  const rawBaseUrl = process.env.PULP_EXPORT_HTTP_BASE_URL?.trim();
  const rawPathPrefix = process.env.PULP_EXPORT_HTTP_PATH_PREFIX?.trim();
  if (!rawBaseUrl && !rawPathPrefix) {
    return null;
  }
  if (!rawBaseUrl || !rawPathPrefix) {
    warnOnce("export_http_incomplete", {
      missing: rawBaseUrl ? "PULP_EXPORT_HTTP_PATH_PREFIX" : "PULP_EXPORT_HTTP_BASE_URL",
    });
    return null;
  }

  const baseUrl = parseBaseUrl(rawBaseUrl);
  if (baseUrl === null) {
    warnOnce("export_http_base_url_invalid", { value: rawBaseUrl });
  }
  if (!rawPathPrefix.startsWith("/")) {
    warnOnce("export_http_path_prefix_invalid", { value: rawPathPrefix });
  }
  if (baseUrl === null || !rawPathPrefix.startsWith("/")) {
    return null;
  }

  return { baseUrl, pathPrefix: rawPathPrefix };
}

/**
 * The URL under which `mapping` serves `filePath`, an absolute path on the Pulp host, or null
 * when it does not: the path must sit strictly under the prefix (`/exportsX/a` is not under
 * `/exports`) and must not contain a `.` or `..` segment. Each segment is percent-encoded.
 */
export function exportFileUrl(filePath: string, mapping: ExportHttpMapping): string | null {
  const prefix = mapping.pathPrefix.replace(/\/+$/, "");
  if (!filePath.startsWith(`${prefix}/`)) {
    return null;
  }

  const segments = filePath
    .slice(prefix.length + 1)
    .split("/")
    .filter((segment) => segment.length > 0);
  if (segments.length === 0 || segments.some((segment) => segment === "." || segment === "..")) {
    return null;
  }

  return `${mapping.baseUrl.replace(/\/+$/, "")}/${segments.map(encodeURIComponent).join("/")}`;
}
