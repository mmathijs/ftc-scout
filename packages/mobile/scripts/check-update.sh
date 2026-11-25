#!/usr/bin/env bash
# Can the changes between two commits go out as an over-the-air update?
#
# An update can only contain JavaScript and assets. A native change (a native package, a config
# plugin, the Expo SDK) needs a runtimeVersion bump in app.config.ts and a new store build: an
# update that needs native code the installed build doesn't have crashes the app.
#
# Used by the update-check job in .github/workflows/mobile.yml and by .husky/pre-push, so both
# decide the same way. See "Over-the-air updates" in packages/mobile/README.md.
#
# Usage: packages/mobile/scripts/check-update.sh <base> <head>
#   0   the app changed, JavaScript-only: publish it as an update
#   1   a native change without a runtimeVersion bump
#   2   <base> or <head> isn't a commit here
#   10  nothing in the app changed: no update needed
#   11  runtimeVersion changed: make a store build instead of an update
set -euo pipefail

base=${1:?usage: check-update.sh <base> <head>}
head=${2:?usage: check-update.sh <base> <head>}
cd "$(git rev-parse --show-toplevel)"

for commit in "$base" "$head"; do
    if ! git cat-file -e "${commit}^{commit}" 2>/dev/null; then
        echo "check-update: $commit isn't a commit in this repository."
        exit 2
    fi
done

# What ends up in the app's bundle.
bundle=$(git diff --name-only "$base" "$head" -- \
    packages/common packages/web/src/lib packages/web/static/img packages/mobile \
    ':(glob,exclude)packages/mobile/**/*.md' ':(exclude)packages/mobile/store')
if [ -z "$bundle" ]; then
    echo "Nothing in the app changed, so there's no update to publish."
    exit 10
fi

# The files where native changes show up.
native=$(git diff --name-only "$base" "$head" -- \
    packages/mobile/package.json packages/mobile/package-lock.json \
    packages/mobile/app.config.ts packages/mobile/plugins)
if [ -z "$native" ]; then
    echo "A JavaScript-only change to the app: it can go out as an update."
    exit 0
fi

runtime() {
    git show "$1:packages/mobile/app.config.ts" 2>/dev/null |
        grep -oE 'runtimeVersion: *"[^"]*"' | grep -oE '"[^"]*"' || true
}
before=$(runtime "$base")
after=$(runtime "$head")
if [ "$before" != "$after" ]; then
    echo "runtimeVersion changed (${before:-none} -> ${after:-none}), so no installed build can use an"
    echo "update. Make a new store build: run the Mobile App workflow with release: google-play."
    exit 11
fi

echo "This changes ${native//$'\n'/ } but not runtimeVersion (${after:-none})."
echo "If the change is native, bump runtimeVersion in app.config.ts and make a store build."
echo "If it's JavaScript-only (e.g. a JS-only package), publish the update by hand: run the Mobile"
echo "App workflow with release: update."

# Locally, say which of the changed dependencies have native code, to help decide.
if [ -d packages/mobile/node_modules ] && command -v node >/dev/null; then
    git show "$base:packages/mobile/package.json" >"${TMPDIR:-/tmp}/check-update-base.json" 2>/dev/null ||
        echo "{}" >"${TMPDIR:-/tmp}/check-update-base.json"
    git show "$head:packages/mobile/package.json" >"${TMPDIR:-/tmp}/check-update-head.json"
    node - "${TMPDIR:-/tmp}/check-update-base.json" "${TMPDIR:-/tmp}/check-update-head.json" <<'EOF'
const fs = require("fs");
const path = require("path");
const read = (f) => {
    const p = JSON.parse(fs.readFileSync(f, "utf8"));
    return { ...p.dependencies, ...p.devDependencies };
};
const [before, after] = process.argv.slice(2).map(read);
const changed = Object.keys({ ...before, ...after }).filter((n) => before[n] !== after[n]);
const dir = (n) => path.join("packages/mobile/node_modules", n);
const isNative = (n) =>
    ["android", "ios", "expo-module.config.json", "app.plugin.js"].some((f) =>
        fs.existsSync(path.join(dir(n), f)),
    );
if (changed.length) console.log("\nChanged dependencies:");
for (const n of changed) {
    const what = !after[n]
        ? "removed"
        : !fs.existsSync(dir(n))
          ? "not installed, run npm install to tell"
          : isNative(n)
            ? "has native code"
            : "JavaScript-only";
    console.log(`  ${n} ${before[n] ?? "(new)"} -> ${after[n] ?? "(removed)"}: ${what}`);
}
EOF
    rm -f "${TMPDIR:-/tmp}/check-update-base.json" "${TMPDIR:-/tmp}/check-update-head.json"
fi
exit 1
