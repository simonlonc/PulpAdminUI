"use client";

import { useCallback, useEffect, useState } from "react";
import { usePulpAuthContext } from "./auth-context";
import { pulpContentGuardService } from "@/services/pulp/content-guard-service";
import { PulpContentGuard } from "@/services/pulp/types";

export function usePulpContentGuards(enabled: boolean, params: URLSearchParams) {
  const { setError, setIsLoading } = usePulpAuthContext();
  const [contentGuards, setContentGuards] = useState<PulpContentGuard[]>([]);
  const [count, setCount] = useState(0);
  const paramsKey = params.toString();

  const refreshContentGuards = useCallback(async () => {
    if (!enabled) {
      setContentGuards([]);
      setCount(0);
      return;
    }

    const page = await pulpContentGuardService.list(new URLSearchParams(paramsKey));
    setContentGuards(page.results);
    setCount(page.count);
  }, [enabled, paramsKey]);

  const runMutation = useCallback(
    async (mutate: () => Promise<{ ok: true } | { ok: false; detail: string }>) => {
      setError(null);
      setIsLoading(true);

      const result = await mutate();
      if (!result.ok) {
        setError(result.detail);
        setIsLoading(false);
        return false;
      }

      try {
        await refreshContentGuards();
      } catch (error) {
        setError(error instanceof Error ? error.message : "Failed to reload content guards.");
      } finally {
        setIsLoading(false);
      }

      return true;
    },
    [refreshContentGuards, setError, setIsLoading]
  );

  const deleteContentGuard = useCallback(
    async (pulpHref: string) => runMutation(() => pulpContentGuardService.remove(pulpHref)),
    [runMutation]
  );

  useEffect(() => {
    let active = true;

    async function load() {
      if (!enabled) {
        setContentGuards([]);
        setCount(0);
        return;
      }

      try {
        const page = await pulpContentGuardService.list(new URLSearchParams(paramsKey));
        if (active) {
          setContentGuards(page.results);
          setCount(page.count);
        }
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
  }, [enabled, paramsKey, setError]);

  return {
    contentGuards,
    count,
    refreshContentGuards,
    deleteContentGuard,
  };
}
