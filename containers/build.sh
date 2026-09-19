#!/usr/bin/env bash
#
# Builds the Pulp Admin UI container images and tags them.
#
#   containers/build.sh                       # debian only, local tags
#   containers/build.sh all                   # debian, alpine and ubi
#   containers/build.sh --registry ghcr.io/simonlonc --push all
#
# Options:
#   -r, --registry REGISTRY  registry and namespace to prefix the tags with
#   -n, --name NAME          image name (default: pulpadminui)
#   -e, --engine ENGINE      podman or docker (default: whichever is on PATH)
#   -p, --push               push every tag after a successful build
#       --no-stable          build only the versioned tags
#
# Tag scheme, for version 0.0.6:
#
#   debian   pulpadminui:v0.0.6-debian13     pulpadminui:stable-debian13
#   alpine   pulpadminui:v0.0.6-alpine3.24   pulpadminui:stable-alpine3.24
#   ubi      pulpadminui:v0.0.6-ubi9         pulpadminui:stable-ubi9
#
# Debian is the default variant, so it also gets the unsuffixed
# pulpadminui:v0.0.6, pulpadminui:stable and pulpadminui:latest.

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Distro tag fragments. This is the only place the base-image versions are
# named; each Containerfile defaults to the same ones through its ARGs.
declare -A DISTRO_TAG=(
  [debian]="debian13"
  [alpine]="alpine3.24"
  [ubi]="ubi9"
)

DEFAULT_VARIANT="debian"

image_name="pulpadminui"
registry=""
engine=""
push="no"
stable="yes"
variants=()

die() {
  echo "build.sh: $*" >&2
  exit 1
}

usage() {
  sed -n '3,24p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [ $# -gt 0 ]; do
  case "$1" in
    -r|--registry) registry="${2:-}"; shift 2 ;;
    -n|--name)     image_name="${2:-}"; shift 2 ;;
    -e|--engine)   engine="${2:-}"; shift 2 ;;
    -p|--push)     push="yes"; shift ;;
    --no-stable)   stable="no"; shift ;;
    -h|--help)     usage 0 ;;
    all)           variants=(debian alpine ubi); shift ;;
    debian|alpine|ubi) variants+=("$1"); shift ;;
    *)             echo "build.sh: unknown argument '$1'" >&2; usage 1 ;;
  esac
done

[ ${#variants[@]} -gt 0 ] || variants=("$DEFAULT_VARIANT")

if [ -z "$engine" ]; then
  for candidate in podman docker; do
    if command -v "$candidate" >/dev/null 2>&1; then
      engine="$candidate"
      break
    fi
  done
fi
[ -n "$engine" ] || die "no container engine found; install podman or docker, or pass --engine"
command -v "$engine" >/dev/null 2>&1 || die "engine '$engine' is not on PATH"

version="$(node -p "require('$repo_root/package.json').version")"
[ -n "$version" ] || die "could not read the version from package.json"

prefix="$image_name"
[ -n "$registry" ] && prefix="${registry%/}/$image_name"

# Echoes every tag one variant should carry, one per line.
tags_for() {
  local variant="$1" distro="${DISTRO_TAG[$1]}"
  echo "$prefix:v$version-$distro"
  if [ "$stable" = "yes" ]; then
    echo "$prefix:stable-$distro"
  fi
  if [ "$variant" = "$DEFAULT_VARIANT" ]; then
    echo "$prefix:v$version"
    if [ "$stable" = "yes" ]; then
      echo "$prefix:stable"
      echo "$prefix:latest"
    fi
  fi
}

for variant in "${variants[@]}"; do
  containerfile="$repo_root/containers/Containerfile.$variant"
  [ -f "$containerfile" ] || die "missing $containerfile"

  mapfile -t tags < <(tags_for "$variant")

  tag_args=()
  for tag in "${tags[@]}"; do
    tag_args+=(-t "$tag")
  done

  echo "==> building $variant: ${tags[*]}"
  "$engine" build -f "$containerfile" "${tag_args[@]}" "$repo_root"

  if [ "$push" = "yes" ]; then
    for tag in "${tags[@]}"; do
      echo "==> pushing $tag"
      "$engine" push "$tag"
    done
  fi
done

echo "==> done"
