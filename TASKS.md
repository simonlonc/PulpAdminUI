# TASKS

Architecture backlog for bringing **PulpAdminUI** closer to `pulp` CLI capability.

Written for a distributing architect: each epic is medium-sized and carries sub-tasks
that can be handed to individual agents. Read [Conventions](#2-conventions),
[Sequencing](#3-sequencing), and the mandatory
[Branching and integration workflow](#5-branching-and-integration-workflow)
before assigning anything.

Priorities reflect the current deployment profile: **multi-user with RBAC**,
**multi-plugin (rpm, deb, file, python, npm, gem, maven)**, and a stated focus on
**operational depth** (search/filter, task control, status, labels, bulk actions).

---

## Table of Contents

1. [Context and current coverage](#1-context-and-current-coverage)
2. [Conventions](#2-conventions)
3. [Sequencing](#3-sequencing)
4. [Working with agents](#4-working-with-agents)
5. [Branching and integration workflow](#5-branching-and-integration-workflow)
6. [Epic A — Generic plugin registry (blocks most breadth work)](#epic-a--generic-plugin-registry)
7. [Epic A2 — Debian remote correctness (bug fix)](#epic-a2--debian-remote-correctness-bug-fix)
8. [Epic B — Task control and server status](#epic-b--task-control-and-server-status)
9. [Epic C — Search, filtering, and pagination](#epic-c--search-filtering-and-pagination)
10. [Epic D — Labels](#epic-d--labels)
11. [Epic E — Per-object RBAC](#epic-e--per-object-rbac)
12. [Epic F — Publications and distributions parity](#epic-f--publications-and-distributions-parity)
13. [Epic G — Repository version operations](#epic-g--repository-version-operations)
14. [Epic H — New plugin families](#epic-h--new-plugin-families)
15. [Epic I — Content guards](#epic-i--content-guards)
16. [Epic J — Generic resource resolution](#epic-j--generic-resource-resolution)
17. [Deferred](#deferred)

---

## 1. Context and current coverage

### Verified against `openapi/pulp.json`

The bundled spec exposes **561 paths**. Notable counts:

| Area | Endpoints in spec | Status in app |
| --- | --- | --- |
| `/repositories/*` | 12 families | 3 implemented (rpm, deb, file) |
| `/remotes/*` | 12 families | 3 implemented (rpm, deb, file) |
| `/distributions/*` | 12 families | 1 implemented (rpm, create only) |
| `/publications/*` | 6 families | 0 browsable (publish action only) |
| `/content/*` | 31 endpoints | 1 implemented (rpm packages) |
| `/contentguards/*` | 8 types | 0 |
| `set_label` / `unset_label` | ~80 endpoints | 0 |
| `add_role` / `remove_role` / `list_roles` | 111 endpoints | 0 |
| Alternate content sources (`/acs/*`) | 2 | 0 |
| Import/export (`/exporters/*`, `/importers/*`) | 4 | 0 |

### Currently implemented

Repositories (rpm/deb/file), remotes (rpm/deb/file), sync, publish, RPM distributions,
RPM content + version history, uploads, users, groups, roles, tasks (list only),
task schedules, workers, orphan cleanup.

### The core architectural problem

Per-plugin routes are near-identical. Measured: `remotes/rpm/route.ts` and
`remotes/file/route.ts` differ by **30 lines out of 285** (~90% duplication).
Sync routes are 89-98 lines each with the same shape.

Adding python + npm + gem + maven under the current pattern means roughly
**8 more near-identical route files (~2,300 lines)** and a fourth, fifth, sixth
copy of the same UI branches. **Epic A exists to stop that before it happens.**

Page sizes are already a maintenance signal: `repositories/list/page.tsx` is
**1,168 lines**, `repositories/edit/page.tsx` is **1,000**, `remotes/list/page.tsx`
is **637**. Each new plugin currently widens the `kind` unions inside them.

---

## 2. Conventions

Every task must follow `AGENT_GUIDE.md`. Restated for agents:

- **Match existing repo style exactly.** Do not modernize or refactor unprompted.
- **Surgical changes.** Every changed line traces to the assigned task.
- **Never commit to `main`.** Work on a feature branch; ask before creating it.
- **Never touch `README.md` / `TASKS.md`** as part of a code task; ask first.

### Established architecture (follow it)

```
app/api/pulp/<resource>/route.ts   server proxy: requirePulpAuth -> pulpFetch -> waitForTask
services/pulp/<x>-service.ts       client service: fetch + readApiDetail
app/<feature>/list/page.tsx        page inside AdminShell
app/<feature>/layout.tsx           REQUIRED: wraps children in PulpAuthProvider
components/pulp/management-sidebar.tsx   nav entry + icon
```

**Pitfalls learned the hard way:**

- A feature folder **without** `layout.tsx` fails the production build at prerender
  (`usePulpAuthContext must be used within PulpAuthProvider`). Always add it.
- `npm run build` needs env vars: `PULP_PROJECT_NAME` and `PULP_BASE_URL`.
- Pulp never returns write-only secrets (`password`, `client_key`, proxy creds).
  Blank input on edit must mean "leave unchanged", never "clear".
- Async endpoints return `202` + a task href; use the existing `waitForTask`.
- `waitForTask` caps at 60 attempts x 5s = **5 minutes** (see Task B4).

### Spec reference and live test server

**Field shapes must be verified against a spec — never guessed.** The committed
`openapi/pulp.json` is **incomplete** (561 paths, no deb/apt schemas, no `/status/`).
Use the full local spec instead — see [Task A0](#a0-obtain-a-complete-openapi-spec-resolved--reference-only-do-not-commit)
for the fetch command and the do-not-commit rule.

A live Pulp test server is available for verifying behavior end-to-end:

```
http://localhost:8080/pulp/api/v3/    admin / admin
```

Plugins installed: core 3.116.1, rpm 3.38.5, deb 3.10.0, file, python 3.35.0,
npm 0.10.1, gem 0.8.0, maven 0.25.1, container 2.29.0, ansible 0.30.0, ostree 2.6.1,
certguard. Domains are **disabled**; Redis is **not connected** (expect that in
`/status/` output when building B3).

Agents should curl this server to confirm request/response shapes before and after
implementing a route.

### Definition of done

1. `npm run build` passes with env vars set (TypeScript clean, no prerender errors).
2. `npm run lint` introduces **no new** problems. Baseline is **3 pre-existing**
   (1 error `app/dashboard/page.tsx:168`, 2 unused-var warnings in
   `components/pulp/management-sidebar.tsx`). Do not "fix" these as drive-by work.
3. New routes appear in the build's route list.
4. Endpoints/fields verified against the **local spec from Task A0** — never guessed.
   (The committed `openapi/pulp.json` is incomplete; see below.)
5. The feature branch **merges cleanly into `main`** — verified per
   [§5.3](#53-verify-mergeability-into-main). A feature that cannot reach `main`
   is not done.
6. The feature branch is **merged into `devel` with `--no-ff` and then kept**,
   not deleted — see [§5](#5-branching-and-integration-workflow).

### Spec gap in the committed file

The committed `openapi/pulp.json` contains **no deb/apt schemas** — the `pulp_deb`
plugin was absent from the server that generated it (`packages.redhat.com`). This is
why the shipped Debian code was written blind, and why Epic A2 exists. Resolved for
reference purposes by Task A0; the committed file itself stays as-is (fork constraint).

---

## 3. Sequencing

```
A0 (done) ──> A (registry) ──┬──> H (new plugins)
                             ├──> C (search/filter)
                             ├──> D (labels)
                             └──> F (publications/distributions)

A2 (deb bug fix) ── independent, start immediately
B (tasks/status) ── independent, start immediately
E (RBAC) ── depends on A for resource typing, else independent
G, I, J ── after A
```

- **Start now, in parallel:** Epics A, A2, and B (they share no files —
  A2 touches only the deb route + deb branch of the remotes form).
- **Hard rule:** do not start Epic H before Epic A lands, or the duplication doubles.
- **File-contention warning:** Epics C, D, E, F all touch list pages and
  `services/pulp/types.ts`. Assign them **sequentially**, or split strictly by file.
  A2 and A6 both touch `app/remotes/list/page.tsx` — do not run them concurrently.

---

## 4. Working with agents

Written for whoever distributes these tasks. Every item below comes from problems
actually hit while building the Remotes + Sync feature in this repo.

### 4.1 Never read the full spec

The local spec from [Task A0](#a0-obtain-a-complete-openapi-spec-resolved--reference-only-do-not-commit)
is **6.6 MB of JSON (903 paths, 615 schemas)**. Reading it wholesale will exhaust an
agent's context in one call and produce nothing useful.

- **First** check the verified tables already in Task A0 and in each epic — paths,
  sync body shapes, and per-plugin extra fields are recorded there precisely so no
  agent needs to open the file.
- **If** something genuinely is not in those tables, query it, do not read it:

```bash
python3 -c "
import json; s=json.load(open('/tmp/pulp-spec/local-pulp.json'))['components']['schemas']
d=s['deb.AptRemote']; print(d.get('required')); print(list(d['properties']))
"
```

The committed `openapi/pulp.json` is smaller but **incomplete** (561 paths, no deb,
no `/status/`). Do not use it as the source of truth.

### 4.2 Verify agent output — do not trust the summary

A subagent's final report is a **self-report**, not evidence. Observed in this repo:
an agent listed two files under `files_created` that already existed and contained a
previous agent's work, which read as clobbering. It turned out to be a mislabelled
overwrite that preserved the earlier content — but only a direct check established that.

After every task, the distributor should independently:

1. Run the build with env vars set (see [Definition of done](#definition-of-done)).
2. Run `npm run lint` and confirm the count is still **3**, not merely "no new errors".
3. `grep` for the specific symbols the task was supposed to add **and** for symbols an
   earlier task added to the same file, to prove nothing was lost.
4. Confirm new routes appear in the build's route list.

### 4.3 Sequential by default; parallel only on disjoint files

Agents share one working tree. Two agents editing the same file will silently lose
each other's work. These files are touched by many epics and are the usual collision
points:

```
services/pulp/types.ts
services/pulp/remote-service.ts
services/pulp/repository-management-service.ts
app/repositories/list/page.tsx      (1,168 lines)
app/repositories/edit/page.tsx      (1,000 lines)
app/remotes/list/page.tsx           (637 lines)
components/pulp/management-sidebar.tsx
```

Before dispatching two tasks concurrently, list the files each will touch and confirm
the sets are disjoint. If they overlap, run them **sequentially** and re-verify between
runs. Epic A exists partly to shrink this list.

### 4.4 Keep context small

- Reference code as `path:line`; do not paste whole files into a brief.
- Prefer `search_files` / `grep` over reading a 1,000-line page in full.
- Give an agent the one epic it is working on, not this entire document.
- Long, exploratory work belongs in a subagent: only its summary returns to the
  parent, so the bulky intermediate output never enters the distributor's context.

### 4.5 What every task brief must contain

The briefs that worked in this repo all carried the same five things:

1. The **exact endpoint(s)** and verified field shapes — never "look it up".
2. The **template file to mirror** (e.g. "follow `app/api/pulp/remotes/rpm/route.ts`").
3. The **layout.tsx requirement** for any new feature folder (see Conventions).
4. The **build + lint gate**, including the baseline of 3 pre-existing problems.
5. An explicit **"do not run git, do not create branches, do not commit"** —
   agents will otherwise commit to whatever branch is checked out, which
   `AGENT_GUIDE.md` forbids. All git work is the distributor's, per
   [§5](#5-branching-and-integration-workflow).

Add for this fork specifically: **do not modify `openapi/pulp.json`, `README.md`,
`TASKS.md`, or the changelog** unless the task is explicitly a docs task.

---

## 5. Branching and integration workflow

**This is mandatory for every task in this document.** It exists because this
repository is a **fork intended to merge upstream** — every feature must stay
individually reviewable and individually revertable.

### 5.1 The rule

```
main                     <- upstream-mergeable at all times; never commit here
 └── devel               <- integration branch; all features land here
      ├── feat/epic-a-plugin-registry     <- branched FROM devel
      ├── fix/deb-remote-distributions    <- branched FROM devel
      └── feat/task-cancel                <- branched FROM devel
```

1. **Branch from `devel`**, never from `main` and never from another feature branch.
2. **Merge back into `devel`** when the feature is complete and verified.
3. **Keep the feature branch.** Do **not** delete it after merging — not locally,
   not on the remote. It is the review unit for the upstream PR.
4. **Verify the branch could merge into `main`** before considering the task done
   (see 5.3). A feature that cannot cleanly reach `main` is not finished.

`AGENT_GUIDE.md` §3.4 still applies: **never commit to `main`**, and never create a
branch silently — propose the name and get confirmation.

### 5.2 Per-feature procedure

```bash
# 1. start from an up-to-date devel
git checkout devel
git pull --ff-only            # if the remote has moved

# 2. branch (propose the name first, do not create silently)
git checkout -b feat/<epic>-<short-description>

# ... implement, then satisfy the Definition of done ...

# 3. merge into devel, keeping a merge commit so the feature stays one reviewable unit
git checkout devel
git merge --no-ff feat/<epic>-<short-description>

# 4. DO NOT delete the branch
#    no `git branch -d`, no `git push origin --delete`
```

Use `--no-ff` deliberately: a fast-forward merge dissolves the feature into `devel`'s
history and makes the upstream PR harder to assemble.

Branch naming follows the existing convention in this repo
(`feat/remotes-and-sync`): `feat/`, `fix/`, `refactor/`, `docs/` prefixes,
lowercase, hyphen-separated.

### 5.3 Verify mergeability into `main`

Run this **per feature branch**, before calling the task done. It checks for conflicts
without modifying any branch, any file, or the working tree:

```bash
# exit 0 = merges cleanly into main; exit 1 = conflicts
git merge-tree --write-tree main feat/<branch> >/dev/null
echo "exit=$?   # 0 clean, 1 conflicts"
```

Verified working on git 2.55.0. Note the **older** three-argument form
(`git merge-tree <base> <a> <b>`) prints a diff even on a clean merge and returns 0
regardless — do not use it for this check.

If git is older than 2.38, use a non-destructive trial merge instead:

```bash
git checkout -b _mergecheck main
git merge --no-commit --no-ff feat/<branch>   # inspect result
git merge --abort
git checkout devel && git branch -D _mergecheck
```

If the check reports conflicts, resolve them **on the feature branch** (rebase onto or
merge in the newer `main`), not during the upstream PR.

**Current baseline:** `devel` is 1 commit ahead of `main`, and `main` has no unique
commits — so `devel` fast-forwards into `main` cleanly today. Keep it that way; if
`main` ever diverges, every open feature branch needs re-checking.

### 5.4 What agents must NOT do

State this explicitly in every task brief:

- Do **not** run `git` at all — no branching, no committing, no merging.
- Do **not** delete or force-push any branch.
- Leave changes uncommitted in the working tree; the distributor handles all git
  operations and verification.

This is deliberate. Agents share one working tree, and an agent that commits on
whatever branch happens to be checked out can silently put work on `main`.

### 5.5 Keeping the upstream PR clean

- One epic (or one coherent sub-task group) per branch — not one branch for all of
  Epic A.
- Do not bundle the `openapi/pulp.json` refresh with feature work; if it is ever
  wanted upstream it goes in its **own** branch and PR (see Task A0).
- Docs-only changes (`README.md`, `TASKS.md`, changelog) belong in `docs/` branches,
  separate from code, and only when the user has asked for them
  (`AGENT_GUIDE.md` §4).

---

## Epic A — Generic plugin registry

**Priority:** P0 — blocks Epics C, D, F, H
**Why:** eliminates the ~90% duplication measured above; makes a new plugin a
config entry instead of ~600 new lines.

### A0. Obtain a complete OpenAPI spec (RESOLVED — reference only, do not commit)

A full spec covering every target plugin is available from the user's local test server.

```bash
# NOTE: newer pulpcore moved this path — /openapi.json returns 404.
curl -u admin:admin "http://localhost:8080/pulp/api/v3/docs/api.json" \
  -o /tmp/pulp-spec/local-pulp.json
```

**Use this as the field-shape reference for all tasks below.**

> **Do NOT replace the committed `openapi/pulp.json`.** This repository is a fork
> intended to merge upstream. The committed spec comes from `packages.redhat.com`
> (the maintainer's reference); swapping it is a 3 MB -> 6.6 MB diff with a different
> `servers` URL and plugin set. If a refresh is genuinely wanted upstream, propose it
> as its **own separate PR**, never bundled with feature work.

| | committed `openapi/pulp.json` | local test server |
| --- | --- | --- |
| Paths | 561 | **903** |
| Schemas | — | **615** |
| Source | `packages.redhat.com` | `localhost:8080` |
| pulpcore | 3.102.0 | 3.116.1 |
| **deb** | **absent** | **3.10.0** |
| Extra plugins | — | ansible 0.30.0, ostree 2.6.1 |
| `/status/` | **absent** | **present** (unblocks B3) |

**Verified plugin paths** (from the local spec — seed the Epic A registry with these):

| kind | repository | remote | distribution | publication | sync |
| --- | --- | --- | --- | --- | --- |
| rpm | `/repositories/rpm/rpm/` | `/remotes/rpm/rpm/`, `/remotes/rpm/uln/` | `/distributions/rpm/rpm/` | `/publications/rpm/rpm/` | yes |
| deb | `/repositories/deb/apt/` | `/remotes/deb/apt/` | `/distributions/deb/apt/` | `/publications/deb/apt/`, `.../verbatim/` | yes |
| file | `/repositories/file/file/` | `/remotes/file/file/`, `/remotes/file/git/` | `/distributions/file/file/` | `/publications/file/file/` | yes |
| python | `/repositories/python/python/` | `/remotes/python/python/` (+`from_bandersnatch`) | `/distributions/python/pypi/` | `/publications/python/pypi/` | yes |
| npm | `/repositories/npm/npm/` | `/remotes/npm/npm/` | `/distributions/npm/npm/` | — | yes |
| gem | `/repositories/gem/gem/` | `/remotes/gem/gem/` | `/distributions/gem/gem/` | `/publications/gem/gem/` | yes |
| maven | `/repositories/maven/maven/` | `/remotes/maven/maven/` | `/distributions/maven/maven/` | — | **no** |

**Verified sync body shapes** (drives the registry's `syncFlavor`):

| schema | properties |
| --- | --- |
| `RpmRepositorySyncURL` | `remote`, `mirror`, `sync_policy`, `skip_types`, `optimize` |
| `AptRepositorySyncURL` | `remote`, `mirror`, `optimize` |
| `FileRepositorySyncURL` | `remote`, `mirror`, `optimize` |
| `RepositorySyncURL` (generic) | `remote`, `mirror` |

**Gotchas for Epic H:** `maven` has **no sync endpoint** (pull-through only) — the
registry needs `supportsSync: false`. `npm` and `maven` have **no publications**.
`python` remotes add `includes`, `excludes`, `prereleases`, `package_types`,
`keep_latest_packages`, `exclude_platforms`, `provenance`; `gem` adds `prereleases`,
`includes`, `excludes`; `npm` and `maven` add nothing beyond the common remote fields.

### A1. Define the plugin descriptor
Create `lib/pulp-plugins.ts` exporting a typed registry. Each entry describes one
content family:

```
{ kind, label, repositoryPath, remotePath, distributionPath, publicationPath,
  supportsPublish, supportsSync, syncFlavor: "sync_policy" | "mirror",
  extraRemoteFields, extraRepoFields }
```

Seed with the three verified families:
- `rpm`  -> `/repositories/rpm/rpm/`, `/remotes/rpm/rpm/`, `syncFlavor: "sync_policy"`
- `deb`  -> `/repositories/deb/apt/`, `/remotes/deb/apt/`, `syncFlavor: "mirror"`,
  extra remote field `distributions`
- `file` -> `/repositories/file/file/`, `/remotes/file/file/`, `syncFlavor: "mirror"`

**Verify:** unit-free; `npm run build` passes. No behavior change yet.

### A2. Collapse remote routes to one dynamic route
Replace `app/api/pulp/remotes/{rpm,deb,file}/route.ts` with
`app/api/pulp/remotes/[kind]/route.ts` driven by the registry. Preserve exactly:
secret omission (`assignSecretIfPresent`), 202-task handling, cookie-clear on 401/403,
per-kind path guards. Reject unknown `kind` with 400.

**Verify:** all three remote kinds still list/create/edit/delete; build clean;
`/api/pulp/remotes/[kind]` in route list.

### A3. Collapse sync routes to one dynamic route
Replace the three `repositories/*/sync/route.ts` with
`app/api/pulp/repositories/[kind]/sync/route.ts`. Branch the request body on
`syncFlavor`: `sync_policy` + `optimize` for rpm, `mirror` + `optimize` otherwise.

**Verify:** rpm sync still sends `sync_policy`; deb/file still send `mirror`.

### A4. Collapse repository CRUD routes
Same treatment for `repositories/{rpm,deb,file}` list/patch/delete and the
`*/create` and `*/publish` routes. Keep RPM's larger writable field set
(serializer-specific fields) expressed via the registry's `extraRepoFields`.

### A5. Make the client service registry-driven
Collapse `pulpRemoteService.{list,create,update,remove}{Rpm,Deb,File}` (12 methods)
into `list(kind)`, `create(kind, payload)`, `update(kind, href, payload)`,
`remove(kind, href)`. Same for `syncRpm/syncDeb/syncFile` -> `sync(kind, payload)`.
Update all call sites.

**Verify:** build clean; remotes page and repo list still work for all three kinds.

### A6. Make list pages iterate the registry
`app/remotes/list/page.tsx` and `app/repositories/list/page.tsx` currently hardcode
`("rpm" | "deb" | "file")` toggles. Drive the toggle buttons and per-kind logic from
the registry so a new plugin appears automatically.

**Verify:** UI identical for existing kinds; adding a registry entry adds a tab with
no page edits.

---

## Epic A2 — Debian remote correctness (bug fix)

**Priority:** P0 — this is a **live defect**, not an enhancement.
**Discovered:** by validating the shipped deb implementation against the complete
local spec (A0), which was unavailable when the deb code was written.

Debian remotes were implemented without a spec (the committed `openapi/pulp.json`
has no APT schemas). Most of it turned out correct — `/remotes/deb/apt/`, the
`distributions` field, and `AptRepositorySyncURL` = `{remote, mirror, optimize}`
with no `sync_policy` are all confirmed. Two problems remain.

### A2-1. `distributions` is REQUIRED, treated as optional (bug)
`deb.AptRemote` declares `required: ['distributions', 'name', 'url']`.
`app/api/pulp/remotes/deb/route.ts` sends `distributions` only when supplied, and
`app/remotes/list/page.tsx` presents it as an optional field. **Creating a deb remote
without it fails server-side with a 400.**

Fix: mark it required in the UI (validate before submit) and always send it on create.
Keep PATCH semantics unchanged (only send when the user edits it).

**Verify:** against the live test server —
`POST /remotes/deb/apt/` with `{name, url}` only should be rejected; with
`{name, url, distributions: "bookworm"}` should succeed.

### A2-2. Missing deb remote fields
`deb.AptRemote` exposes 7 fields the UI does not: `components`, `architectures`,
`sync_sources`, `sync_udebs`, `sync_installer`, `gpgkey`,
`ignore_missing_package_indices`. `components` and `architectures` in particular are
routinely needed to sync a real APT mirror without pulling everything.

Fix: add them to the deb remote form, type, and route. Fold into the Epic A registry's
`extraRemoteFields` if A1 has landed; otherwise add directly and migrate later.

---

## Epic B — Task control and server status

**Priority:** P0 — pure operational depth, no dependencies, safe to start now.

### B1. Task cancel
`PATCH {task_href}` with body `{"state": "canceled"}` (verified: schema
`PatchedTaskCancel`, only `canceled` accepted). Add a **Cancel** action to
`app/tasks/list/page.tsx` for tasks in `running` / `waiting`, with confirmation.

### B2. Task purge
`POST /tasks/purge/` (verified present). Add a maintenance page or a control on the
tasks page to purge completed tasks older than a chosen date, with state filters.
Treat as destructive: require explicit confirmation naming what will be purged.

### B3. Server status page
`GET /pulp/api/v3/status/` — **verified present** on the test server (it is absent
from the committed spec, which is why this task previously carried uncertainty).
Requires no authentication on most deployments. Show versions, installed plugins,
online workers / API apps / content apps, database and Redis connectivity, storage
totals, and `content_settings`. This is the UI equivalent of `pulp status`.

Note on the test server: `redis_connection.connected` is **false** and
`domain_enabled` is **false** — render both states gracefully rather than assuming
a healthy/enabled shape.
**Also useful downstream:** the installed-plugin list can validate the Epic A registry.

### B4. Long-running task strategy
`waitForTask` in `app/api/pulp/repositories/_server.ts` gives up after
**60 attempts x 5s = 5 minutes**. A large first sync (e.g. full EPEL) exceeds this and
surfaces a timeout error even though the task is still running server-side.
Design and implement one of:
(a) dispatch-and-return the task href, letting the UI poll; or
(b) a configurable, longer timeout for sync specifically.
Option (a) is preferred and aligns with `pulp task show`. Coordinate with B5.

### B5. Task detail view
`GET {task_href}` — show state, timestamps, worker, parent/child tasks, task group,
`progress_reports`, `created_resources`, and full error traceback. Link to it from
every "task dispatched" banner already present in the app.

### B6. Task groups
`GET /task-groups/` (verified). List task groups and drill into member tasks.

---

## Epic C — Search, filtering, and pagination

**Status:** C1-C4 DONE — branch `feat/search-filtering-pagination`, commit `ffcd033`,
merged into `devel`. C5-C7 (simple finders) are on the same branch.
Verified against the live 3.116.1 test server.
**Priority:** P1 — highest day-to-day usability gain.
**Depends on:** A (ideally), so filters are defined once.

Verified: `GET /repositories/rpm/rpm/` accepts **32 query params**, including
`name`, `name__contains`, `name__icontains`, `name__startswith`, `name__in`,
`ordering`, `q`, `pulp_label_select`, `limit`, `offset`, plus `fields` /
`exclude_fields`. The app currently sends only `limit` and `offset`.

### C1. Shared list-query hook/util (DONE)
Built as `lib/pulp-list-query.ts` (pure: `PulpListQuery`, `buildPulpListParams`,
`parsePulpListQuery`, `pulpListQueryToUrlParams`) plus
`components/pulp/use-pulp-list-query.ts`, which keeps the state in the URL via
`router.replace` following `app/roles/list/page.tsx`. Shared UI lives in
`components/pulp/list-query-bar.tsx` (search box, page-size select,
`SortableColumnHeader`) and `components/pulp/list-pagination.tsx`.
Server-side forwarding is `buildUpstreamListParams` in
`app/api/pulp/repositories/_server.ts`, an allowlist of `ordering`,
`name__icontains`, `pulp_label_select` and `q` plus per-route extras.

### C2. Apply to repositories and remotes lists (DONE)
Name search (`name__icontains`), sortable Name column, page-size selector and
pagination on both lists, all server-side. `pulpRemoteService.list` now returns the
paginated response rather than only `results`; the remote pickers inside the
repositories page still request the unfiltered list.

### C3. Apply to content, tasks, distributions lists (DONE)
Same treatment. Tasks gained a state filter (the seven states verified in the spec)
and a `started_at` range. Two spec findings shaped this:
`/tasks/` has **no** `name__icontains`, so task search uses `name__contains`; and the
generic `/content/` endpoint advertises **no name filter at all**, so that page gets
paging and ordering only rather than a search box that cannot work.

### C4. Full-text `q` support (DONE)
An advanced filter box on all five lists, collapsed by default, with inline help for
the `NOT` / `AND` / `OR` syntax (e.g. `state=completed AND name__contains=sync`).
A malformed expression returns `{"q": ["Syntax error in expression."]}`, which
`pulpErrorDetailFromBody` already renders as readable text.

### C5. Repository finder: by remote

`GET /repositories/{kind}/` accepts `remote` (a remote href). Verified live:
`?remote=/pulp/api/v3/remotes/rpm/rpm/<id>/` returned exactly the repository bound
to it. Add a remote dropdown beside the search box on `app/repositories/list/page.tsx`,
listing the current kind's remotes (the page already loads them for the sync modal).

### C6. Distribution finder: by repository

`GET /distributions/` accepts `repository` (a repository href). Verified live:
`?repository=/pulp/api/v3/repositories/rpm/rpm/<id>/` returned `epel-10-dist`.
Add a repository dropdown to `app/distributions/list/page.tsx`. Distributions are
cross-plugin, so the options come from every kind in the registry.

### C7. Content finder: by repository and type

`GET /content/` accepts `repository_version` (a version href) and `pulp_type`.
Verified live: `?repository_version=<latest_version_href>` narrowed to that
repository's content, and `pulp_type=rpm.package` returned 35 units. An invalid type
answers 400 `{"pulp_type": ["Select a valid choice. ..."]}`.
The repository dropdown sends the repository's `latest_version_href`, giving
"content in repository X". The type dropdown is driven by a new `contentType` field
on the plugin registry (`rpm.package`, `deb.package`, `file.file`) rather than the
server's full 40-value enum, most of which is for plugins this app does not manage.

---

---

## Epic D — Labels

**Priority:** P1 — pervasive in the API (~80 endpoints), completely absent in the UI.
**Depends on:** A.

Verified: `POST {href}set_label/` and `POST {href}unset_label/` exist on
repositories, remotes, distributions, publications, content units, and domains.
List endpoints accept `pulp_label_select` for filtering.

### D1. Label service + generic API route
One `services/pulp/label-service.ts` plus a generic route taking any `pulp_href`.
Guard the href against an allowlist of known resource path prefixes.

### D2. Label editor component
Reusable key/value editor (add, edit, remove) usable from any detail page.

### D3. Surface labels on repositories, remotes, distributions
Show labels as chips in list rows; edit via the D2 component.

### D4. Filter by label
Wire `pulp_label_select` into the Epic C query builder.

---

## Epic E — Per-object RBAC

**Priority:** P1 — deployment is explicitly multi-user.
**Note:** the app already has global `/roles/` CRUD; this epic is about
**per-object** role assignment, which is a different and larger surface (111 endpoints).

### E1. Object-role service + routes
`GET {href}list_roles/`, `POST {href}add_role/`, `POST {href}remove_role/`.
Generic over resource href, same allowlist guard as D1.

### E2. "Access" panel component
Shows current role assignments (user/group + role) for an object; add and remove
assignments inline.

### E3. Surface on repositories, remotes, distributions
Add an Access tab or section to the relevant edit/detail pages.

### E4. `my_permissions` awareness
`GET {href}my_permissions/` returns the caller's effective permissions.
Use it to **disable/hide actions the user cannot perform**, instead of letting the
action fail with a 403 after the fact. This is the single biggest UX win of the epic.

---

## Epic F — Publications and distributions parity

**Priority:** P1
**Depends on:** A.

Gap: the app can *trigger* a publish but cannot browse publications; distributions
exist for RPM create only. Verified: `/publications/{file,gem,hugging_face,python,rpm}/`
and 12 distribution families.

### F1. Publications list page
Browse publications per plugin: created time, repository version, distribution links.
Delete with confirmation.

### F2. Distributions for deb and file
Extend beyond the RPM-only create path.

### F3. Distribution edit
`PATCH` name, `base_path`, `repository` vs `publication` binding, `content_guard`.
The service already has `update()` — it is unused by any page.

### F4. Distribution create from publication
Support distributing a specific publication, not only a repository.

---

## Epic G — Repository version operations

**Priority:** P2
**Depends on:** A.

### G1. Generalize version history beyond RPM
`{href}versions/` exists for every repository family; the app implements it for RPM
only (`app/repositories/versions`, `app/repositories/version`).

### G2. Repository `modify`
`POST {href}modify/` — add/remove content units against a repository, and
`base_version` rollback. This is `pulp repository content modify`.

### G3. Version repair
`POST {version_href}repair/`.

### G4. Reclaim disk space
`POST /repositories/reclaim_space/` (verified) — takes a repository list.

---

## Epic H — New plugin families

**Priority:** P2 — **blocked on Epic A.** Do not start earlier.
**Spec:** field shapes confirmed via Task A0 — see the verified path and sync tables there.

Verified families available: `python/python`, `npm/npm`, `gem/gem`, `maven/maven`
(repositories, remotes, distributions; publications for python and gem only).

### H1. Python
Registry entry. Verified python remote extras: `includes`, `excludes`, `prereleases`,
`package_types`, `keep_latest_packages`, `exclude_platforms`, `provenance`.
Distribution is `/distributions/python/pypi/`; publication `/publications/python/pypi/`;
sync supported. A second remote flavor exists (`/remotes/python/python/from_bandersnatch/`)
— out of scope unless requested.

### H2. npm
Registry entry. **No extra remote fields** beyond the common set. Sync supported.
**No publications** — the registry must model `supportsPublish: false`.

### H3. gem
Registry entry. Extra remote fields: `prereleases`, `includes`, `excludes`.
Publications and sync both supported.

### H4. maven
Registry entry. No extra remote fields. **No sync endpoint** (pull-through only) and
**no publications** — requires `supportsSync: false` and `supportsPublish: false`.
This is the entry that proves the registry models capability correctly; if the UI
shows a Sync action for maven, the registry is wrong.

Each of H1-H4 should be **a registry entry plus verification of the existing generic
flows** — if a plugin needs new route files, Epic A is incomplete; report back rather
than copy-pasting.

### H5. Content browsing per plugin
`/content/python/packages/`, `/content/npm/packages/`, `/content/gem/gem/`,
`/content/maven/artifact/`. Generalize the existing RPM-package content pattern.

---

## Epic I — Content guards

**Priority:** P2 — relevant to multi-user deployments.

Verified 8 types: `certguard/rhsm`, `certguard/x509`, `core/composite`,
`core/content_redirect`, `core/header`, `core/rbac`, `service/feature`.

### I1. Content guard list + delete
### I2. Create/edit RBAC and header guards (most commonly used)
### I3. Attach a guard to a distribution (pairs with F3)

---

## Epic J — Generic resource resolution

**Priority:** P3 — quality-of-life, mirrors `pulp show --href`.

Verified generic list endpoints exist: `/repositories/`, `/remotes/`,
`/distributions/`, `/publications/`, `/content/` — plugin-agnostic.

### J1. Global href lookup
Paste any `pulp_href` or PRN, resolve its type, redirect to the right detail page.
Generalize the existing `app/content/preview` pattern.

### J2. Global search
Single search box querying the generic list endpoints across resource types.

---

## Deferred

Explicitly **out of scope** for this phase; revisit when the drivers change.

| Item | Endpoints | Why deferred |
| --- | --- | --- |
| Import/export (backup/DR) | `/exporters/core/{filesystem,pulp}/`, `/importers/core/pulp/` | User did not select backup/DR focus |
| Alternate content sources | `/acs/{file,rpm}/` | Niche; revisit after Epic H |
| Domains (multi-tenancy) | `/domains/`, `/domains/migrate/` | Deployment is not multi-tenant |
| Signing services | `/signing-services/` | Read-only in API; low value alone |
| Upstream Pulps (replication) | `/upstream-pulps/` | Not in current workflow |
| Container plugin | `/repositories/container/*` etc. | User did not select Container |
| Artifacts admin | `/artifacts/` | Mostly covered by uploads + orphan cleanup |
| Access policies | `/access_policies/` | Advanced RBAC tuning; after Epic E |
| Global repair | `/repair/` | Rare, destructive; needs careful UX |
| Vulnerability reports | `/vuln_report*` | Availability is server-dependent |

---

## Known technical debt (not user-facing)

Flagged for whoever plans capacity; none of these are drive-by fixes.

1. **Page sizes.** `repositories/list/page.tsx` (1,168 lines) and
   `repositories/edit/page.tsx` (1,000) mix data loading, modals, and table
   rendering. Epic A/C touch them heavily — consider extracting modals into
   components *as part of* those epics rather than as a separate refactor.
2. **Pre-existing lint baseline.** 3 problems, listed under
   [Definition of done](#definition-of-done). Fix deliberately in their own task,
   never as a side effect.
3. **No test suite.** There is no test tooling in `package.json`; `npm run build`
   plus `npm run lint` are the only gates. Introducing Vitest + a few route-level
   tests would materially de-risk Epics A and C. Requires user approval
   (new dependency).
4. **`waitForTask` 5-minute ceiling.** See Task B4.
5. **Task state and date filters are not URL-mirrored.** Epic C put search,
   ordering, page, size, label and `q` in the URL, but `app/tasks/list/page.tsx`
   keeps its state filter and `started_at` range in local `useState`, so they
   survive paging but not a reload. Fold them into `PulpListQuery` when a task
   filter needs to be shareable as a link.
6. **`pulpDistributionService` has both `list()` and `listPaged()`.** Epic C added
   `listPaged` rather than change `list`, whose unpaginated call shape
   `app/repositories/list/page.tsx` relies on. Collapse to one method when that
   page is next touched (Epic F).
5. **Spec drift.** The committed `openapi/pulp.json` (561 paths, from
   `packages.redhat.com`) lags the local test server (903 paths) and is missing deb
   entirely. Do **not** replace it in this fork — see Task A0. Anyone reading field
   shapes from the committed file will get incomplete answers.
