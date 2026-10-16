"use client";

import Link from "next/link";
import { ReactNode, useEffect, useRef, useState } from "react";
import packageJson from "../../package.json";
import { MANAGEMENT_SIDEBAR_ID, ManagementSidebar } from "@/components/pulp/management-sidebar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, Menu } from "lucide-react";

const APP_VERSION = packageJson.version;

function OfflineBadge() {
  return (
    <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
      Offline
    </span>
  );
}

type AdminShellProps = {
  title: string;
  description: string;
  hasSession: boolean;
  sessionUser: string | null;
  isLoading: boolean;
  error: string | null;
  onLogout: () => void;
  children: ReactNode;
};

export function AdminShell({
  title,
  description,
  hasSession,
  sessionUser,
  isLoading,
  error,
  onLogout,
  children,
}: AdminShellProps) {
  const [isNavOpen, setIsNavOpen] = useState(false);
  const navToggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isNavOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsNavOpen(false);
        navToggleRef.current?.focus();
      }
    }

    // Keep the page behind the open drawer from scrolling under a finger.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isNavOpen]);

  return (
    <main className="min-h-screen w-full bg-zinc-100/70 dark:bg-zinc-950">
      <div className="flex min-h-screen flex-col md:flex-row">
        {isNavOpen ? (
          <div
            aria-hidden="true"
            className="fixed inset-0 z-30 bg-zinc-950/50 md:hidden"
            onClick={() => setIsNavOpen(false)}
          />
        ) : null}
        <ManagementSidebar isOpen={isNavOpen} onClose={() => setIsNavOpen(false)} />

        <section className="flex min-w-0 flex-1 flex-col p-4 md:p-8">
          <header className="sticky top-0 z-20 -mx-4 mb-4 border-b border-zinc-200 bg-zinc-100/90 px-4 py-2 backdrop-blur md:-mx-8 md:mb-6 md:px-8 md:py-3 dark:border-zinc-800 dark:bg-zinc-950/90">
            <div className="flex items-center gap-3 md:justify-between">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <button
                  ref={navToggleRef}
                  type="button"
                  aria-label="Navigation menu"
                  aria-expanded={isNavOpen}
                  aria-controls={MANAGEMENT_SIDEBAR_ID}
                  onClick={() => setIsNavOpen((open) => !open)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-zinc-300 outline-none ring-zinc-400 focus-visible:ring-2 md:hidden dark:border-zinc-700"
                >
                  <Menu aria-hidden="true" className="h-5 w-5" />
                </button>
                <div className="min-w-0 md:space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wider text-zinc-500 max-md:hidden">
                    Administration
                  </p>
                  <h1 className="truncate text-lg font-semibold md:text-2xl">{title}</h1>
                  <p className="text-sm text-zinc-600 max-md:hidden dark:text-zinc-400">
                    {description}
                  </p>
                </div>
              </div>
              <div className="w-auto min-w-72 rounded-xl border border-zinc-200 bg-white/80 p-3 max-md:hidden dark:border-zinc-800 dark:bg-zinc-900/70">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Session</p>
                <div className="mt-2 flex items-center justify-between gap-4">
                  <div className="text-sm">
                    {hasSession ? (
                      <>
                        <p className="font-medium">{sessionUser}</p>
                        <p className="text-zinc-600 dark:text-zinc-400">Signed in</p>
                      </>
                    ) : (
                      <p className="text-zinc-600 dark:text-zinc-400">Authentication required</p>
                    )}
                  </div>
                  {hasSession ? (
                    <Button onClick={onLogout} disabled={isLoading} variant="outline">
                      Logout
                    </Button>
                  ) : (
                    <OfflineBadge />
                  )}
                </div>
              </div>
              <div className="shrink-0 md:hidden">
                {hasSession ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={`Account: ${sessionUser ?? ""}`}
                        className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-300 bg-white text-sm font-semibold uppercase outline-none ring-zinc-400 focus-visible:ring-2 dark:border-zinc-700 dark:bg-zinc-900"
                      >
                        {sessionUser?.charAt(0) || "?"}
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-[12rem]">
                      <div className="px-2 py-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                        Signed in as
                        <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                          {sessionUser}
                        </p>
                      </div>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem disabled={isLoading} onSelect={onLogout}>
                        <LogOut />
                        Logout
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <OfflineBadge />
                )}
              </div>
            </div>
          </header>
          <p className="-mt-1 mb-4 text-sm text-zinc-600 md:hidden dark:text-zinc-400">{description}</p>

          {error ? (
            <section className="mb-6 rounded-lg border border-red-400 bg-red-50 p-3 text-sm text-red-700 dark:border-red-600 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </section>
          ) : null}

          <div className="flex min-h-0 flex-1 flex-col">{children}</div>

          <footer
            className="mt-auto border-t border-zinc-200/80 pt-6 text-center text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-500"
            aria-label="Application version and changelog"
          >
            <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
              <span className="tabular-nums">Pulp Admin UI · Version {APP_VERSION}</span>
              <span aria-hidden className="text-zinc-300 dark:text-zinc-600">
                ·
              </span>
              <Link
                href="/changelog"
                className="text-zinc-600 underline decoration-zinc-400/80 underline-offset-2 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:decoration-zinc-600 dark:hover:text-zinc-200"
              >
                Release notes
              </Link>
              <span aria-hidden className="text-zinc-300 dark:text-zinc-600">
                ·
              </span>
              <span>
                © {new Date().getFullYear()} B. Slaveykov
              </span>
            </p>
          </footer>
        </section>
      </div>
    </main>
  );
}
