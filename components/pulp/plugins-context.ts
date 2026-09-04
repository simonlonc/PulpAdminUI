"use client";

import {
  createContext,
  createElement,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePulpAuthContext } from "./auth-context";
import {
  findContentForHrefIn,
  findPluginForRepositoryHrefIn,
  findPulpPluginIn,
  getPulpPluginIn,
  isPulpPluginKindIn,
  PULP_PLUGINS,
  PulpPluginDescriptor,
  PulpPluginKind,
} from "@/lib/pulp-plugins";
import { pulpPluginService } from "@/services/pulp/plugin-service";

type PulpPluginsContextValue = {
  plugins: readonly PulpPluginDescriptor[];
  getPlugin: (kind: PulpPluginKind) => PulpPluginDescriptor;
  findPlugin: (kind: string) => PulpPluginDescriptor | null;
  isPluginKind: (value: unknown) => value is PulpPluginKind;
  findContentForHref: (href: string) => { kind: PulpPluginKind; id: string } | null;
  findPluginForRepositoryHref: (href: string) => PulpPluginDescriptor | null;
};

const PulpPluginsContext = createContext<PulpPluginsContextValue | null>(null);

export function PulpPluginsProvider({ children }: { children: ReactNode }) {
  const { hasSession } = usePulpAuthContext();
  const [plugins, setPlugins] = useState<readonly PulpPluginDescriptor[]>(PULP_PLUGINS);

  useEffect(() => {
    if (!hasSession) return;

    let active = true;

    async function load() {
      try {
        const nextPlugins = await pulpPluginService.list();
        if (active) {
          setPlugins(nextPlugins);
        }
      } catch {
        // Keep the compiled-in PULP_PLUGINS seed; no error banner for this background refresh.
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [hasSession]);

  const getPlugin = useCallback(
    (kind: PulpPluginKind): PulpPluginDescriptor => getPulpPluginIn(plugins, kind),
    [plugins]
  );

  const findPlugin = useCallback(
    (kind: string): PulpPluginDescriptor | null => findPulpPluginIn(plugins, kind),
    [plugins]
  );

  const isPluginKind = useCallback(
    (value: unknown): value is PulpPluginKind => isPulpPluginKindIn(plugins, value),
    [plugins]
  );

  const findContentForHref = useCallback(
    (href: string): { kind: PulpPluginKind; id: string } | null =>
      findContentForHrefIn(plugins, href),
    [plugins]
  );

  const findPluginForRepositoryHref = useCallback(
    (href: string): PulpPluginDescriptor | null => findPluginForRepositoryHrefIn(plugins, href),
    [plugins]
  );

  const value = useMemo(
    () => ({
      plugins,
      getPlugin,
      findPlugin,
      isPluginKind,
      findContentForHref,
      findPluginForRepositoryHref,
    }),
    [plugins, getPlugin, findPlugin, isPluginKind, findContentForHref, findPluginForRepositoryHref]
  );

  return createElement(PulpPluginsContext.Provider, { value }, children);
}

export function usePulpPluginsContext() {
  const context = useContext(PulpPluginsContext);
  if (!context) {
    throw new Error("usePulpPluginsContext must be used within PulpPluginsProvider.");
  }

  return context;
}
