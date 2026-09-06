"use client";

import Link from "next/link";
import { AdminShell } from "@/components/pulp/admin-shell";
import { usePulpAuthContext } from "@/components/pulp/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { sessionUser, isLoading, hasSession, logout } = usePulpAuthContext();

  return (
    <AdminShell
      title="Something went wrong"
      description="An unexpected error occurred while rendering this page."
      hasSession={hasSession}
      sessionUser={sessionUser}
      isLoading={isLoading}
      usersCount={0}
      groupsCount={0}
      error={null}
      onLogout={logout}
    >
      <Card>
        <CardTitle>Something went wrong</CardTitle>
        <CardContent className="space-y-4 text-sm">
          <p className="text-zinc-600 dark:text-zinc-400">
            {error.message || "An unexpected error occurred."}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={reset}>Try again</Button>
            <Link
              href="/dashboard"
              className="inline-flex rounded-md border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Back to dashboard
            </Link>
          </div>
        </CardContent>
      </Card>
    </AdminShell>
  );
}
