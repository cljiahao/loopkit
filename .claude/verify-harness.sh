#!/usr/bin/env bash
# Harness integrity sensor. Recomputes sha256 of the enforcement-layer seeded files and
# compares to the origin_hash baseline in .claude/harness.json. Read-only; exits non-zero
# on drift. Wired into CI and lefthook pre-push. Bless intentional changes with regen-harness.sh.
set -euo pipefail
manifest=".claude/harness.json"
[ -f "$manifest" ] || { echo "verify-harness: $manifest missing" >&2; exit 2; }

guard='^(\.claude/hooks/|\.claude/settings\.json$|\.claude/(verify|regen)-harness\.sh$|lefthook\.yml$|\.lefthook/|\.gitleaks\.toml$|\.github/workflows/)'

sha() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }
read_manifest() {
  if command -v jq >/dev/null 2>&1; then
    jq -r '.seeded_files | to_entries[] | "\(.value.path)\t\(.value.origin_hash)"' "$manifest"
  elif command -v node >/dev/null 2>&1; then
    node -e 'const m=require("./.claude/harness.json");for(const v of Object.values(m.seeded_files))console.log(v.path+"\t"+v.origin_hash)'
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c 'import json;m=json.load(open(".claude/harness.json"));[print(v["path"]+"\t"+v["origin_hash"]) for v in m["seeded_files"].values()]'
  else echo "verify-harness: need jq, node, or python3" >&2; exit 3; fi
}

drift=0
while IFS=$'\t' read -r path origin; do
  printf '%s' "$path" | grep -qE "$guard" || continue
  case "$origin" in "<"*) continue;; esac
  if [ ! -f "$path" ]; then echo "MISSING:  $path" >&2; drift=1; continue; fi
  [ "$(sha "$path")" = "$origin" ] || { echo "MODIFIED: $path" >&2; drift=1; }
done < <(read_manifest)

if [ "$drift" -ne 0 ]; then
  echo "❌ harness integrity drift. If intentional, a human runs: bash .claude/regen-harness.sh" >&2
  exit 1
fi
echo "✓ harness integrity OK"
