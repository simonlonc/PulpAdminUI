"use client";

import { useCallback, useEffect, useState } from "react";
import { usePulpAuthContext } from "./auth-context";
import { PulpPaginatedResponse, PulpTask } from "@/services/pulp/types";
import { pulpTaskService } from "@/services/pulp/task-service";

export function usePulpTasks(enabled: boolean, params: URLSearchParams, pageSize: number) {
  const { setError } = usePulpAuthContext();
  const [data, setData] = useState<PulpPaginatedResponse<PulpTask> | null>(null);
  const [loading, setLoading] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const paramsKey = params.toString();

  useEffect(() => {
    let active = true;

    async function load() {
      if (!enabled) {
        setData(null);
        return;
      }

      setLoading(true);
      try {
        const next = await pulpTaskService.list(new URLSearchParams(paramsKey));
        if (active) {
          setData(next);
        }
      } catch (error) {
        if (active) {
          setData(null);
          setError(error instanceof Error ? error.message : "Failed to load tasks.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [enabled, paramsKey, reloadToken, setError]);

  const totalPages = data == null ? 0 : Math.max(1, Math.ceil(data.count / pageSize));

  const reload = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  return { data, loading, totalPages, reload };
}
