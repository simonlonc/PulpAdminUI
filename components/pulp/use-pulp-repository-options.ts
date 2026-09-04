"use client";

import { useEffect, useState } from "react";
import { usePulpAuthContext } from "./auth-context";
import { usePulpPluginsContext } from "./plugins-context";
import { type PulpPluginKind } from "@/lib/pulp-plugins";
import { pulpRepositoryManagementService } from "@/services/pulp/repository-management-service";

export type PulpRepositoryOption = {
  href: string;
  name: string;
  kind: PulpPluginKind;
  latestVersionHref: string | null;
};

/**
 * Flat, name-sorted list of repositories across every plugin kind in
 * PULP_PLUGINS, for filter dropdowns on pages that span plugin families
 * (e.g. distributions, whose `repository` field may point at any kind).
 * One kind failing to load does not lose the options from the others.
 */
export function usePulpRepositoryOptions(enabled: boolean) {
  const { setError } = usePulpAuthContext();
  const { plugins } = usePulpPluginsContext();
  const [repositoryOptions, setRepositoryOptions] = useState<PulpRepositoryOption[]>([]);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!enabled) {
        setRepositoryOptions([]);
        return;
      }

      const settled = await Promise.allSettled(
        plugins.map((plugin) => pulpRepositoryManagementService.list(plugin.kind))
      );
      if (!active) return;

      const nextOptions: PulpRepositoryOption[] = [];
      settled.forEach((result, index) => {
        const plugin = plugins[index];
        if (result.status === "fulfilled") {
          for (const repo of result.value.results) {
            nextOptions.push({
              href: repo.pulp_href,
              name: repo.name,
              kind: plugin.kind,
              latestVersionHref: repo.latest_version_href,
            });
          }
        } else {
          setError(
            result.reason instanceof Error
              ? result.reason.message
              : `Failed to load ${plugin.label} repositories.`
          );
        }
      });

      nextOptions.sort((a, b) => a.name.localeCompare(b.name));
      setRepositoryOptions(nextOptions);
    }

    void load();

    return () => {
      active = false;
    };
  }, [enabled, setError, plugins]);

  return { repositoryOptions };
}
