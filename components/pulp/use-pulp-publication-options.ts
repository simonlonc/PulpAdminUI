"use client";

import { useEffect, useState } from "react";
import { usePulpAuthContext } from "./auth-context";
import { usePulpRepositoryOptions } from "./use-pulp-repository-options";
import { pulpPublicationService } from "@/services/pulp/publication-service";
import { PulpPublication } from "@/services/pulp/types";

export type PulpPublicationOption = {
  href: string;
  label: string;
};

function versionNumberFromHref(href: string): string | null {
  const match = href.match(/\/versions\/(\d+)\/?$/);
  return match ? match[1] : null;
}

function labelForPublication(
  publication: PulpPublication,
  repositoryNameByHref: Map<string, string>
): string {
  const repositoryLabel = publication.repository
    ? repositoryNameByHref.get(publication.repository) ?? publication.repository
    : publication.pulp_href;
  const version = versionNumberFromHref(publication.repository_version);
  const versionLabel = version ? `v${version}` : publication.repository_version;
  return `${repositoryLabel} ${versionLabel} (${publication.pulp_created})`;
}

/**
 * Flat option list for the distribution edit/create modals' publication picker.
 * Publications have no name, so each option is labeled with the owning repository's name
 * (via usePulpRepositoryOptions) plus the version number parsed from repository_version and
 * the creation date, falling back to the repository href when the name can't be resolved.
 */
export function usePulpPublicationOptions(enabled: boolean) {
  const { setError } = usePulpAuthContext();
  const { repositoryOptions } = usePulpRepositoryOptions(enabled);
  const [publicationOptions, setPublicationOptions] = useState<PulpPublicationOption[]>([]);

  useEffect(() => {
    let active = true;

    async function load() {
      if (!enabled) {
        setPublicationOptions([]);
        return;
      }

      try {
        const page = await pulpPublicationService.listPaged(
          new URLSearchParams({ limit: "1000", offset: "0" })
        );
        if (!active) return;

        const repositoryNameByHref = new Map(
          repositoryOptions.map((option) => [option.href, option.name])
        );
        setPublicationOptions(
          page.results.map((publication) => ({
            href: publication.pulp_href,
            label: labelForPublication(publication, repositoryNameByHref),
          }))
        );
      } catch (error) {
        if (active) {
          setError(error instanceof Error ? error.message : "Failed to load publications.");
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [enabled, repositoryOptions, setError]);

  return { publicationOptions };
}
