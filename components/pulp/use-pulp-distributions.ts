"use client";

import { useCallback, useEffect, useState } from "react";
import { usePulpAuthContext } from "./auth-context";
import { pulpDistributionService } from "@/services/pulp/distribution-service";
import { PulpDistribution, UpdatePulpDistributionPayload } from "@/services/pulp/types";

export function usePulpDistributions(enabled: boolean, params: URLSearchParams) {
  const { setError, setIsLoading } = usePulpAuthContext();
  const [distributions, setDistributions] = useState<PulpDistribution[]>([]);
  const [count, setCount] = useState(0);
  const paramsKey = params.toString();

  const refreshDistributions = useCallback(async () => {
    if (!enabled) {
      setDistributions([]);
      setCount(0);
      return;
    }

    const page = await pulpDistributionService.listPaged(new URLSearchParams(paramsKey));
    setDistributions(page.results);
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
        await refreshDistributions();
      } catch (error) {
        setError(error instanceof Error ? error.message : "Failed to reload distributions.");
      } finally {
        setIsLoading(false);
      }

      return true;
    },
    [refreshDistributions, setError, setIsLoading]
  );

  const updateDistribution = useCallback(
    async (pulpHref: string, payload: UpdatePulpDistributionPayload) =>
      runMutation(() => pulpDistributionService.update(pulpHref, payload)),
    [runMutation]
  );

  const deleteDistribution = useCallback(
    async (pulpHref: string) => runMutation(() => pulpDistributionService.remove(pulpHref)),
    [runMutation]
  );

  useEffect(() => {
    let active = true;

    async function load() {
      if (!enabled) {
        setDistributions([]);
        setCount(0);
        return;
      }

      try {
        const page = await pulpDistributionService.listPaged(new URLSearchParams(paramsKey));
        if (active) {
          setDistributions(page.results);
          setCount(page.count);
        }
      } catch (error) {
        if (active) {
          setError(error instanceof Error ? error.message : "Failed to load distributions.");
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [enabled, paramsKey, setError]);

  return {
    distributions,
    count,
    refreshDistributions,
    updateDistribution,
    deleteDistribution,
  };
}
