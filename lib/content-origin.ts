/**
 * Optional override for the origin (scheme, host, port) of the content URLs Pulp reports
 * (`base_url`, `content_settings.content_origin`). Pulp derives those from its own point of
 * view, so an admin reaching this UI through a reverse proxy or a different hostname than Pulp
 * itself would otherwise see unreachable URLs. Setting `PULP_CONTENT_ORIGIN` rewrites just the
 * origin, leaving the path (which carries `content_path_prefix`/`base_path`) untouched. Unset,
 * this is a no-op pass-through.
 */

let lastWarnedRawValue: string | null = null;

export function getContentOriginOverride(): string | null {
  const rawValue = process.env.PULP_CONTENT_ORIGIN?.trim();
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = new URL(rawValue);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error(`unsupported protocol "${parsed.protocol}"`);
    }
    return parsed.origin;
  } catch {
    if (rawValue !== lastWarnedRawValue) {
      console.warn(`Ignoring invalid PULP_CONTENT_ORIGIN value: ${rawValue}`);
      lastWarnedRawValue = rawValue;
    }
    return null;
  }
}

export function applyContentOrigin(url: string | null | undefined): string | null {
  if (url == null) {
    return null;
  }

  const override = getContentOriginOverride();
  if (!override || url.trim().length === 0) {
    return url;
  }

  try {
    const parsed = new URL(url);
    return `${override}${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return url;
  }
}
