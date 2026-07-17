# stats

## Purpose

Vendor stats page at `/dashboard/stats` — enrollment, retention, and visit metrics either merged across all programs or scoped to one via `?p=`, plus a 30-day visits bar chart.

## Contents

- `page.tsx` — `StatsPage` server component; requires a vendor, redirects to the single program when there's exactly one, and renders stat tiles (enrolled, active/lapsed, redemption rate, repeat-visit rate, visits, rewards redeemed, avg days between visits) with day-over-day deltas and a 30-day visits bar chart, sourced from `getVendorStats`/`getProgramStats`.

## Parent

[dashboard](../README.md)
