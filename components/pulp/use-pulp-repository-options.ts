"use client";

import { useEffect, useMemo, useState } from "react";
import { usePulpAuthContext } from "./auth-context";
import { usePulpPluginsContext } from "./plugins-context";
import { type PulpPluginKind } from "@/lib/pulp-plugins";
import { pulpRepositoryManagementService } from "@/services/pulp/repository-management-service";
import type { PulpRepository } from "@/services/pulp/types";

export type PulpRepositoryOption = {
  href: string;
  name: string;
  kind: PulpPluginKind;
  latestVersionHref: string | null;
};

/**
 * Flat, name-sorted list of repositories across every plugin kind, for pickers and filter
 * dropdowns on pages that span plugin families (e.g. distributions, whose `repository` field may
 * point at any kind). Loads once from Pulp's generic repository list and takes each row's kind
 * from its href, so the plugin registry arriving later re-maps the rows without refetching.
 * Rows of a kind the registry does not know are left out. `isLoading` is true until the first
 * load settles, so callers can tell "still loading" from "there are none".
 */
export function usePulpRepositoryOptions(enabled: boolean) {
  const { setError } = usePulpAuthContext();
  const { findPluginForRepositoryHref } = usePulpPluginsContext();
  // null while loading.
  const [repositories, setRepositories] = useState<PulpRepository[] | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!enabled) {
        setRepositories([]);
        return;
      }

      setRepositories(null);
      try {
        const nextRepositories = await pulpRepositoryManagementService.listAll();
        if (active) setRepositories(nextRepositories);
      } catch (error) {
        if (!active) return;
        setError(error instanceof Error ? error.message : "Failed to load repositories.");
        setRepositories([]);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [enabled, setError]);

  const repositoryOptions = useMemo(() => {
    const nextOptions: PulpRepositoryOption[] = [];
    for (const repo of repositories ?? []) {
      const plugin = findPluginForRepositoryHref(repo.pulp_href);
      if (!plugin) continue;
      nextOptions.push({
        href: repo.pulp_href,
        name: repo.name,
        kind: plugin.kind,
        latestVersionHref: repo.latest_version_href,
      });
    }
    nextOptions.sort((a, b) => a.name.localeCompare(b.name));
    return nextOptions;
  }, [repositories, findPluginForRepositoryHref]);

  return { repositoryOptions, isLoading: enabled && repositories === null };
}
