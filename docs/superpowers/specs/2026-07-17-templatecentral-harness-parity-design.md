# templateCentral Harness/README Parity — Design

## Context

loopkit was seeded from templateCentral `nextjs@5.8.0`. The installed plugin
is now at `5.11.0` (`.claude/harness.json` → `templatecentral_version` vs
`.claude-plugin/plugin.json` → `version`, read via `templatecentral:standards`
drift-check). This is the first of three independent, separately-planned
tracks the user asked for in one request:

1. **This spec** — bring loopkit's `.claude/` harness and documentation up to
   full `nextjs@5.11.0` parity.
2. Migrate `src/` from its current flat layout to templateCentral's
   `src/features/<name>/` convention.
3. Sweep the app for hand-rolled `<button>`/`<input>`/`<select>`/`<textarea>`/
   `<table>` markup that should be shadcn/ui components instead.

Track 1 is sequenced first because it introduces the per-folder README
convention (§5) — landing it before Track 2 creates a wave of new
`src/features/<name>/` folders means every new folder is born compliant
instead of retrofitted. Tracks 2 and 3 are out of scope for this document and
will get their own spec once this one ships.

**Source of truth for every generated artifact below:**
`C:\Users\Clarence\.claude\plugins\cache\templatecentral\templatecentral\5.11.0\skills\scaffold\shared\harness-kit.md`
(hooks, git-hook layer, CI, verify-harness, CONSTITUTION/FUTURE) and
`...\5.11.0\skills\scaffold\shared\documentation-kit.md` (per-folder READMEs).
Re-check these still exist unchanged at implementation time — a newer plugin
version may have moved or revised them; if so, prefer the newer version's
content over what's quoted here and note the discrepancy in the PR.

`templatecentral:add`/`templatecentral:migrate`/`templatecentral:scaffold` are
disabled for this project (`skillOverrides` in `.claude/settings.json`, set
because their auth/database sub-skills install better-auth/Drizzle and would
break loopkit's Supabase+RLS data layer). Nothing in this spec invokes them —
every artifact is hand-authored by reading the two kit files above, the same
way `templatecentral:standards`'s drift-check step already does.

## Decisions locked in during brainstorming

- **Depth:** full parity — every piece in the per-stack delta table, not a
  partial slice.
- **Azure DevOps wiki (`adoWiki`):** `false`. loopkit deploys via Vercel/
  GitHub only — no `.order` files.
- **Rich READMEs (`richReadme`):** `true`. Per-file bullets get a real
  one-line description of actual exports/behavior, read from the file, not
  guessed. Connectivity sections are uncapped. This is a call the user made
  knowing it stays accurate only as long as `readme-coupling` (git-hook,
  warn) and `readme-freshness` (CI, hard gate) enforcement stays on — both
  are part of this spec, so the tradeoff is covered.
- **Branch topology:** single-branch trunk — only `main` exists (verified via
  `git branch -a`), Vercel deploys off it. The Git Workflow route table (§7)
  is filled in for this, not the template's generic main/uat/develop example.
- **Husky → lefthook:** loopkit currently uses Husky (`.husky/pre-commit` →
  `npx lint-staged`) with no commit-msg or pre-push gate. "Full parity" means
  adopting lefthook even though the cross-runtime (Python) rationale for
  preferring it over Husky doesn't apply to a pure-TS repo — the user chose
  full parity knowing this trades a working Husky setup for template
  conformance, not a technical necessity.
- **Known workflow change:** pre-push now runs `pnpm check && pnpm test`
  locally before every push (lefthook `pre-push.verify`), on top of the
  existing `Stop` hook that already runs `pnpm test` at the end of every
  Claude Code turn. User accepted this.

## Architecture

Seven components, each independently landable and independently verifiable,
but sequenced (§ Sequencing) because several depend on files an earlier step
creates.

### 1. Hook scripts (`.claude/hooks/*`)

Extract loopkit's 5 existing inline `node -e` one-liners in
`.claude/settings.json` into standalone canonical scripts, and add the 3 the
current harness is missing entirely:

| Script                   | Event                       | Status                                                                                                                                                                                                                                                                               |
| ------------------------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `protect-files.sh`       | `PreToolUse` (Edit\|Write)  | Rewrite — widen from the current static `permissions.ask` 6-entry list to the canonical pattern-matched governance-file guard (adds CI/CD pipeline files, cert/credential files, `.claude/hooks/*`, `lefthook.yml`, `.gitleaks.toml`, `Dockerfile`, harness manifest/verifier files) |
| `block-no-verify.sh`     | `PreToolUse` (Bash)         | Rewrite — canonical version also blocks `LEFTHOOK=0`/`LEFTHOOK_EXCLUDE`/`core.hooksPath` bypasses, direct commits to `main`, force-push to `main`, `git checkout/restore` on guard-layer files, and `rm -rf` on source dirs (current version only blocks `--no-verify`)              |
| `user-prompt-guard.cjs`  | `UserPromptSubmit`          | Rewrite — canonical version adds credential-leak detection (AWS/GitHub/Anthropic keys, PEM blocks, DB URLs) on top of the existing injection-phrase check                                                                                                                            |
| `post-edit-typecheck.sh` | `PostToolUse` (Edit\|Write) | Extract as-is (same `pnpm exec tsc --noEmit --incremental` logic, filtered to `.ts`/`.tsx`)                                                                                                                                                                                          |
| `stop-checks.sh`         | `Stop`                      | Extract as-is (`pnpm test --run`, `stop_hook_active` guard)                                                                                                                                                                                                                          |
| `session-context.sh`     | `SessionStart`              | Extract as-is, but keep loopkit's existing `docs/CONSTITUTION.md` re-injection branch (added in §4) and the AGENTS.md-derived routing header text loopkit already uses                                                                                                               |
| `post-tool-failure.sh`   | `PostToolUseFailure`        | **New**                                                                                                                                                                                                                                                                              |
| `subagent-stop.sh`       | `SubagentStop`              | **New** — type-gates a subagent's uncommitted `.ts`/`.tsx` changes                                                                                                                                                                                                                   |
| `skill-usage-log.sh`     | `PostToolUse` (`Skill__.*`) | **New** — appends to gitignored `.claude/skill-usage.log`, feeds `/skill-audit` (§4)                                                                                                                                                                                                 |

`.claude/settings.json`'s `hooks` block is rewritten to invoke these scripts
by path instead of embedding the logic inline. `permissions.ask` shrinks back
down since `protect-files.sh` now covers that ground dynamically.

### 2. Git-hook layer (lefthook + gitleaks)

Remove: `.husky/`, the `husky` devDependency, the `"prepare": "husky"` script.
Add: `lefthook` devDependency, `"prepare": "lefthook install"` script,
`lefthook.yml`, `.lefthook/commit-msg.sh`, `.gitleaks.toml`.

- **pre-commit** (parallel): `format-lint` (prettier + eslint --fix on staged
  `.ts`/`.tsx`/`.js`/`.mjs`/`.cjs`, excluding `.claude/hooks/*` and
  `.claude/.harness-base/**`), `typecheck` (`pnpm exec tsc --noEmit`),
  `lockfile` (`pnpm install --frozen-lockfile`), `secret-scan` (gitleaks,
  soft-skip if not installed locally — not installed today, CI's
  `security.yml` remains the hard gate), `readme-coupling` (warn-only: staged
  changes in a folder without its `README.md` also staged).
- **commit-msg**: Conventional Commits gate via `.lefthook/commit-msg.sh`.
  loopkit's recent commit history (`feat:`/`fix:`/`docs:`/`chore:` prefixes)
  already conforms — expect zero friction.
- **pre-push**: `harness-integrity` (`.claude/verify-harness.sh`, §4) +
  `verify` (`pnpm run check && pnpm test -- --run`).

### 3. CI (`.github/workflows/ci.yml`, unchanged `security.yml`)

Augment the existing `quality`-equivalent job (loopkit's `test` job) with:

- a `Harness integrity` step running `.claude/verify-harness.sh`
- Vitest coverage reporter gains `cobertura` (`coverage: { reporter: [...,
'cobertura'] }` in `vitest.config`) so `coverage/cobertura-coverage.xml`
  exists
- a changed-line coverage gate: `pipx run diff-cover
coverage/cobertura-coverage.xml --compare-branch=origin/main
--fail-under=80`

Add two new PR-only jobs: `changelog` (fails if `src/**` changed without a
`CHANGELOG.md` entry, bypassable with a `skip-changelog` label) and
`readme-freshness` (fails if a changed folder's `README.md` wasn't updated in
the same PR, bypassable with `skip-readme-check`). loopkit has no
`CHANGELOG.md` today — creating a minimal one (`Keep a Changelog` format,
empty `## [Unreleased]`) is in scope here since the `changelog` gate depends
on it existing.

`security.yml`'s existing full-history gitleaks scan and `pnpm audit` already
satisfy the template's CI secret-scan requirement — left untouched, not
duplicated into `ci.yml`.

### 4. Governance docs

- **`docs/CONSTITUTION.md`** — binding invariants, wins over AGENTS.md on
  conflict. Filled in with loopkit's actual architecture invariants (RLS-only
  authorization, `loopkit` schema isolation, service-role client restricted
  to Server Actions/Route Handlers — pulled from AGENTS.md's existing
  "Rules" section, not invented) rather than left as `[...]` placeholders.
  Quality-gate line: `pnpm check` (nextjs delta-table value).
- **`FUTURE.md`** — unactivated design seams, seeded verbatim from the
  template (Meta-Harness, Trace-Driven Evolution, Environment Engineering).
- **`.claude/verify-harness.sh`** / **`.claude/regen-harness.sh`** —
  SHA-256 drift sensor over the enforcement layer + human-only re-bless
  script, seeded verbatim.
- **`.claude/.harness-base/`** — snapshot of every seeded file at seed time,
  mirrors each seeded path, committed. Enables a future `templatecentral`
  3-way-merge re-sync even though `migrate` itself is disabled for this
  project — the snapshot costs nothing to carry and un-disabling migrate
  later (e.g. if the Supabase-conflict sub-skills get scoped out) would need
  it.
- **`.claude/skills/skill-audit/SKILL.md`** — on-demand skill seeded
  verbatim, consumes `.claude/skill-usage.log` (§1).
- **`.claude/harness.json`** — rewritten to the full `seeded_files`
  hash-manifest shape, `templatecentral_version` bumped to `5.11.0`,
  `adoWiki: false`, `richReadme: true` (both persisted per the decisions
  above, so `templatecentral:standards`/documentation-kit never re-asks).

### 5. Per-folder READMEs

Run `documentation-kit.md`'s Steps 2–3 by hand (Step 1 is already resolved —
`adoWiki`/`richReadme` are decided, not asked; Step 4 is skipped —
`adoWiki: false`) across the whole repo: `src/` (every existing subfolder —
not the Track 2 `features/` ones, those don't exist yet), `supabase/`,
`docs/` (including `docs/superpowers/{specs,plans}/`), `test/`, `.claude/`,
repo root. Rich mode: each file bullet gets a real one-line description of
its actual exports, read from the file. Root `README.md`'s existing prose is
untouched; only a `## Structure` section is appended if missing.

### 6. AGENTS.md tail

Replace the current `## AI Harness` / `## Skills Security` sections (and add
the currently-absent `## Git Workflow` / `## Skill capture` sections) with
the canonical tail text from `harness-kit.md`'s "Shared AGENTS.md tail
fragment", substituting:

- the `PostToolUse` line's stack command → `pnpm exec tsc --noEmit
--incremental`
- the Git Workflow route table → single-branch trunk (`main` only, Vercel
  auto-deploys on push)
- the version marker on AGENTS.md's line 1 → `nextjs@5.11.0`

Everything above `## AI Harness` (What loopkit is, Stack, Commands, File
Layout, Rules, Skills, Project-Specific Notes) is untouched — those are
loopkit-specific and not part of the templateCentral-seeded tail.

### 7. `.agents` symlink

`ln -s .claude .agents`, confirm `.agents` is in `.gitignore` (add if
missing), never committed.

## Sequencing

Dependency order (later steps read files earlier steps create):

1. Hooks (§1) — `session-context.sh` needs to know CONSTITUTION.md will
   exist, but doesn't need it to exist yet (it just conditionally cats it).
2. CONSTITUTION.md, FUTURE.md (§4a/4b) — CONSTITUTION.md is referenced by
   the rewritten `session-context.sh` and by AGENTS.md's tail.
3. Git-hook layer (§2) — `commit-msg`/`pre-push` reference
   `verify-harness.sh`, so:
4. `verify-harness.sh` / `regen-harness.sh` (§4c) before finalizing
   `lefthook.yml`'s pre-push block.
5. CI (§3) — references `verify-harness.sh` too.
6. `skill-audit` skill (§4d).
7. `harness.json` (§4e) — last of the harness-internal files, since it hashes
   everything created in steps 1–6.
8. `.harness-base/` snapshot (§4f) — mirrors what `harness.json` just listed.
9. Per-folder READMEs (§5) — run once the folder set is stable (i.e., after
   every file above exists, so `.claude/`'s own README reflects the final
   hook/skill list).
10. AGENTS.md tail (§6).
11. `.agents` symlink (§7) — purely local convenience, any point after `.claude/` is stable.

## Testing / Verification

- `pnpm check && pnpm test` after every step that touches TS/config —
  existing project convention, restated here because it's now also what
  `pre-push` runs automatically.
- `.claude/verify-harness.sh` must report `✓ harness integrity OK`
  immediately after `regen-harness.sh` first runs (it establishes the
  baseline against the just-created files) and on every subsequent
  unrelated commit (proves the sensor isn't false-positiving on its own
  output).
- `lefthook validate` after `lefthook.yml` is written.
- A throwaway commit with a non-conventional message (e.g. `wip stuff`) must
  be rejected by `commit-msg`, then a real commit must succeed — proves the
  gate is wired, not just present.
- CI must go green on the PR that lands this — the `changelog` and
  `readme-freshness` jobs are exercised for real since this PR touches
  `src/` context files and every folder's README.

## Out of scope

- Track 2 (feature-folder migration) and Track 3 (shadcn sweep) — separate
  specs, sequenced after this one per the user's chosen order.
- Any change to loopkit's actual application logic, Supabase schema, or RLS
  policies.
- CodeQL — `security.yml` already documents why it's excluded (no GitHub
  Advanced Security on this private repo tier); this spec doesn't revisit
  that decision.
