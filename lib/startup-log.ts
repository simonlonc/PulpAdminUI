import { getContentOriginOverride } from "@/lib/content-origin";
import { getExportHttpMapping } from "@/lib/export-http";
import { logInfo, resolveLogLevel } from "@/lib/log";
import { getPulpBaseUrl, loggableUrl } from "@/lib/pulp";

// Server-only. Called once per server start from instrumentation.ts. "Is it even reading the
// env var I set" is answered by this line, so it reports what the readers return, never the
// secret itself and never userinfo from PULP_BASE_URL.

function pulpBaseUrlForLog(): string | null {
  try {
    return loggableUrl(getPulpBaseUrl());
  } catch {
    return null;
  }
}

export function logStartupConfig() {
  const exportHttp = getExportHttpMapping();

  logInfo("server_started", {
    pulp_base_url: pulpBaseUrlForLog(),
    project_name: process.env.PULP_PROJECT_NAME || null,
    session_secret_set: Boolean(process.env.PULP_SESSION_SECRET?.trim()),
    log_level: resolveLogLevel(),
    content_origin: getContentOriginOverride(),
    export_http_base_url: exportHttp?.baseUrl ?? null,
    export_http_path_prefix: exportHttp?.pathPrefix ?? null,
    plugin_dir: process.env.PULP_PLUGIN_DIR?.trim() || null,
  });
}
