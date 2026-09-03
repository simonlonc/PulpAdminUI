"use client";

import { useCallback, useRef, useState } from "react";
import { pulpObjectRoleService } from "@/services/pulp/object-role-service";

type PermissionsEntry = string[] | "error";

/**
 * Lazily fetches `my_permissions` for individual Pulp objects, one href at a
 * time, caching results by href so re-opening a menu/modal for the same
 * object costs nothing further. Pulp has no bulk permissions endpoint, so
 * callers must not fan this out across a page of rows — call `ensure` only
 * when the user acts on a specific object (e.g. opening its row menu).
 *
 * Fails open: while a href's permissions are unknown (still loading, or the
 * fetch failed), `can` returns true, preserving prior behavior where actions
 * were always enabled and any insufficient-permission error surfaced from
 * the server after the fact.
 */
export function usePulpObjectPermissions() {
  const [permissionsByHref, setPermissionsByHref] = useState<Record<string, PermissionsEntry>>({});
  const inFlightHrefs = useRef<Set<string>>(new Set());

  const ensure = useCallback(
    (href: string) => {
      if (!href || href in permissionsByHref || inFlightHrefs.current.has(href)) return;
      inFlightHrefs.current.add(href);
      void (async () => {
        try {
          const permissions = await pulpObjectRoleService.myPermissions(href);
          setPermissionsByHref((prev) => ({ ...prev, [href]: permissions }));
        } catch {
          setPermissionsByHref((prev) => ({ ...prev, [href]: "error" }));
        } finally {
          inFlightHrefs.current.delete(href);
        }
      })();
    },
    [permissionsByHref]
  );

  const isLoading = useCallback(
    (href: string) => permissionsByHref[href] === undefined,
    [permissionsByHref]
  );

  /** Does the cached permission list for `href` grant verb `verb` (e.g. "change", "manage_roles")? */
  const can = useCallback(
    (href: string, verb: string) => {
      const entry = permissionsByHref[href];
      if (entry === undefined || entry === "error") return true;
      const verbPattern = new RegExp(`^[^.]+\\.${verb}_`);
      return entry.some((permission) => verbPattern.test(permission));
    },
    [permissionsByHref]
  );

  return { ensure, can, isLoading };
}
