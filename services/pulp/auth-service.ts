import { readApiDetail } from "./http";
import type { PulpBackendOption } from "./types";

const API_PATHS = {
  backends: "/api/pulp/backends",
  login: "/api/pulp/login",
  logout: "/api/pulp/logout",
} as const;

export const pulpAuthService = {
  async getSessionUser(): Promise<string | null> {
    const response = await fetch(API_PATHS.login);
    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { username: string };
    return payload.username;
  },

  // No list means no dropdown: the login page then behaves as it does with a single server.
  async listBackends(): Promise<PulpBackendOption[]> {
    try {
      const response = await fetch(API_PATHS.backends);
      if (!response.ok) {
        return [];
      }

      return (await response.json()) as PulpBackendOption[];
    } catch {
      return [];
    }
  },

  async login(
    username: string,
    password: string,
    backendId?: string
  ): Promise<{ ok: true; username: string } | { ok: false; detail: string }> {
    const response = await fetch(API_PATHS.login, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // JSON.stringify leaves out an undefined backendId.
      body: JSON.stringify({ username, password, backendId }),
    });

    if (!response.ok) {
      return {
        ok: false,
        detail: await readApiDetail(response, { signalSessionLost: false }),
      };
    }

    const payload = (await response.json()) as { username: string };
    return {
      ok: true,
      username: payload.username,
    };
  },

  async logout(): Promise<void> {
    await fetch(API_PATHS.logout, { method: "POST" });
  },
};
