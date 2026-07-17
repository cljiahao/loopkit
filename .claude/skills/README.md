# skills

## Purpose

Project skills for loopkit — repo-committed workflows scoped to this
project's stack (Supabase, not the templateCentral default of Drizzle),
each a directory with a `SKILL.md`.

## Contents

- `next-verify/`
- `skill-audit/`
- `supabase-migrate/`

## Connectivity

Each subfolder is one skill, loaded by name (`.claude/skills/<name>/SKILL.md`)
and invoked via the `Skill` tool. `next-verify` is model-invocable (typecheck

- lint + test, on demand); `supabase-migrate` and `skill-audit` set
  `disable-model-invocation: true` in their frontmatter, so they only run when
  explicitly requested. `.claude/settings.json`'s `skillOverrides` turns off
  the templateCentral plugin's `add`/`scaffold`/`migrate` skills project-wide,
  since those install better-auth/Drizzle and would conflict with the
  Supabase/RLS stack these project skills assume. Every invocation of a skill
  under this folder is logged by `.claude/hooks/skill-usage-log.sh` to
  `.claude/skill-usage.log`, which `skill-audit` reads back to find repeated
  ad-hoc workflows worth promoting into a new sibling skill here.

## Parent

[.claude](../README.md)
