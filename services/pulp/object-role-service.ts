import { readApiDetail } from "./http";
import { PulpObjectRole, PulpObjectRoleAssignmentPayload, ServiceResult } from "./types";

const OBJECT_ROLES_PATH = "/api/pulp/object-roles";

export const pulpObjectRoleService = {
  async listRoles(pulpHref: string): Promise<PulpObjectRole[]> {
    const qs = new URLSearchParams({ pulp_href: pulpHref });
    const response = await fetch(`${OBJECT_ROLES_PATH}?${qs}`);
    if (!response.ok) {
      throw new Error(await readApiDetail(response));
    }

    const data = (await response.json()) as { roles: PulpObjectRole[] };
    return data.roles;
  },

  async addRole(pulpHref: string, payload: PulpObjectRoleAssignmentPayload): Promise<ServiceResult> {
    const response = await fetch(OBJECT_ROLES_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pulp_href: pulpHref, ...payload }),
    });

    if (!response.ok) {
      return { ok: false, detail: await readApiDetail(response) };
    }

    return { ok: true };
  },

  async removeRole(pulpHref: string, payload: PulpObjectRoleAssignmentPayload): Promise<ServiceResult> {
    const response = await fetch(OBJECT_ROLES_PATH, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pulp_href: pulpHref, ...payload }),
    });

    if (!response.ok) {
      return { ok: false, detail: await readApiDetail(response) };
    }

    return { ok: true };
  },

  async myPermissions(pulpHref: string): Promise<string[]> {
    const qs = new URLSearchParams({ pulp_href: pulpHref });
    const response = await fetch(`${OBJECT_ROLES_PATH}/my-permissions?${qs}`);
    if (!response.ok) {
      throw new Error(await readApiDetail(response));
    }

    const data = (await response.json()) as { permissions: string[] };
    return data.permissions;
  },
};
