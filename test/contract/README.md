# contract

## Purpose

Cross-repo contract test: guards that loopkit's metrics payload satisfies
merqo's schema, since the two repos can't import each other's types at
runtime.

## Contents

- `merqo-metrics.contract.test.ts` — hand-copies merqo's `metricsPayloadSchema` (from `../merqo/src/lib/metrics-schema.ts`) and asserts `computeLoopkitMetrics`'s output parses against it, so a schema drift fails here instead of in production

## Parent

[test](../README.md)
