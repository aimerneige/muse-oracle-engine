#!/usr/bin/env sh
set -eu

WEB_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$WEB_DIR"

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
