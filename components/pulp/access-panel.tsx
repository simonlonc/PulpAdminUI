"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { pulpObjectRoleService } from "@/services/pulp/object-role-service";
import { pulpRoleService } from "@/services/pulp/role-service";
import { pulpUserService } from "@/services/pulp/user-service";
import { pulpGroupService } from "@/services/pulp/group-service";
import { PulpGroup, PulpObjectRole, PulpRole, PulpUser } from "@/services/pulp/types";

const selectClassName =
  "rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700";

type PrincipalType = "user" | "group";

type AssignmentRow = {
  role: string;
  principalType: PrincipalType;
  principal: string;
};

function rowsFromAssignments(assignments: PulpObjectRole[]): AssignmentRow[] {
  const rows: AssignmentRow[] = [];
  for (const assignment of assignments) {
    for (const user of assignment.users) {
      rows.push({ role: assignment.role, principalType: "user", principal: user });
    }
    for (const group of assignment.groups) {
      rows.push({ role: assignment.role, principalType: "group", principal: group });
    }
  }
  return rows;
}

export type AccessPanelModalProps = {
  pulpHref: string;
  resourceName: string;
  onClose: () => void;
};

export function AccessPanelModal({ pulpHref, resourceName, onClose }: AccessPanelModalProps) {
  const [assignments, setAssignments] = useState<PulpObjectRole[]>([]);
  const [roles, setRoles] = useState<PulpRole[]>([]);
  const [users, setUsers] = useState<PulpUser[]>([]);
  const [groups, setGroups] = useState<PulpGroup[]>([]);
  const [permissions, setPermissions] = useState<string[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [modalError, setModalError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const titleId = useId();

  const [newRole, setNewRole] = useState("");
  const [newPrincipalType, setNewPrincipalType] = useState<PrincipalType>("user");
  const [newPrincipal, setNewPrincipal] = useState("");

  const effectivePrincipalType: PrincipalType = groups.length === 0 ? "user" : newPrincipalType;

  const rows = useMemo(() => rowsFromAssignments(assignments), [assignments]);

  // Fail open: permissions unknown (still loading, or the fetch failed) means "permitted".
  const canManageRoles =
    permissions === null || permissions.some((p) => /^[^.]+\.manage_roles_/.test(p));

  const principalOptions = useMemo(
    () =>
      effectivePrincipalType === "user" ? users.map((u) => u.username) : groups.map((g) => g.name),
    [effectivePrincipalType, users, groups]
  );

  useEffect(() => {
    let active = true;

    async function load() {
      setIsLoading(true);
      try {
        const [nextAssignments, roleList, userList, groupList, nextPermissions] = await Promise.all([
          pulpObjectRoleService.listRoles(pulpHref),
          pulpRoleService.list({ limit: 100, offset: 0, forObjectType: pulpHref }),
          pulpUserService.list(),
          pulpGroupService.list(),
          pulpObjectRoleService.myPermissions(pulpHref).catch(() => null),
        ]);
        if (!active) return;
        setAssignments(nextAssignments);
        setRoles(roleList.results);
        setUsers(userList);
        setGroups(groupList);
        setPermissions(nextPermissions);
      } catch (error) {
        if (active) {
          setModalError(error instanceof Error ? error.message : "Failed to load access data.");
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [pulpHref]);

  useEffect(() => {
    if (roles.length === 0) {
      if (newRole !== "") setNewRole("");
      return;
    }
    if (!roles.some((r) => r.name === newRole)) {
      setNewRole(roles[0].name);
    }
  }, [roles, newRole]);

  useEffect(() => {
    if (principalOptions.length === 0) {
      if (newPrincipal !== "") setNewPrincipal("");
      return;
    }
    if (!principalOptions.includes(newPrincipal)) {
      setNewPrincipal(principalOptions[0]);
    }
  }, [principalOptions, newPrincipal]);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSaving) {
        onClose();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [isSaving, onClose]);

  function close() {
    if (isSaving) return;
    onClose();
  }

  async function refreshAssignments() {
    try {
      const next = await pulpObjectRoleService.listRoles(pulpHref);
      setAssignments(next);
    } catch (error) {
      setModalError(error instanceof Error ? error.message : "Failed to reload assignments.");
    }
  }

  async function handleAdd() {
    if (!newRole || !newPrincipal) {
      setModalError("Select a role and a principal.");
      return;
    }

    setModalError(null);
    setIsSaving(true);
    try {
      const result = await pulpObjectRoleService.addRole(pulpHref, {
        role: newRole,
        users: effectivePrincipalType === "user" ? [newPrincipal] : [],
        groups: effectivePrincipalType === "group" ? [newPrincipal] : [],
      });
      if (!result.ok) {
        setModalError(result.detail);
        return;
      }
      await refreshAssignments();
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRemove(row: AssignmentRow) {
    setModalError(null);
    setIsSaving(true);
    try {
      const result = await pulpObjectRoleService.removeRole(pulpHref, {
        role: row.role,
        users: row.principalType === "user" ? [row.principal] : [],
        groups: row.principalType === "group" ? [row.principal] : [],
      });
      if (!result.ok) {
        setModalError(result.detail);
        return;
      }
      await refreshAssignments();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/50 p-4 sm:items-center"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          close();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-5 shadow-lg dark:border-zinc-800 dark:bg-zinc-950"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Manage access
        </h2>
        <p className="mt-1 font-mono text-xs text-zinc-500 dark:text-zinc-400">{resourceName}</p>

        {modalError ? (
          <p
            role="alert"
            className="mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200"
          >
            {modalError}
          </p>
        ) : null}

        {isLoading ? (
          <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
        ) : (
          <div className="mt-4 flex flex-col gap-4">
            <div>
              <h3 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                Current access
              </h3>
              <div className="mt-2 flex flex-col gap-2">
                {rows.length === 0 ? (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">No roles assigned.</p>
                ) : null}
                {rows.map((row) => (
                  <div
                    key={`${row.role}:${row.principalType}:${row.principal}`}
                    className="flex items-center justify-between gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-mono text-xs text-zinc-500 dark:text-zinc-400">
                        {row.role}
                      </p>
                      <p className="truncate text-zinc-800 dark:text-zinc-200">
                        {row.principalType === "user" ? "User" : "Group"}: {row.principal}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isSaving || !canManageRoles}
                      onClick={() => void handleRemove(row)}
                      aria-label={`Remove ${row.role} from ${row.principalType} ${row.principal}`}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
              <h3 className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Add access</h3>
              {!canManageRoles ? (
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                  You do not have permission to manage roles on this object.
                </p>
              ) : null}
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <FormField label="Role">
                  <select
                    value={newRole}
                    onChange={(event) => setNewRole(event.target.value)}
                    disabled={isSaving || roles.length === 0}
                    className={selectClassName}
                  >
                    {roles.length === 0 ? <option value="">No assignable roles found</option> : null}
                    {roles.map((role) => (
                      <option key={role.pulp_href} value={role.name}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Type">
                  <select
                    value={effectivePrincipalType}
                    onChange={(event) => setNewPrincipalType(event.target.value as PrincipalType)}
                    disabled={isSaving}
                    className={selectClassName}
                  >
                    <option value="user">User</option>
                    {groups.length > 0 ? <option value="group">Group</option> : null}
                  </select>
                </FormField>
                <FormField label={effectivePrincipalType === "user" ? "User" : "Group"}>
                  <select
                    value={newPrincipal}
                    onChange={(event) => setNewPrincipal(event.target.value)}
                    disabled={isSaving || principalOptions.length === 0}
                    className={selectClassName}
                  >
                    {principalOptions.length === 0 ? (
                      <option value="">
                        {effectivePrincipalType === "user" ? "No users found" : "No groups found"}
                      </option>
                    ) : null}
                    {principalOptions.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </FormField>
                <Button
                  type="button"
                  disabled={isSaving || !newRole || !newPrincipal || !canManageRoles}
                  onClick={() => void handleAdd()}
                >
                  {isSaving ? "Saving…" : "Add"}
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={isSaving} onClick={close}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
