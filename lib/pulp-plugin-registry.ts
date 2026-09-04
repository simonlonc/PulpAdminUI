/**
 * Serves the plugin registry the whole app reads from: the connected Pulp server's OpenAPI
 * document, derived into descriptors (see lib/pulp-plugin-derive.ts) and merged with the curated
 * PULP_PLUGINS overlay, so the UI describes the server actually connected to instead of only the
 * plugins someone hand-wrote a descriptor for. The deployment's own overlay directory (see
 * lib/pulp-plugin-overlay.ts) is applied last, over both, and is re-read on every build.
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
import { isCompleteDescriptor, loadPulpPluginOverlay } from "@/lib/pulp-plugin-overlay";

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
 * Applies the deployment's overlay entries over an already-merged registry, overlay keys winning
 * key by key, so an overlay file only has to name what it corrects. contentEndpoints is merged
 * with the overlay endpoints in the curated role -- see mergeContentEndpoints.
 *
 * An entry for a kind the registry does not have describes a family this server does not offer,
 * or one the derivation skipped. It is appended only when it is a complete descriptor, since
 * there is no tier below it to supply the keys it leaves out.
 */
function applyOverlay(
  registry: readonly PulpPluginDescriptor[],
  overlay: readonly Partial<PulpPluginDescriptor>[]
): readonly PulpPluginDescriptor[] {
  if (overlay.length === 0) return registry;

  const result = [...registry];
  for (const entry of overlay) {
    const index = result.findIndex((plugin) => plugin.kind === entry.kind);
    if (index === -1) {
      if (!isCompleteDescriptor(entry)) {
        console.error(
          `getPulpPluginRegistry: overlay kind "${entry.kind}" is not on this server and the entry is not a complete descriptor`
        );
        continue;
      }
      console.error(`getPulpPluginRegistry: admitted overlay plugin family "${entry.kind}"`);
      result.push(entry);
      continue;
    }

    const existing = result[index];
    result[index] = {
      ...existing,
      ...entry,
      contentEndpoints: entry.contentEndpoints
        ? mergeContentEndpoints(existing.contentEndpoints, entry.contentEndpoints)
        : existing.contentEndpoints,
    };
  }

  return result;
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
 * The deployment's overlay is applied on every path, so it still corrects the fallback registry
 * when the server's document is unreachable.
 */
async function fetchAndBuildRegistry(auth: PulpAuth): Promise<readonly PulpPluginDescriptor[]> {
  const overlay = await loadPulpPluginOverlay();

  try {
    const result = await pulpFetch<unknown>("/docs/api.json", auth);
    if (!result.ok) {
      console.error("getPulpPluginRegistry: failed to fetch the Pulp OpenAPI document:", result.detail);
      return applyOverlay(PULP_PLUGINS, overlay);
    }

    const built = buildRegistryFromSpec(result.data);
    if (!built.ok) {
      console.error("getPulpPluginRegistry: derived zero plugin families from the Pulp OpenAPI document");
      return applyOverlay(PULP_PLUGINS, overlay);
    }

    const registry = applyOverlay(built.registry, overlay);
    cachedRegistry = registry;
    cachedAt = Date.now();
    return registry;
  } catch (error) {
    console.error("getPulpPluginRegistry: failed to build the plugin registry:", error);
    return applyOverlay(PULP_PLUGINS, overlay);
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
