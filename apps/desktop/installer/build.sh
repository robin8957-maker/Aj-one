#!/bin/sh
# Produces the native host. NSIS compile requires a Windows/makensis environment.
set -eu
cd "$(dirname "$0")/../src-tauri"
cargo build --release
echo "native host: target/release/aljwharah-one"
if command -v makensis >/dev/null 2>&1; then
  makensis ../installer/aljwharah.nsi
else
  echo "makensis not on this host — NSIS script is ready at installer/aljwharah.nsi"
fi
