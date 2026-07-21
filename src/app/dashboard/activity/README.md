# activity

## Purpose

Vendor-facing activity feed at `/dashboard/activity` — a paginated, filterable log of stamps, plays, and redemptions across one or all of a vendor's programs.

## Contents

- `activity-filters.tsx` — `ActivityFilters`, a GET `<form>` with type/from/to controls (type select, two date inputs, Apply/Clear) that resubmits the page with query params.
- `activity-page.dom.test.tsx` — jsdom test asserting `ActivityTable` shows phone/program badge with `showProgram`, hides the Program column when `showProgram` is false, and renders an empty state with zero rows.
- `activity-table.tsx` — `ActivityTable`, renders a table of `VendorActivityRow`s (type icon, phone, optional program badge, formatted date) or an empty-state message.
- `page.tsx` — `ActivityPage` server component; requires a vendor, redirects to the single program when there's exactly one, paginates `listActivity()` results (25/page) with type/date-range filters, and renders `ProgramSwitcher` beside `ActivityFilters` in one row below the page header, then `ActivityTable`.

## Parent

[dashboard](../README.md)
