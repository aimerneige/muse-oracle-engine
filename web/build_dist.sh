#!/usr/bin/env sh
set -eu

WEB_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT_DIR=$(CDPATH= cd -- "$WEB_DIR/.." && pwd)

cd "$ROOT_DIR"
go run ./web/tools/export_static_data.go

cd "$WEB_DIR"

rm -rf "$WEB_DIR/dist"

if [ "$#" -eq 0 ]; then
  npm run build:single -- --series lovelive,lovelive-sunshine,bocchi-the-rock --external-favicons --out web/dist/index.html
else
  npm run build:single -- "$@" --external-favicons --out web/dist/index.html
fi

cp \
  favicon.ico \
  favicon-16x16.png \
  favicon-32x32.png \
  apple-touch-icon.png \
  android-chrome-192x192.png \
  android-chrome-512x512.png \
  site.webmanifest \
  dist/
