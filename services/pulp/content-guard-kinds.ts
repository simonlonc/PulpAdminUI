import type { PulpContentGuardKind } from "./types";

/**
 * Maps each content-guard kind to its upstream create path segment and a human label. The
 * `pulp_type` filter value on GET /contentguards/ is the kind itself (see PulpContentGuardKind
 * in types.ts). Kept in one place so the create route, the service, and the UI's type dropdown
 * never disagree on what a kind means.
 */
export type PulpContentGuardKindDescriptor = {
  kind: PulpContentGuardKind;
  /** Upstream create path segment: POST /contentguards/{path}/. */
  path: string;
  label: string;
};

export const PULP_CONTENT_GUARD_KINDS: readonly PulpContentGuardKindDescriptor[] = [
  { kind: "core.rbac", path: "core/rbac", label: "RBAC" },
  { kind: "core.header", path: "core/header", label: "Header" },
  { kind: "core.content_redirect", path: "core/content_redirect", label: "Content Redirect" },
  { kind: "core.composite", path: "core/composite", label: "Composite" },
  { kind: "certguard.x509", path: "certguard/x509", label: "X.509 Certificate" },
  { kind: "certguard.rhsm", path: "certguard/rhsm", label: "RHSM Certificate" },
];

export function findPulpContentGuardKind(kind: string): PulpContentGuardKindDescriptor | null {
  return PULP_CONTENT_GUARD_KINDS.find((descriptor) => descriptor.kind === kind) ?? null;
}

/**
 * Derives a guard's kind from its pulp_href, since the generic GET /contentguards/ list response
 * carries no pulp_type field. Returns null for an unrecognised href.
 */
export function pulpContentGuardKindFromHref(href: string): PulpContentGuardKind | null {
  for (const descriptor of PULP_CONTENT_GUARD_KINDS) {
    if (href.includes(`/contentguards/${descriptor.path}/`)) {
      return descriptor.kind;
    }
  }
  return null;
}
