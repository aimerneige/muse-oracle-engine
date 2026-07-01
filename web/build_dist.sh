#!/usr/bin/env sh
set -eu

WEB_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT_DIR=$(CDPATH= cd -- "$WEB_DIR/.." && pwd)

cd "$ROOT_DIR"
if [ "$#" -eq 0 ]; then
  go run ./web/tools/export_static_data.go --series lovelive,lovelive-sunshine,bocchi-the-rock --out web/src/generated/data.js
else
  go run ./web/tools/export_static_data.go --out web/src/generated/data.js "$@"
fi

cd "$WEB_DIR"

npm run build
