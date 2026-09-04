"use client";

import { useEffect, useState } from "react";
import { usePulpAuthContext } from "./auth-context";
import { pulpContentGuardService } from "@/services/pulp/content-guard-service";

export type PulpContentGuardOption = {
  href: string;
  name: string;
};

/**
 * Flat, name-sorted list of content guards, for pages that need to resolve a
 * distribution's `content_guard` href to a display name (e.g. the
 * distributions list).
 */
export function usePulpContentGuardOptions(enabled: boolean) {
  const { setError } = usePulpAuthContext();
  const [contentGuardOptions, setContentGuardOptions] = useState<PulpContentGuardOption[]>([]);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!enabled) {
        setContentGuardOptions([]);
        return;
      }

      try {
        const page = await pulpContentGuardService.list(
          new URLSearchParams({ limit: "200", offset: "0" })
        );
        if (!active) return;

        const nextOptions = page.results.map((guard) => ({
          href: guard.pulp_href,
          name: guard.name,
        }));
        nextOptions.sort((a, b) => a.name.localeCompare(b.name));
        setContentGuardOptions(nextOptions);
      } catch (error) {
        if (active) {
          setError(error instanceof Error ? error.message : "Failed to load content guards.");
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [enabled, setError]);

  return { contentGuardOptions };
}
