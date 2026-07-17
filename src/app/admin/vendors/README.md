# vendors

## Purpose

Admin vendors console — vendor list with Pro-tier toggles and pending
upgrade-request approvals.

## Contents

- `page.tsx` — `AdminVendorsPage`: fetches `listVendors()` and `listPendingUpgradeRequests()`, renders the pending-requests section and a vendor table with Pro badges/toggles.
- `resolve-upgrade-request-button.tsx` — `ResolveUpgradeRequestButton`: calls the `resolveUpgradeRequest` Server Action to grant Pro and clear a pending request in one action.
- `vendor-pro-toggle.tsx` — `VendorProToggle`: calls the `setVendorPro` Server Action to grant/revoke a vendor's Pro tier immediately, no confirm modal.

## Parent

[admin](../README.md)
