#!/usr/bin/env sh
set -eu

WEB_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$WEB_DIR"

if [ "$#" -eq 0 ]; then
  npm run build:single -- --series lovelive,lovelive-sunshine,bocchi-the-rock --out web/dist/lovelive-engine.single.html
else
  npm run build:single -- "$@"
fi
