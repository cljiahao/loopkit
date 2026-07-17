# settings

## Purpose

Vendor integrations page at `/dashboard/settings` — currently a single section for connecting loopkit with qkit's earn config.

## Contents

- `page.tsx` — `SettingsPage` server component; requires a vendor, loads stamp-type programs plus the vendor's existing `qkit_earn_config` row, and renders `QkitEarnSettings`.

## Parent

[dashboard](../README.md)
