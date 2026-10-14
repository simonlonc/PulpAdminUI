"use client";

import { useCallback, useEffect, useState } from "react";
import { usePulpAuthContext } from "./auth-context";
import { PulpBackend, SavePulpBackendPayload } from "@/services/pulp/types";
import { pulpBackendService } from "@/services/pulp/backend-service";

export function usePulpBackends(enabled: boolean) {
  const { setError, setIsLoading } = usePulpAuthContext();
  const [backends, setBackends] = useState<PulpBackend[]>([]);

  const refreshBackends = useCallback(async () => {
    if (!enabled) {
      setBackends([]);
      return;
    }

    const nextBackends = await pulpBackendService.list();
    setBackends(nextBackends);
  }, [enabled]);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!enabled) {
        setBackends([]);
        return;
      }

      try {
        const nextBackends = await pulpBackendService.list();
        if (active) {
          setBackends(nextBackends);
        }
      } catch (error) {
        if (active) {
          setError(error instanceof Error ? error.message : "Failed to load Pulp servers.");
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [enabled, setError]);

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
        await refreshBackends();
      } catch (error) {
        setError(error instanceof Error ? error.message : "Failed to reload Pulp servers.");
      } finally {
        setIsLoading(false);
      }

      return true;
    },
    [refreshBackends, setError, setIsLoading]
  );

  const createBackend = useCallback(
    async (payload: SavePulpBackendPayload) =>
      runMutation(() => pulpBackendService.create(payload)),
    [runMutation]
  );

  const updateBackend = useCallback(
    async (id: string, payload: SavePulpBackendPayload) =>
      runMutation(() => pulpBackendService.update(id, payload)),
    [runMutation]
  );

  const deleteBackend = useCallback(
    async (id: string) => runMutation(() => pulpBackendService.remove(id)),
    [runMutation]
  );

  return {
    backends,
    refreshBackends,
    createBackend,
    updateBackend,
    deleteBackend,
  };
}
