"use client";

import {
  createContext,
  createElement,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { pulpAuthService } from "@/services/pulp/auth-service";
import { SESSION_LOST_EVENT } from "@/services/pulp/http";

type PulpAuthContextValue = {
  sessionUser: string | null;
  hasSession: boolean;
  isLoading: boolean;
  isCheckingSession: boolean;
  error: string | null;
  setError: (value: string | null) => void;
  setIsLoading: (value: boolean) => void;
  login: (username: string, password: string, backendId?: string) => Promise<boolean>;
  logout: () => Promise<void>;
};

const PulpAuthContext = createContext<PulpAuthContextValue | null>(null);

export function PulpAuthProvider({ children }: { children: ReactNode }) {
  const [sessionUser, setSessionUser] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function checkSession() {
      setIsCheckingSession(true);
      const authenticatedUser = await pulpAuthService.getSessionUser();
      if (!active) return;
      setSessionUser(authenticatedUser);
      setIsCheckingSession(false);
    }

    void checkSession();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    function handleSessionLost() {
      setSessionUser(null);
    }

    window.addEventListener(SESSION_LOST_EVENT, handleSessionLost);

    return () => {
      window.removeEventListener(SESSION_LOST_EVENT, handleSessionLost);
    };
  }, []);

  const hasSession = useMemo(() => sessionUser !== null, [sessionUser]);

  async function login(username: string, password: string, backendId?: string): Promise<boolean> {
    setError(null);
    setIsLoading(true);

    const result = await pulpAuthService.login(username, password, backendId);
    if (!result.ok) {
      setError(result.detail);
      setIsLoading(false);
      return false;
    }

    // Confirm the browser kept the cookie; a Secure cookie set over plain HTTP is silently dropped.
    const confirmedUser = await pulpAuthService.getSessionUser();
    if (!confirmedUser) {
      setError(
        "The browser refused the session cookie because this page is served over plain HTTP. Serve the app over HTTPS, or set PULP_COOKIE_SECURE=false on the server for a trusted network."
      );
      setIsLoading(false);
      return false;
    }

    setSessionUser(confirmedUser);
    setIsLoading(false);
    return true;
  }

  async function logout(): Promise<void> {
    setIsLoading(true);
    setError(null);
    await pulpAuthService.logout();
    setSessionUser(null);
    setIsLoading(false);
  }

  const value = useMemo(
    () => ({
      sessionUser,
      hasSession,
      isLoading,
      isCheckingSession,
      error,
      setError,
      setIsLoading,
      login,
      logout,
    }),
    [sessionUser, hasSession, isLoading, isCheckingSession, error]
  );

  return createElement(PulpAuthContext.Provider, { value }, children);
}

export function usePulpAuthContext() {
  const context = useContext(PulpAuthContext);
  if (!context) {
    throw new Error("usePulpAuthContext must be used within PulpAuthProvider.");
  }

  return context;
}
