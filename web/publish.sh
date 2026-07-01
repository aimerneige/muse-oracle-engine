#!/bin/bash
set -e


info() {
  printf "\033[0;32m$1\033[0m\n"
}

err() {
  printf "\033[0;31m$1\033[0m\n"
}


WEB_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ROOT_DIR=$(CDPATH= cd -- "$WEB_DIR/.." && pwd)

cd "$ROOT_DIR"


info "Deploying updates to GitHub..."

if [[ -d "$WEB_DIR/dist" ]]; then
  info "Deleting old dist directory..."
  rm -rf "$WEB_DIR/dist/"
fi

info "Generating static files..."
cd "$WEB_DIR"
./build_dist.sh

info "Pushing to github..."
cd dist
if [ ! -d .git ]; then
  git init --initial-branch=master
  git remote add origin git@github.com:aimerneige/lovelive.fan.git
fi
git add -A
msg="update site $(date)"
if [ -n "$*" ]; then
  msg="$*"
fi
git commit -m "$msg"
git push -f origin master
