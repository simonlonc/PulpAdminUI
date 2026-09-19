# Pulp Admin UI

![Dashboard with summary counts, cache notice, shortcuts, and session](screenshots/screenshot.png)

*Screenshot is illustrative and shows an earlier version of the dashboard.*

Web admin console for [Pulp 3](https://pulpproject.org/). Built with **Next.js** (App Router), **React 19**, **TypeScript**, and **Tailwind CSS v4**. Server routes proxy the Pulp REST API v3 with cookie-based sessions: the browser never talks to Pulp directly, and Pulp credentials are encrypted into the session cookie rather than stored in a database.

The UI is not hardcoded to RPM and Debian. It works against seven curated Pulp plugin families (RPM, Debian APT, File, Python, npm, Ruby gem, and Maven) through a shared plugin registry that is derived from the connected server's own OpenAPI document, refined by a curated seed of per-family metadata, and correctable at deploy time through an optional overlay directory. See "The plugin registry" below.

## Features

### Overview & status

- **Dashboard**: Summary cards driven by the plugin registry, one set of counts per configured family, plus users and groups. Counts are loaded via a short-lived server cache with a manual refresh control.
- **Global search**: Resolve a Pulp resource by href or PRN (Pulp Resource Name) and jump straight to its detail page.
- **Server status**: Pulp server version, online services, connectivity, and storage information from Pulp's status endpoint.
- **Authentication**: Log in against Pulp; cookie-based session (username/password encrypted into the cookie, never stored server-side); protected app pages and API routes; session card with logout.

### Identity & access

- **Users**: List, create, edit, change password, and delete. Row actions (Edit, Change password, Delete) live in a shared "..." menu.
- **Groups**: List, create, edit, and delete access groups.
- **Roles**: List, create, edit, and delete Pulp roles (RBAC role definitions with `app_label.codename` permission strings). Pulp's roles API is tech preview; locked/built-in roles are shown read-only with no action menu.
- **Content guards**: List, create, edit, and delete content guards (which control who may download published content), with an Access panel for per-object roles.
- **Per-object access (RBAC)**: An Access panel on repositories (and other object types) shows and edits object-level role assignments via Pulp's object-roles API. Row actions are permission-gated: the UI calls Pulp to check what the current user may actually do to an object before showing an action.
- **Resource labels**: `pulp_labels` can be viewed, edited through a label editor modal, and used as a list filter, with label chips shown in list rows.

### Repository management

Seven plugin families: RPM, Debian APT, File, Python, npm, Ruby gem, and Maven. Coverage differs slightly by family, driven by each family's plugin descriptor in the registry:

- **List**: Paginated, filterable by kind, name, and remote; row actions (Edit, Versions, Content, Labels, Access, Sync, Publish, Distribute, Delete) shown or hidden per family capability (`supportsSync`, `supportsPublish`) and per-object permission.
- **Create**: New repository of any of the seven kinds. Fields beyond name/description/retained versions/remote (such as `autopublish` for RPM and File, or `structured_repo` for Debian) are shown only when that family's descriptor declares them.
- **Edit**: RPM and Debian have dedicated edit forms matching their extra Pulp fields (RPM: `autopublish`, `metadata_signing_service`, `retain_package_versions`, checksum types, `gpgcheck`, `repo_gpgcheck`, `sqlite_metadata`; Debian: `structured_repo`). File, Python, npm, gem, and Maven repositories share a generic edit form (name, description, retained versions, remote, plus `autopublish`/`manifest`); the API route only forwards the fields a given family's descriptor actually lists, so fields not relevant to a kind are dropped before the request reaches Pulp.
- **Sync**: Dispatches an async sync task against a chosen remote. RPM exposes a `sync_policy` (additive, mirror-complete, mirror-content-only) plus an `optimize` flag; other families use a `mirror` toggle plus `optimize`.
- **Publish**: Dispatches an async publish task where the family supports it, with a result panel linking to the publication and the task.
- **Distribute**: Creates or updates a distribution bound to the repository. This works across all seven families (it resolves the repository's kind from its href and uses that family's distribution endpoint), not just RPM.
- **Repository content**: Browse the content in a repository version, generic across families, with a link to per-item content detail.
- **Versions**: List repository versions with added/removed/present content summaries; roll back to an earlier version (sets `base_version`); modify a version's content directly.
- **Version detail**: A single version: metadata, content summary, "repair" (re-verify or re-check existence of stored artifacts) and delete.
- **Reclaim space**: Free disk space used by repository artifacts (selected repositories or all of them, with an optional keeplist of versions to exclude) while keeping metadata; dispatches an async task.

### Remotes

- List, create, edit, and delete remotes across all seven families, with labels and an Access panel for per-object roles. Common fields: name, URL, download policy (immediate, on-demand, streamed), TLS validation, proxy URL, credentials, CA/client certificates, download concurrency. Debian remotes add distribution/component/architecture fields and installer/source sync toggles. Write-only secrets are never returned by Pulp, so leaving them blank on edit keeps the stored value.

### Distributions & publications

- **Distributions**: List, create, and edit distributions for any family (base path and name are editable), with labels and an Access panel for per-object roles, and delete. The underlying repository binding is handled generically per plugin descriptor, not just for RPM.
- **Publications**: Browse and delete publications. There is no publication create/edit form; publications are produced by the repository Publish action.

### Content & uploads

- **Content**: A generic, multi-family content list and detail view driven by each family's `contentEndpoints` (not RPM-only): package/content rows with family-appropriate columns, and a detail page per item. `/content/preview` is a redirect helper: it resolves an `id` or `href` query param to an RPM package detail page, and falls back to the content list when it cannot.
- **Uploads**: Chunked upload of a file to Pulp, plus a shortcut to create RPM package content directly from an uploaded artifact.

### Tasks & workers

- **Tasks**: List with search, state filter, and date filters; sortable columns; row actions for task detail and cancel (only while running or waiting), with a confirmation step.
- **Task detail**: Full task record: state, timestamps, worker, parent/child task links, task group link, created/reserved resources, progress reports, and formatted error/traceback. Auto-refreshes while the task is running or waiting.
- **Task groups**: List and detail view for tasks dispatched together, with per-state counts and a table of member tasks.
- **Task schedules**: Read-only list of periodic task schedules (interval, next dispatch, last task).
- **Task purge**: Delete finished task records (completed, failed, canceled, or skipped) older than a chosen date; only task history is removed, not repositories, content, or artifacts.
- **Workers**: List of Pulp task workers and their heartbeats.

### Maintenance

- **Orphan cleanup**: Remove content and artifacts no longer referenced by any repository, with an optional protection-time override (otherwise the server's own `ORPHAN_PROTECTION_TIME` setting applies).
- **Reclaim space**: See Repository management above.

### The plugin registry

The plugin registry is what lets one codebase describe RPM, Debian, File, Python, npm, gem, and Maven repositories without a family-specific page for each. It is built server-side in three tiers, merged in this order:

1. **Derived**: Parsed live from the connected Pulp server's own OpenAPI document (`/docs/api.json`), so the registry reflects the plugins actually installed on that server.
2. **Curated** (`lib/pulp-plugins.ts`): A hand-written seed of the seven families above, filling in UI-only details the OpenAPI document does not carry (field labels, placeholders, which sync/repo fields to show). Curated values win over derived ones field by field.
3. **Overlay** (optional, `PULP_PLUGIN_DIR`): A directory of JSON files, one partial or complete descriptor per file, applied last and taking precedence over both other tiers. This lets a deployment correct or add a family without rebuilding the image. Invalid or unreadable overlay files are skipped rather than breaking the app.

The merged registry is cached for 10 minutes with in-flight de-duplication, and falls back to the curated seed alone if the server's OpenAPI document cannot be fetched or fails to derive any families.

### UI

- **Sidebar**: Six grouped sections: **Overview** (Dashboard, Global search, Server status), **Identity** (Users), **Access** (Groups, Roles, Content guards), **Repository** (Repositories, Remotes, Distributions, Publications, Content, Upload file), **Workers & tasks** (Tasks, Task groups, Task schedules, Workers), and **Maintenance** (Orphan cleanup, Reclaim space, Task purge). The project name from `PULP_PROJECT_NAME` is shown next to the logo.
- **Row action menu**: List pages (content guards, distributions, groups, publications, remotes, repositories, roles, tasks, and users) use a shared "..." dropdown for row actions instead of inline buttons, with items shown or hidden based on what the current user is permitted to do to that object.
- **Administration layout**: Consistent shell with titles and session; errors render under the header so API or task failures stay visible without scrolling past the main card.

## Getting started

1. Copy environment:

   ```bash
   cp .env.example .env
   ```

   Set the following variables:

   - `PULP_BASE_URL` (required): your Pulp API v3 base, e.g. `https://your-host/pulp/api/v3`.
   - `PULP_PROJECT_NAME` (required): a display name for this deployment, shown next to the sidebar logo. It is read fresh on every request rather than baked in at build time, so one built image can serve different project names for different deployments.
   - `PULP_SESSION_SECRET` (required for login): encrypts the session cookie with AES-256-GCM, keyed by a SHA-256 hash of this value. Generate one with `openssl rand -base64 32`.
   - `PULP_PLUGIN_DIR` (optional, not in `.env.example`): a directory of JSON overlay files that can add or correct plugin family descriptions for this deployment. See "The plugin registry" above. Leave unset to use only the derived and curated tiers.
   - `PULP_CONTENT_ORIGIN` (optional): overrides the origin (scheme, host, port) of content URLs reported by Pulp (distribution `base_url` and `content_settings.content_origin`). Only the origin is replaced; the path is preserved to maintain Pulp's `content_path_prefix` and the distribution's `base_path`. When unset or malformed, Pulp's own value passes through unchanged. The status page shows both Pulp's reported content origin and the effective content origin when this variable is set. This is read at the server boundary and requires no client rebuild.

2. Install and run:

   ```bash
   npm install
   npm run dev
   ```

3. Open [http://localhost:3000](http://localhost:3000) (redirects to login, then the users list).

### Testing

`npm test` runs unit tests only. A separate, opt-in contract test tier (`npm run test:contract`) exercises routes against a real Pulp server; it is skipped unless `PULP_TEST_BASE_URL`, `PULP_TEST_USERNAME`, and `PULP_TEST_PASSWORD` are set, and is never run as part of the default `npm test`.

## Scripts

| Command                | Description                          |
| ----------------------- | ------------------------------------ |
| `npm run dev`           | Development server                   |
| `npm run build`         | Production build                     |
| `npm run start`         | Start production server              |
| `npm run lint`          | ESLint                               |
| `npm run check`         | Lint, then build, then unit tests    |
| `npm test`              | Unit tests (Vitest, single run)      |
| `npm run test:watch`    | Unit tests in watch mode             |
| `npm run test:contract` | Contract tests against a real Pulp server (opt-in, see Testing) |

## Container images

Container images are built from `containers/Containerfile.{debian,alpine,ubi}` via `containers/build.sh`, and published by `.github/workflows/images.yml`. Three variants, sharing the same multi-stage Next.js standalone build:

| Variant | Base image |
| ------- | ---------- |
| Debian  | `node:22.23.2-trixie-slim` (default variant) |
| Alpine  | `node:22.23.2-alpine3.24` |
| UBI     | `registry.access.redhat.com/ubi9/nodejs-22-minimal` (built with the `ubi9/nodejs-22` builder image) |

Run `containers/build.sh --help` for the full option list. Tags follow `<image>:v<version>-<variant><os-version>` and `<image>:stable-<variant><os-version>`, e.g. `pulpadminui:v0.0.6-debian13` and `pulpadminui:stable-debian13`; the default (Debian) variant also gets the unsuffixed `pulpadminui:v0.0.6`, `pulpadminui:stable`, and `pulpadminui:latest` tags.

All three images declare `USER 1001` and ship their files group-owned by gid 0, so they also run correctly under the arbitrary UID that OpenShift assigns (OpenShift ignores `USER` and runs the container as a random UID in the root group). They listen on port 3000. They need the same environment variables as local development: `PULP_BASE_URL`, `PULP_PROJECT_NAME`, and `PULP_SESSION_SECRET` at minimum, plus `PULP_PLUGIN_DIR` if you use a plugin overlay. If running behind a reverse proxy or published TLS endpoint, also set `PULP_CONTENT_ORIGIN` to override how Pulp reports its content URLs.

Building any of the three images requires outbound network access to `fonts.googleapis.com` during the build stage, because the app loads its fonts with `next/font/google`.

## Discoverability

**Keywords:** pulp, pulp 3, pulp3, repository manager, RPM repository, Debian APT repository, Python package repository, npm registry, Ruby gem repository, Maven repository, YUM/DNF content, artifact upload, chunked file upload, remote, repository sync, mirror upstream, sync policy, distribution, publication, resource labels, object-level RBAC, role management, task management, orphan cleanup, reclaim disk space, user management, group management, Next.js admin, React dashboard, TypeScript UI, Tailwind, Pulp REST API v3, Pulp plugin registry, content gateway, package hosting, container image, OpenShift.
