"use client";

import { useCallback, useEffect, useState } from "react";
import { usePulpAuthContext } from "./auth-context";
import { pulpImportService } from "@/services/pulp/import-service";
import { PulpImporter } from "@/services/pulp/types";

export function usePulpImporters(enabled: boolean, params: URLSearchParams) {
  const { setError, setIsLoading } = usePulpAuthContext();
  const [importers, setImporters] = useState<PulpImporter[]>([]);
  const [count, setCount] = useState(0);
  const paramsKey = params.toString();

  const refreshImporters = useCallback(async () => {
    if (!enabled) {
      setImporters([]);
      setCount(0);
      return;
    }

    const page = await pulpImportService.list(new URLSearchParams(paramsKey));
    setImporters(page.results);
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
        await refreshImporters();
      } catch (error) {
        setError(error instanceof Error ? error.message : "Failed to reload importers.");
      } finally {
        setIsLoading(false);
      }

      return true;
    },
    [refreshImporters, setError, setIsLoading]
  );

  const deleteImporter = useCallback(
    async (pulpHref: string) => runMutation(() => pulpImportService.remove(pulpHref)),
    [runMutation]
  );

  useEffect(() => {
    let active = true;

    async function load() {
      if (!enabled) {
        setImporters([]);
        setCount(0);
        return;
      }

      try {
        const page = await pulpImportService.list(new URLSearchParams(paramsKey));
        if (active) {
          setImporters(page.results);
          setCount(page.count);
        }
      } catch (error) {
        if (active) {
          setError(error instanceof Error ? error.message : "Failed to load importers.");
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [enabled, paramsKey, setError]);

  return {
    importers,
    count,
    refreshImporters,
    deleteImporter,
  };
}
