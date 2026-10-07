"use client";

import { useEffect, useState } from "react";
import { usePulpAuthContext } from "./auth-context";
import { PulpPaginatedResponse, PulpTask, PulpTaskSchedule } from "@/services/pulp/types";
import { pulpTaskScheduleService } from "@/services/pulp/task-schedule-service";
import { pulpTaskService } from "@/services/pulp/task-service";

export function usePulpTaskSchedules(enabled: boolean, page: number, pageSize: number) {
  const { setError } = usePulpAuthContext();
  const [data, setData] = useState<PulpPaginatedResponse<PulpTaskSchedule> | null>(null);
  const [lastTasks, setLastTasks] = useState<Record<string, PulpTask>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!enabled || page < 1) {
        setData(null);
        return;
      }

      setLoading(true);
      try {
        const next = await pulpTaskScheduleService.list({
          limit: pageSize,
          offset: (page - 1) * pageSize,
        });
        if (active) {
          setData(next);
        }

        // One batched lookup for the whole table; on failure the page falls back to the task id.
        const hrefs = next.results.flatMap((s) => (s.last_task ? [s.last_task] : []));
        let tasks: Record<string, PulpTask> = {};
        if (hrefs.length > 0) {
          try {
            const found = await pulpTaskService.list(
              new URLSearchParams({ pulp_href__in: hrefs.join(","), limit: String(hrefs.length) })
            );
            tasks = Object.fromEntries(found.results.map((t) => [t.pulp_href, t]));
          } catch {
            tasks = {};
          }
        }
        if (active) {
          setLastTasks(tasks);
        }
      } catch (error) {
        if (active) {
          setData(null);
          setError(error instanceof Error ? error.message : "Failed to load task schedules.");
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
  }, [enabled, page, pageSize, setError]);

  const totalPages = data == null ? 0 : Math.max(1, Math.ceil(data.count / pageSize));

  return { data, lastTasks, loading, totalPages };
}
