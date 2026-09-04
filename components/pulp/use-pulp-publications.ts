"use client";

import { useCallback, useEffect, useState } from "react";
import { usePulpAuthContext } from "./auth-context";
import { pulpPublicationService } from "@/services/pulp/publication-service";
import { PulpPublication } from "@/services/pulp/types";

export function usePulpPublications(enabled: boolean, params: URLSearchParams) {
  const { setError, setIsLoading } = usePulpAuthContext();
  const [publications, setPublications] = useState<PulpPublication[]>([]);
  const [count, setCount] = useState(0);
  const paramsKey = params.toString();

  const refreshPublications = useCallback(async () => {
    if (!enabled) {
      setPublications([]);
      setCount(0);
      return;
    }

    const page = await pulpPublicationService.listPaged(new URLSearchParams(paramsKey));
    setPublications(page.results);
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
        await refreshPublications();
      } catch (error) {
        setError(error instanceof Error ? error.message : "Failed to reload publications.");
      } finally {
        setIsLoading(false);
      }

      return true;
    },
    [refreshPublications, setError, setIsLoading]
  );

  const deletePublication = useCallback(
    async (pulpHref: string) => runMutation(() => pulpPublicationService.remove(pulpHref)),
    [runMutation]
  );

  useEffect(() => {
    let active = true;

    async function load() {
      if (!enabled) {
        setPublications([]);
        setCount(0);
        return;
      }

      try {
        const page = await pulpPublicationService.listPaged(new URLSearchParams(paramsKey));
        if (active) {
          setPublications(page.results);
          setCount(page.count);
        }
      } catch (error) {
        if (active) {
          setError(error instanceof Error ? error.message : "Failed to load publications.");
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [enabled, paramsKey, setError]);

  return {
    publications,
    count,
    refreshPublications,
    deletePublication,
  };
}
