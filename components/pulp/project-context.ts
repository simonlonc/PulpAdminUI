"use client";

import { createContext, createElement, ReactNode, useContext } from "react";

/**
 * Carries the deployment's project name from the server layout to the client tree.
 *
 * It is a context rather than a `NEXT_PUBLIC_` variable on purpose: an inlined
 * variable is frozen into the bundle at build time, which would pin one project
 * name into every container image. Read on the server per request, it stays a
 * runtime setting a Deployment can change without a rebuild.
 */
const PulpProjectContext = createContext<string | null>(null);

export function PulpProjectProvider({
  projectName,
  children,
}: {
  projectName: string;
  children: ReactNode;
}) {
  return createElement(PulpProjectContext.Provider, { value: projectName }, children);
}

export function usePulpProjectName(): string {
  const context = useContext(PulpProjectContext);
  if (!context) {
    throw new Error("usePulpProjectName must be used within PulpProjectProvider.");
  }

  return context;
}
