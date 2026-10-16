"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/pulp/admin-shell";
import { usePulpAuthContext } from "@/components/pulp/auth-context";
import { usePulpBackends } from "@/components/pulp/use-pulp-backends";
import { useRequireAuth } from "@/components/pulp/use-require-auth";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Pencil, Trash2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  TableWrapper,
} from "@/components/ui/table";
import { RowActionMenu } from "@/components/pulp/row-action-menu";
import { SavePulpBackendPayload } from "@/services/pulp/types";

export default function PulpServersListPage() {
  const { sessionUser, isLoading, isCheckingSession, hasSession, error, setError, logout } =
    usePulpAuthContext();
  const isRedirectingToLogin = useRequireAuth({ hasSession, isCheckingSession });
  const { backends, createBackend, updateBackend, deleteBackend } = usePulpBackends(hasSession);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingBackendId, setEditingBackendId] = useState<string | null>(null);
  const [backendLabel, setBackendLabel] = useState("");
  const [backendBaseUrl, setBackendBaseUrl] = useState("");

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setEditingBackendId(null);
    setBackendLabel("");
    setBackendBaseUrl("");
  }, []);

  useEffect(() => {
    if (!modalOpen) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeModal();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modalOpen, closeModal]);

  function startNewBackend() {
    setError(null);
    setModalOpen(true);
  }

  function startEditBackend(backend: (typeof backends)[number]) {
    setError(null);
    setEditingBackendId(backend.id);
    setBackendLabel(backend.label);
    setBackendBaseUrl(backend.baseUrl);
    setModalOpen(true);
  }

  async function removeBackend(backend: (typeof backends)[number]) {
    if (!window.confirm(`Delete Pulp server “${backend.label}”? This cannot be undone.`)) {
      return;
    }

    await deleteBackend(backend.id);
  }

  async function handleSaveBackend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const payload: SavePulpBackendPayload = {
      label: backendLabel,
      baseUrl: backendBaseUrl,
    };

    const success = editingBackendId
      ? await updateBackend(editingBackendId, payload)
      : await createBackend(payload);
    if (success) {
      closeModal();
    }
  }

  return (
    <AdminShell
      title="Pulp servers"
      description="The servers listed here are offered on the login page."
      hasSession={hasSession}
      sessionUser={sessionUser}
      isLoading={isLoading}
      // While the dialog is open its own alert shows the error; the overlay would hide this one.
      error={modalOpen ? null : error}
      onLogout={logout}
    >
      {isCheckingSession || isRedirectingToLogin ? (
        <Card>Checking existing session...</Card>
      ) : (
        <Card>
          <CardTitle>
            Pulp servers
            {backends.length > 0 ? (
              <span className="ml-2 font-normal text-zinc-500 dark:text-zinc-400">
                ({backends.length.toLocaleString()} total)
              </span>
            ) : null}
          </CardTitle>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={startNewBackend} disabled={isLoading}>
                New Pulp server
              </Button>
            </div>
            <TableWrapper>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Label</TableHeaderCell>
                    <TableHeaderCell>Base URL</TableHeaderCell>
                    <TableHeaderCell>ID</TableHeaderCell>
                    <TableHeaderCell className="text-right">Actions</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {backends.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-zinc-500">
                        No Pulp servers found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    backends.map((backend) => (
                      <TableRow key={backend.id}>
                        <TableCell stack="heading" className="font-medium">{backend.label}</TableCell>
                        <TableCell label="Base URL" className="font-mono text-xs">{backend.baseUrl}</TableCell>
                        <TableCell label="ID" className="font-mono text-xs">{backend.id}</TableCell>
                        <TableCell stack="actions" className="text-right">
                          <div className="flex justify-end">
                            <RowActionMenu
                              label={backend.label}
                              items={[
                                {
                                  key: "edit",
                                  label: "Edit",
                                  icon: Pencil,
                                  disabled: isLoading,
                                  onSelect: () => startEditBackend(backend),
                                },
                                { key: "sep-1", separator: true },
                                {
                                  key: "delete",
                                  label: "Delete",
                                  icon: Trash2,
                                  destructive: true,
                                  disabled: isLoading,
                                  onSelect: () => removeBackend(backend),
                                },
                              ]}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableWrapper>
          </CardContent>
        </Card>
      )}

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 max-sm:p-0 sm:items-center">
          <button
            type="button"
            aria-label="Close dialog"
            className="absolute inset-0 bg-black/50"
            onClick={closeModal}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="save-backend-title"
            className="relative z-10 w-full max-w-lg rounded-xl border border-zinc-200/90 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-950 max-sm:max-h-[92dvh] max-sm:max-w-none max-sm:overflow-y-auto max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0 max-sm:pb-[max(1.25rem,env(safe-area-inset-bottom))]"
          >
            <h2 id="save-backend-title" className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              {editingBackendId ? "Edit Pulp server" : "New Pulp server"}
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              A new or changed base URL is checked for a Pulp API before it is saved.
            </p>
            {error ? (
              <p
                role="alert"
                className="mt-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200"
              >
                {error}
              </p>
            ) : null}
            <form className="mt-5 grid gap-4" onSubmit={handleSaveBackend}>
              <FormField label="Label">
                <Input
                  value={backendLabel}
                  onChange={(event) => setBackendLabel(event.target.value)}
                  required
                  autoFocus
                />
              </FormField>
              <FormField label="Base URL">
                <Input
                  type="url"
                  value={backendBaseUrl}
                  onChange={(event) => setBackendBaseUrl(event.target.value)}
                  placeholder="https://pulp.example.com/pulp/api/v3"
                  required
                />
              </FormField>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={closeModal} disabled={isLoading}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? "Saving…" : "Save"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </AdminShell>
  );
}
