# metrics

## Purpose

GET endpoint reporting platform-wide loopkit metrics to Merqo.

## Contents

- `route.ts` — `GET`: bearer-auth via `bearerOk()`, reads `programs`/`cards`/`stamp_events` concurrently via the service-role client, computes metrics with `computeLoopkitMetrics()`, returns them as JSON with `product`/`generated_at`.

## Parent

[merqo](../README.md)
