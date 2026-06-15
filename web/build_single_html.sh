#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT_DIR"

if [ "$#" -eq 0 ]; then
  node web/tools/build_single_html.mjs --series lovelive,lovelive-sunshine --out web/dist/lovelive-engine.single.html
else
  node web/tools/build_single_html.mjs "$@"
fi
