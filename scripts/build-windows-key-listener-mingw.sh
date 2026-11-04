#!/usr/bin/env bash
#
# Builds resources/windows-key-listener.exe with mingw-w64 inside Docker.
#
# Why this exists: the Windows build needs this helper for global hotkeys that
# globalShortcut cannot register (modifier-only combos like the default
# Control+Super, and push-to-talk key up/down). `download-windows-key-listener.js`
# looks for a `windows-key-listener-v*` release, which this fork never published,
# so a cross-build from Linux has no prebuilt binary to fetch and no local MSVC.
#
# Usage:
#   ./scripts/build-windows-key-listener-mingw.sh
#   MINGW_IMAGE=debian:bookworm-slim ./scripts/build-windows-key-listener-mingw.sh
#
# Output: resources/bin/windows-key-listener.exe (gitignored)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE="${MINGW_IMAGE:-node:22-slim}"
SOURCE="/src/resources/windows-key-listener.c"
OUTPUT_DIR="$ROOT/resources/bin"

mkdir -p "$OUTPUT_DIR"

docker run --rm \
  -v "$ROOT:/src:ro" \
  -v "$OUTPUT_DIR:/out" \
  "$IMAGE" bash -lc '
    set -e
    apt-get update -qq
    apt-get install -y -qq --no-install-recommends mingw-w64 > /dev/null
    x86_64-w64-mingw32-gcc -O2 -static '"$SOURCE"' -o /out/windows-key-listener.exe -luser32
  '

file "$OUTPUT_DIR/windows-key-listener.exe"
