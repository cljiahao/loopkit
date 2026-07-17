# [id]

## Purpose

Admin detail view for a single program — stats, recent activity, and
management controls (activate/deactivate the program, remove a customer's
card).

## Contents

- `manage.tsx` — `Manage`: renders `ActiveToggle` (confirm dialog around the `setProgramActive` Server Action) and a card list with `RemoveCardButton` (confirm dialog around the `removeCard` Server Action).
- `page.tsx` — `AdminProgramDetailPage`: loads `getProgramDetail(id)`, computes health/stamps issued/rewards redeemed, renders the program header, stat tiles, recent activity feed, and the `Manage` panel.

## Parent

[programs](../README.md)
