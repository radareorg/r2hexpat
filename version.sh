#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PKG="$SCRIPT_DIR/package.json"
LOCK="$SCRIPT_DIR/package-lock.json"
PLUGIN="$SCRIPT_DIR/r2/plugin.ts"

for f in "$PKG" "$LOCK" "$PLUGIN"; do
  if [ ! -f "$f" ]; then
    printf '%s\n' "version.sh: missing file: $f" >&2
    exit 1
  fi
done

current_version=$(awk -F'"' '/"version": "/ { print $4; exit }' "$PKG")

if [ "$#" -eq 0 ]; then
  printf '%s\n' "$current_version"
  exit 0
fi

new_version=$1

if ! printf '%s\n' "$new_version" | grep -Eq '^[0-9]+(\.[0-9]+){2}$'; then
  printf '%s\n' "version.sh: expected version in the form X.Y.Z, got: $new_version" >&2
  exit 1
fi

plugin_matches=$(grep -c '^const VERSION = "' "$PLUGIN" || true)

if [ "$plugin_matches" -ne 1 ]; then
  printf '%s\n' "version.sh: expected exactly one version string in $PLUGIN, found $plugin_matches" >&2
  exit 1
fi

plugin_version=$(awk -F'"' '/^const VERSION = "/ { print $2; exit }' "$PLUGIN")

perl -pi -e "s/^const VERSION = \"[^\"]*\"/const VERSION = \"$new_version\"/" "$PLUGIN"
# only the first "version" key in package.json (the package itself)
perl -pi -e "s/\"version\": \"[^\"]*\"/\"version\": \"$new_version\"/ if !\$done && (\$done = /\"version\": /)" "$PKG"
# package-lock.json: the top-level entry and the root package ("") entry
perl -0pi -e "s/\A(\{\s*\"name\": \"r2hexpat\",\s*\"version\": \")[^\"]*\"/\${1}$new_version\"/; s/(\"\": \{\s*\"name\": \"r2hexpat\",\s*\"version\": \")[^\"]*\"/\${1}$new_version\"/" "$LOCK"

printf 'package: %s -> %s\n' "$current_version" "$new_version"
printf 'plugin:  %s -> %s\n' "$plugin_version" "$new_version"
