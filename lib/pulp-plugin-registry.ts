/**
 * Serves the plugin registry the whole app reads from: the connected Pulp server's OpenAPI
 * document, derived into descriptors (see lib/pulp-plugin-derive.ts) and merged with the curated
 * PULP_PLUGINS overlay, so the UI describes the server actually connected to instead of only the
 * plugins someone hand-wrote a descriptor for.
 *
 * Server-side only: fetches through pulpFetch, so this must not be imported from client code.
 */

import { pulpFetch, type PulpAuth } from "@/lib/pulp";
import {
  PULP_PLUGINS,
  type PulpContentEndpoint,
  type PulpPluginDescriptor,
} from "@/lib/pulp-plugins";
import { derivePulpPlugins } from "@/lib/pulp-plugin-derive";

const CACHE_TTL_MS = 10 * 60 * 1000;

let cachedRegistry: readonly PulpPluginDescriptor[] | null = null;
let cachedAt = 0;
let inFlight: Promise<readonly PulpPluginDescriptor[]> | null = null;

/**
 * Merges the two content endpoint lists by path: the curated endpoints first, in curated order
 * (so the family's default is the one a human picked), each spread over the derived endpoint of
 * the same path, then the derived endpoints no curated entry names, in their derived order. A
 * wholesale replacement would cost rpm the ten endpoints only derivation knows about.
 */
function mergeContentEndpoints(
  derived: readonly PulpContentEndpoint[],
  curated: readonly PulpContentEndpoint[]
): readonly PulpContentEndpoint[] {
  const derivedByPath = new Map(derived.map((endpoint) => [endpoint.path, endpoint]));
  const curatedPaths = new Set(curated.map((endpoint) => endpoint.path));

  return [
    ...curated.map((endpoint) => ({ ...derivedByPath.get(endpoint.path), ...endpoint })),
    ...derived.filter((endpoint) => !curatedPaths.has(endpoint.path)),
  ];
}

/**
 * Merges a derived family with the curated entry of the same kind, curated fields winning, so a
 * curated descriptor that omits an optional field still lets the derived value through. Ordered
 * with the curated kinds first (in PULP_PLUGINS order, so pages that default to "rpm" keep it
 * first), then the remaining derived kinds sorted by kind. A curated kind the server does not
 * have is dropped, since the registry describes the connected server.
 *
 * contentEndpoints is the one key not merged by replacement -- see mergeContentEndpoints.
 */
function mergeRegistry(derived: readonly PulpPluginDescriptor[]): readonly PulpPluginDescriptor[] {
  const derivedByKind = new Map(derived.map((plugin) => [plugin.kind, plugin]));
  const merged: PulpPluginDescriptor[] = [];
  const usedKinds = new Set<string>();

  for (const curated of PULP_PLUGINS) {
    const base = derivedByKind.get(curated.kind);
    if (!base) continue;
    merged.push({
      ...base,
      ...curated,
      contentEndpoints: mergeContentEndpoints(base.contentEndpoints, curated.contentEndpoints),
    });
    usedKinds.add(curated.kind);
  }

  const remaining = derived
    .filter((plugin) => !usedKinds.has(plugin.kind))
    .sort((a, b) => a.kind.localeCompare(b.kind));

  return [...merged, ...remaining];
}

/**
 * Derives and merges the registry from an already-parsed spec value. ok:false (with no families
 * derived) covers both a spec that fails to parse -- pulpFetch hands that back as undefined --
 * and a well-formed spec that simply derives nothing.
 */
function buildRegistryFromSpec(
  spec: unknown
): { ok: true; registry: readonly PulpPluginDescriptor[] } | { ok: false } {
  const derived = derivePulpPlugins(spec);
  if (derived.length === 0) {
    return { ok: false };
  }
  return { ok: true, registry: mergeRegistry(derived) };
}

/**
 * Fetches the server's OpenAPI document and builds the registry from it. Falls back to the
 * curated PULP_PLUGINS -- uncached, logged once -- on a non-ok response, a spec that derives zero
 * families (parse failures included, see buildRegistryFromSpec), or a fetch that throws outright.
 */
async function fetchAndBuildRegistry(auth: PulpAuth): Promise<readonly PulpPluginDescriptor[]> {
  try {
    const result = await pulpFetch<unknown>("/docs/api.json", auth);
    if (!result.ok) {
      console.error("getPulpPluginRegistry: failed to fetch the Pulp OpenAPI document:", result.detail);
      return PULP_PLUGINS;
    }

    const built = buildRegistryFromSpec(result.data);
    if (!built.ok) {
      console.error("getPulpPluginRegistry: derived zero plugin families from the Pulp OpenAPI document");
      return PULP_PLUGINS;
    }

    cachedRegistry = built.registry;
    cachedAt = Date.now();
    return built.registry;
  } catch (error) {
    console.error("getPulpPluginRegistry: failed to build the plugin registry:", error);
    return PULP_PLUGINS;
  }
}

/**
 * The plugin registry for the connected Pulp server: the 10-minute-cached, derived-and-merged
 * result of fetchAndBuildRegistry, or the curated PULP_PLUGINS on any failure. Concurrent callers
 * during a cache miss share one in-flight fetch instead of each fetching the (6.6MB) spec.
 */
export async function getPulpPluginRegistry(auth: PulpAuth): Promise<readonly PulpPluginDescriptor[]> {
  const now = Date.now();
  if (cachedRegistry && now - cachedAt < CACHE_TTL_MS) {
    return cachedRegistry;
  }

  if (!inFlight) {
    inFlight = fetchAndBuildRegistry(auth).finally(() => {
      inFlight = null;
    });
  }

  return inFlight;
}
