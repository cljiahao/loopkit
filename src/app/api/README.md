# api

## Purpose

Route-handler root for outbound integration endpoints; currently holds only
the `merqo/` namespace.

## Contents

- `merqo/`

## Connectivity

`merqo/` is the only child — every HTTP endpoint under `src/app/api` exists
to let the Merqo platform pull loopkit data (metrics, vendor status, qkit
earn-config) over authenticated HTTP.

## Parent

[app](../README.md)
