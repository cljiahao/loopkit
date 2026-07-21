# programs

## Purpose

Admin programs list — a table of every vendor's program with health and
activity, linking into the per-program detail route.

## Contents

- `[id]/`
- `page.tsx` — `AdminProgramsPage`: fetches `listProgramsOverview()`, sorts rows by last activity, renders a table (wrapped in `ElevatedCard`, `overflow-x-auto` for mobile) of shop/vendor/customers/stamps/rewards/health/last-activity with links to each program's detail page.

## Connectivity

`[id]/` holds the per-program detail route this list's rows link to; both
share the `health-badge.ts` and `Stat` helpers from the parent `admin/`
folder.

## Parent

[admin](../README.md)
