"use client";

import { useCallback, useEffect, useState } from "react";
import { usePulpAuthContext } from "./auth-context";
import { pulpExportService } from "@/services/pulp/export-service";
import { PulpExporter } from "@/services/pulp/types";

export function usePulpExporters(enabled: boolean, params: URLSearchParams) {
  const { setError, setIsLoading } = usePulpAuthContext();
  const [exporters, setExporters] = useState<PulpExporter[]>([]);
  const [count, setCount] = useState(0);
  const paramsKey = params.toString();

  const refreshExporters = useCallback(async () => {
    if (!enabled) {
      setExporters([]);
      setCount(0);
      return;
    }

    const page = await pulpExportService.list(new URLSearchParams(paramsKey));
    setExporters(page.results);
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
        await refreshExporters();
      } catch (error) {
        setError(error instanceof Error ? error.message : "Failed to reload exporters.");
      } finally {
        setIsLoading(false);
      }

      return true;
    },
    [refreshExporters, setError, setIsLoading]
  );

  const deleteExporter = useCallback(
    async (pulpHref: string) => runMutation(() => pulpExportService.remove(pulpHref)),
    [runMutation]
  );

  useEffect(() => {
    let active = true;

    async function load() {
      if (!enabled) {
        setExporters([]);
        setCount(0);
        return;
      }

      try {
        const page = await pulpExportService.list(new URLSearchParams(paramsKey));
        if (active) {
          setExporters(page.results);
          setCount(page.count);
        }
      } catch (error) {
        if (active) {
          setError(error instanceof Error ? error.message : "Failed to load exporters.");
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [enabled, paramsKey, setError]);

  return {
    exporters,
    count,
    refreshExporters,
    deleteExporter,
  };
}
