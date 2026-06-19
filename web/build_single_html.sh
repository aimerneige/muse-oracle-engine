#!/usr/bin/env sh
set -eu

WEB_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$WEB_DIR"

if [ "$#" -eq 0 ]; then
  npm run build:single -- --series lovelive,lovelive-sunshine,bocchi-the-rock --out web/dist/index.html
else
  npm run build:single -- "$@" --out web/dist/index.html
fi
