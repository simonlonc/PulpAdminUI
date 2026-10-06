import type { PulpFilesystemExportMethod } from "./types";

/**
 * The methods a FilesystemExporter accepts, each with the one-line hint the create form shows.
 * Kept in one place so the routes' allowlist and the UI's method dropdown never disagree.
 */
export type PulpFilesystemExportMethodDescriptor = {
  method: PulpFilesystemExportMethod;
  hint: string;
};

export const PULP_FILESYSTEM_EXPORT_METHODS: readonly PulpFilesystemExportMethodDescriptor[] = [
  { method: "write", hint: "Copies the files into the path." },
  {
    method: "hardlink",
    hint: "Hardlinks the files into the path. The path must be on the same filesystem as Pulp's artifact storage.",
  },
  {
    method: "symlink",
    hint: "Symlinks the files into the path. The path must be on the same filesystem as Pulp's artifact storage.",
  },
];

export function isPulpFilesystemExportMethod(value: unknown): value is PulpFilesystemExportMethod {
  return PULP_FILESYSTEM_EXPORT_METHODS.some((descriptor) => descriptor.method === value);
}
