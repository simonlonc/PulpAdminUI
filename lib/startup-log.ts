import { accessSync, constants, existsSync } from "node:fs";
import { dirname, join } from "node:path";

import { getContentOriginOverride } from "@/lib/content-origin";
import { logInfo, resolveLogLevel } from "@/lib/log";
import { getPulpBaseUrl, loggableUrl } from "@/lib/pulp";

// Server-only. Called once per server start from instrumentation.ts. "Is it even reading the
// env var I set" is answered by this line, so it reports what the readers return, never the
// secret itself and never userinfo from PULP_BASE_URL.

function isWritable(path: string): boolean {
  try {
    accessSync(path, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

// Next writes the dashboard stats cache under .next/cache (see getCachedPulpDashboardStats). A
// missing directory is fine when its parent is writable, since Next creates it.
function dashboardCacheWritable(directory: string): boolean {
  return isWritable(directory) || (!existsSync(directory) && isWritable(dirname(directory)));
}

function pulpBaseUrlForLog(): string | null {
  try {
    return loggableUrl(getPulpBaseUrl());
  } catch {
    return null;
  }
}

export function logStartupConfig() {
  const cacheDirectory = join(process.cwd(), ".next/cache");

  logInfo("server_started", {
    pulp_base_url: pulpBaseUrlForLog(),
    project_name: process.env.PULP_PROJECT_NAME || null,
    session_secret_set: Boolean(process.env.PULP_SESSION_SECRET?.trim()),
    log_level: resolveLogLevel(),
    content_origin: getContentOriginOverride(),
    plugin_dir: process.env.PULP_PLUGIN_DIR?.trim() || null,
    dashboard_cache: cacheDirectory,
    dashboard_cache_writable: dashboardCacheWritable(cacheDirectory),
  });
}
