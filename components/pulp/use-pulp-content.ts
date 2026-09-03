"use client";

import { useEffect, useState } from "react";
import { usePulpAuthContext } from "./auth-context";
import { pulpContentService } from "@/services/pulp/content-service";
import { PulpContentItem } from "@/services/pulp/types";

export function usePulpContent(enabled: boolean, params: URLSearchParams) {
  const { setError } = usePulpAuthContext();
  const [items, setItems] = useState<PulpContentItem[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const paramsKey = params.toString();

  useEffect(() => {
    let active = true;

    async function load() {
      if (!enabled) {
        setItems([]);
        setCount(0);
        return;
      }

      setLoading(true);
      try {
        const page = await pulpContentService.list(new URLSearchParams(paramsKey));
        if (active) {
          setItems(page.results);
          setCount(page.count);
        }
      } catch (error) {
        if (active) {
          setItems([]);
          setCount(0);
          setError(error instanceof Error ? error.message : "Failed to load content.");
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
  }, [enabled, paramsKey, setError]);

  return { contentItems: items, count, loading };
}
