#!/usr/bin/env bash
#
# Cross-builds the Windows installer from Linux/WSL.
#
# Why a script: electron-builder can package win32 from Linux, but three things
# have to be arranged by hand or the app ships Linux binaries and crashes on boot,
# and the NSIS step needs Wine, which this repo does not install on the host.
#
#   1. Native modules must be the win32/Electron builds. `@electron/rebuild` runs on
#      the host platform, so it downloads the *linux* prebuild and reports success.
#   2. ffmpeg-static and @napi-rs/keyring resolve their platform at install time.
#   3. NSIS + rcedit need Wine: we use the electronuserland/builder:wine image.
#
# Usage:
#   ./scripts/cross-build-windows.sh [build-dir]
#
# Prerequisites: docker (with the wine image pullable), network access, and a prior
# `npm ci` in the build directory.
#
# Optional env:
#   ELECTRON_ABI    Electron module ABI for the better-sqlite3 prebuild (default 145)
#   SKIP_TLS_CHECK  set to 1 when a corporate proxy intercepts TLS inside Docker
#
# Output: <build-dir>/dist/*.exe

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${1:-$ROOT}"
ELECTRON_ABI="${ELECTRON_ABI:-145}"
IMAGE="${BUILDER_IMAGE:-electronuserland/builder:wine}"

cd "$DEST"

log() { printf '\n== %s ==\n' "$1"; }

log "node_modules"
if [ ! -d node_modules ]; then
  npm ci --no-audit --no-fund
fi

log "ffmpeg-static win32"
npm_config_platform=win32 npm_config_arch=x64 node node_modules/ffmpeg-static/install.js

log "@napi-rs/keyring win32"
KEYRING_VERSION="$(node -p 'require("./node_modules/@napi-rs/keyring/package.json").version')"
rm -rf /tmp/frost-keyring && mkdir -p /tmp/frost-keyring
npm pack "@napi-rs/keyring-win32-x64-msvc@${KEYRING_VERSION}" --pack-destination /tmp/frost-keyring >/dev/null
rm -rf node_modules/@napi-rs/keyring-win32-x64-msvc
mkdir -p node_modules/@napi-rs/keyring-win32-x64-msvc
tar -xzf /tmp/frost-keyring/*.tgz -C node_modules/@napi-rs/keyring-win32-x64-msvc --strip-components=1

log "better-sqlite3 win32/electron prebuild"
BS3_VERSION="$(node -p 'require("./node_modules/better-sqlite3/package.json").version')"
ASSET="better-sqlite3-v${BS3_VERSION}-electron-v${ELECTRON_ABI}-win32-x64.tar.gz"
rm -rf /tmp/frost-bs3 && mkdir -p /tmp/frost-bs3
curl -sSL "https://github.com/WiseLibs/better-sqlite3/releases/download/v${BS3_VERSION}/${ASSET}" \
  -o "/tmp/frost-bs3/${ASSET}"
tar -xzf "/tmp/frost-bs3/${ASSET}" -C /tmp/frost-bs3
mkdir -p node_modules/better-sqlite3/build/Release
cp "$(find /tmp/frost-bs3 -name '*.node' | head -1)" \
  node_modules/better-sqlite3/build/Release/better_sqlite3.node

log "native binaries must be PE32+"
for f in \
  node_modules/better-sqlite3/build/Release/better_sqlite3.node \
  node_modules/ffmpeg-static/ffmpeg.exe \
  node_modules/@napi-rs/keyring-win32-x64-msvc/*.node; do
  file -b "$f" | grep -q "MS Windows" || {
    echo "ERROR: $f is not a Windows binary" >&2
    file "$f" >&2
    exit 1
  }
  echo "  ok  $f"
done

log "renderer"
npm run build:renderer

log "windows resources"
export TARGET_PLATFORM=win32 TARGET_ARCH=x64
node scripts/download-whisper-cpp.js --current
node scripts/download-llama-server.js --current
node scripts/download-sherpa-onnx.js --current
node scripts/download-yt-dlp.js --current
node scripts/download-qdrant.js --current
node scripts/download-meeting-aec-helper.js --current
node scripts/download-whisper-vad-model.js
node scripts/download-minilm.js
node scripts/download-diarization-models.js --output-dir resources/bin/diarization-models
node scripts/download-nircmd.js --all
./scripts/build-windows-key-listener-mingw.sh

log "electron-builder (wine container)"
DOCKER_ENV=()
if [ "${SKIP_TLS_CHECK:-0}" = "1" ]; then
  # Corporate proxies that intercept TLS leave the container unable to verify the
  # chain. Prefer fixing the CA; this exists for build machines where that is not
  # possible.
  DOCKER_ENV+=(-e NODE_TLS_REJECT_UNAUTHORIZED=0)
fi

docker run --rm \
  -v "$PWD:/project" \
  -v "${HOME}/.cache/frost-eb/electron:/root/.cache/electron" \
  -v "${HOME}/.cache/frost-eb/electron-builder:/root/.cache/electron-builder" \
  -w /project \
  -e CSC_IDENTITY_AUTO_DISCOVERY=false \
  "${DOCKER_ENV[@]}" \
  "$IMAGE" \
  npx electron-builder --win --publish never \
    --config electron-builder.unsigned-win.json \
    -c.npmRebuild=false

log "artifacts"
ls -lh dist/*.exe
