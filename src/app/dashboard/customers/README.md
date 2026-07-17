# customers

## Purpose

Vendor-facing customer list at `/dashboard/customers` — a searchable directory of everyone with a card at the shop, either merged across all programs or scoped to one via `?p=`.

## Contents

- `customers-page.dom.test.tsx` — jsdom test asserting `VendorCustomerList` renders a customer's name, phone, program badges, and totals; falls back to phone-only when `name` is null; and shows an empty state with zero customers.
- `loading.tsx` — `CustomersLoading`, a static skeleton (animated-pulse blocks) shown while the customers page streams in.
- `page.tsx` — exports `VendorCustomerList` (props-only merged-customer list component) and default `CustomersPage` server component; requires a vendor, redirects to the single program when there's exactly one, and renders either the merged customer list (`listVendorCustomers`) or a per-program card list (`listCards`) with a phone search form.

## Parent

[dashboard](../README.md)
