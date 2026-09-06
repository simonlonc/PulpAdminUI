"use client";

import Link from "next/link";
import { AdminShell } from "@/components/pulp/admin-shell";
import { usePulpAuthContext } from "@/components/pulp/auth-context";
import { Card, CardContent, CardTitle } from "@/components/ui/card";

export default function NotFound() {
  const { sessionUser, isLoading, hasSession, logout } = usePulpAuthContext();

  return (
    <AdminShell
      title="Page not found"
      description="The page you requested does not exist."
      hasSession={hasSession}
      sessionUser={sessionUser}
      isLoading={isLoading}
      usersCount={0}
      groupsCount={0}
      error={null}
      onLogout={logout}
    >
      <Card>
        <CardTitle>Page not found</CardTitle>
        <CardContent className="space-y-4 text-sm">
          <p className="text-zinc-600 dark:text-zinc-400">
            The page you&apos;re looking for doesn&apos;t exist.
          </p>
          <Link
            href="/dashboard"
            className="inline-flex rounded-md border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Back to dashboard
          </Link>
        </CardContent>
      </Card>
    </AdminShell>
  );
}
