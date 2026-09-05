"use client";

import Link from "next/link";
import { FormEvent, Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AdminShell } from "@/components/pulp/admin-shell";
import { usePulpAuthContext } from "@/components/pulp/auth-context";
import { usePulpPluginsContext } from "@/components/pulp/plugins-context";
import { usePulpGroups } from "@/components/pulp/use-pulp-groups";
import { useRequireAuth } from "@/components/pulp/use-require-auth";
import { usePulpUsers } from "@/components/pulp/use-pulp-users";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  TableWrapper,
} from "@/components/ui/table";
import { PulpResourceFamily, pulpResourceTargetIn } from "@/lib/pulp-resource-ref";
import { pulpResolveService } from "@/services/pulp/resolve-service";
import { pulpSearchService } from "@/services/pulp/search-service";
import { PulpSearchGroup } from "@/services/pulp/types";

function searchFamilyLabel(family: PulpResourceFamily): string {
  switch (family) {
    case "repository":
      return "Repositories";
    case "remote":
      return "Remotes";
    case "distribution":
      return "Distributions";
    case "contentGuard":
      return "Content guards";
    default:
      return family;
  }
}

function GlobalSearchPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { sessionUser, isLoading, isCheckingSession, hasSession, error, setError, logout } =
    usePulpAuthContext();
  const isRedirectingToLogin = useRequireAuth({ hasSession, isCheckingSession });
  const { users } = usePulpUsers(hasSession);
  const { groups } = usePulpGroups(hasSession);
  const { plugins } = usePulpPluginsContext();

  const [ref, setRef] = useState("");
  const [isResolving, setIsResolving] = useState(false);
  const [notFoundMessage, setNotFoundMessage] = useState<string | null>(null);

  const resolveAndGo = useCallback(
    async (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) {
        return;
      }

      setError(null);
      setNotFoundMessage(null);
      setIsResolving(true);
      try {
        const resolved = await pulpResolveService.resolve(trimmed);
        const target = pulpResourceTargetIn(plugins, resolved.pulp_href, resolved.name);
        if (!target) {
          setNotFoundMessage(
            `Resolved to ${resolved.prn}, but there is no page to show this type of resource.`
          );
          return;
        }
        router.push(target);
      } catch (resolveError) {
        setError(resolveError instanceof Error ? resolveError.message : "Failed to resolve reference.");
      } finally {
        setIsResolving(false);
      }
    },
    [plugins, router, setError]
  );

  useEffect(() => {
    if (!hasSession) {
      return;
    }
    const refParam = searchParams.get("ref")?.trim();
    if (refParam) {
      setRef(refParam);
      void resolveAndGo(refParam);
    }
  }, [hasSession, searchParams, resolveAndGo]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await resolveAndGo(ref);
  }

  const [searchTerm, setSearchTerm] = useState("");
  const [searchGroups, setSearchGroups] = useState<PulpSearchGroup[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const runSearch = useCallback(async (term: string) => {
    setSearchError(null);
    setIsSearching(true);
    try {
      const groups = await pulpSearchService.search(term);
      setSearchGroups(groups);
    } catch (searchErr) {
      setSearchGroups(null);
      setSearchError(searchErr instanceof Error ? searchErr.message : "Failed to search.");
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    if (!hasSession) {
      return;
    }
    const searchQueryParam = searchParams.get("search")?.trim();
    if (searchQueryParam) {
      setSearchTerm(searchQueryParam);
      void runSearch(searchQueryParam);
    } else {
      setSearchGroups(null);
    }
  }, [hasSession, searchParams, runSearch]);

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = searchTerm.trim();
    const next = new URLSearchParams(searchParams.toString());
    if (trimmed) {
      next.set("search", trimmed);
    } else {
      next.delete("search");
    }
    const qs = next.toString();
    router.replace(qs ? `/search?${qs}` : "/search", { scroll: false });
  }

  const hasSearchMatches = searchGroups?.some((group) => group.count > 0) ?? false;
  const hasSearchErrors = searchGroups?.some((group) => group.error) ?? false;

  return (
    <AdminShell
      title="Global Search"
      description="Jump straight to a resource from its href or PRN, or search resources by name."
      hasSession={hasSession}
      sessionUser={sessionUser}
      isLoading={isLoading || isResolving}
      usersCount={users.length}
      groupsCount={groups.length}
      error={error}
      onLogout={logout}
    >
      {isCheckingSession || isRedirectingToLogin ? (
        <Card>Checking existing session...</Card>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardTitle>Find a resource</CardTitle>
            <CardContent>
              <form className="flex flex-col gap-4 md:max-w-xl" onSubmit={handleSubmit}>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Paste any pulp_href (a relative path or full URL) or PRN and jump straight to
                  the page that shows it.
                </p>
                <FormField label="Pulp href or PRN">
                  <Input
                    type="text"
                    placeholder="/pulp/api/v3/repositories/rpm/rpm/<uuid>/ or prn:rpm.rpmrepository:<uuid>"
                    value={ref}
                    onChange={(event) => setRef(event.target.value)}
                  />
                </FormField>
                <div>
                  <Button type="submit" disabled={isResolving || ref.trim().length === 0}>
                    {isResolving ? "Opening..." : "Open"}
                  </Button>
                </div>
              </form>
              {notFoundMessage ? (
                <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">{notFoundMessage}</p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardTitle>Search by name</CardTitle>
            <CardContent>
              <form className="flex flex-col gap-4 md:max-w-xl" onSubmit={handleSearchSubmit}>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Matches resource names across repositories, remotes, distributions, and content
                  guards. Publications and content units are excluded because Pulp&apos;s generic
                  endpoints give them no name to match.
                </p>
                <FormField label="Name">
                  <Input
                    type="text"
                    placeholder="e.g. epel"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                  />
                </FormField>
                <div>
                  <Button type="submit" disabled={isSearching || searchTerm.trim().length === 0}>
                    {isSearching ? "Searching..." : "Search"}
                  </Button>
                </div>
              </form>
              {searchError ? (
                <p className="mt-4 text-sm text-red-600 dark:text-red-400">{searchError}</p>
              ) : null}
              {searchGroups ? (
                hasSearchMatches || hasSearchErrors ? (
                  <div className="mt-6 space-y-6">
                    {searchGroups.map((group) => (
                      <div key={group.family}>
                        <h3 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                          {searchFamilyLabel(group.family)}
                          {group.count > 0 ? (
                            <span className="ml-2 font-normal text-zinc-500 dark:text-zinc-400">
                              ({group.count.toLocaleString()} total)
                            </span>
                          ) : null}
                        </h3>
                        {group.error ? (
                          <p className="text-sm text-red-600 dark:text-red-400">{group.error}</p>
                        ) : (
                          <>
                            <TableWrapper>
                              <Table>
                                <TableHead>
                                  <TableRow>
                                    <TableHeaderCell>Name</TableHeaderCell>
                                    <TableHeaderCell>Href</TableHeaderCell>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {group.results.length === 0 ? (
                                    <TableRow>
                                      <TableCell colSpan={2} className="text-zinc-500">
                                        No matches.
                                      </TableCell>
                                    </TableRow>
                                  ) : (
                                    group.results.map((hit) => {
                                      const target = pulpResourceTargetIn(
                                        plugins,
                                        hit.pulp_href,
                                        hit.name
                                      );
                                      return (
                                        <TableRow key={hit.pulp_href}>
                                          <TableCell className="font-medium">
                                            {target ? (
                                              <Link
                                                href={target}
                                                className="underline decoration-zinc-400/80 underline-offset-2"
                                              >
                                                {hit.name}
                                              </Link>
                                            ) : (
                                              hit.name
                                            )}
                                          </TableCell>
                                          <TableCell className="text-zinc-500">
                                            {hit.pulp_href}
                                          </TableCell>
                                        </TableRow>
                                      );
                                    })
                                  )}
                                </TableBody>
                              </Table>
                            </TableWrapper>
                            {group.count > group.results.length ? (
                              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                                Showing first {group.results.length} of{" "}
                                {group.count.toLocaleString()}.
                              </p>
                            ) : null}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">No matches.</p>
                )
              ) : null}
            </CardContent>
          </Card>
        </div>
      )}
    </AdminShell>
  );
}

function GlobalSearchSuspenseFallback() {
  const { sessionUser, isLoading, hasSession, error, logout } = usePulpAuthContext();
  const { users } = usePulpUsers(hasSession);
  const { groups } = usePulpGroups(hasSession);

  return (
    <AdminShell
      title="Global Search"
      description="Jump straight to a resource from its href or PRN, or search resources by name."
      hasSession={hasSession}
      sessionUser={sessionUser}
      isLoading={isLoading}
      usersCount={users.length}
      groupsCount={groups.length}
      error={error}
      onLogout={logout}
    >
      <Card>Loading…</Card>
    </AdminShell>
  );
}

export default function GlobalSearchPage() {
  return (
    <Suspense fallback={<GlobalSearchSuspenseFallback />}>
      <GlobalSearchPageContent />
    </Suspense>
  );
}
