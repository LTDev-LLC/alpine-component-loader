# Performance diagnostics and regression gates

The repository performance suite measures behavior rather than a single wall-clock ceiling. It runs the same scenario in Chromium, Firefox, and WebKit and emits one structured diagnostic artifact per engine.

## Run the gates

Build the readable distribution before profiling:

```bash
npm run build
npm run test:performance
npx playwright test tests/performance.spec.js --project=firefox --project=webkit
```

`npm run test:performance` is the fast Chromium-only command. Full release validation runs Firefox and WebKit as well. Browser engines, operating systems, and CI machines have different timing distributions, so each engine has its own committed baseline and ceiling in `tests/performance-budgets.json`.

## Recorded metrics

The suite records:

| Metric | Meaning |
| --- | --- |
| `coldRender100Ms` | First 100-component render after a fresh page/runtime setup. |
| `manyComponentMedianMs` | Median repeated 100-component render. |
| `warmRender100P95Ms` | p95 repeated 100-component render, exposing tail latency rather than only the median. |
| `thousandComponentMs` | Large-batch render diagnostic. |
| `maxComponentMs` | Slowest individual component across warm sampled batches; cold setup is gated separately. |
| `cacheHitMedianMs` / `cacheHit` | Warm template-cache behavior and whether the expected hit occurred. |
| `teardownMedianMs` / `teardownP95Ms` | Typical and tail teardown time. |
| `retainedComponentsAfterTeardown` | Loader-owned component count after deterministic teardown; expected to return to zero. |
| `cacheEntriesAfterPrune` | Cache quota enforcement after pruning. |
| `storageUsageBytes` / `storageQuotaBytes` | Browser-reported storage pressure when the Storage API exposes it. |
| `debuggerStartMedianMs` / `debuggerRows` | Optional debugger startup and bounded-row diagnostics. |
| `preservedReloadMs` | State-preserving reload latency. |
| `cachePruneMs` | Persistent-cache pruning latency. |
| `accessibilityAuditMs` | Basic audit latency for the fixture. |

The result also contains `regressions`, where each value is the percentage change from the engine's historical baseline. Negative values are improvements. Absolute ceilings remain as safety bounds for unusually noisy machines, while the percentage diagnostics show the direction and scale of a change.

## Artifacts and CI

Each run writes and attaches `performance-results.json` through Playwright's test output directory. CI preserves these artifacts even when a budget fails, so a regression can be diagnosed without rerunning the job. The console also prints a compact `[ACL Performance]` record containing the engine, metrics, and historical percentages.

When changing a budget:

1. Reproduce the scenario locally in all three engines.
2. Confirm the change is stable across several runs and is not retained state from a previous test.
3. Prefer improving the implementation or fixture before raising a ceiling.
4. Update the historical baseline to a representative measurement, not the fastest observed run.
5. Keep `retainedComponentsAfterTeardown` at zero and cache-entry bounds aligned with the configured quota.

Performance tests are diagnostic regression gates, not universal end-user benchmarks. Application templates, Alpine expressions, network latency, device class, and browser extensions can dominate real-page results.

## Runtime hot-path behavior

For each normalized component definition, the renderer retains the two most
recent parsed template strings. Repeated instances clone the cached
`DocumentFragment`; changed HMR content occupies a new entry and is parsed
again. A custom Trusted Types policy bypasses this parsed-fragment cache so the
policy still receives every instance. Built-in and custom sanitizers also
continue to run for every rendered instance.

Loader-owned collections for Light DOM slots, legacy scope IDs, polling,
hydration, event cleanup, and diagnostics are allocated only when their
features activate. Teardown accepts uninitialized state.

## Distribution size gates

`npm run check:size` measures gzip bytes for every public browser entry's actual
initial closure, its full dynamic transitive closure, and the shared module
graph. Checked-in values live in `scripts/size-baselines.json`. Each measurement
may grow by the larger of 64 bytes or 5%; diagnostics retain entry-owned and
shared byte breakdowns so a failure identifies where growth occurred.

Update these baselines only after intentional architecture or distribution
changes. The performance suite's historical timing baselines and 200% regression
allowance are independent and should not be changed merely to accommodate a
bundle-size update.
