# `@jitterbox/repro-e2e-fixture`

Vitest + Playwright harness that drives ShopLite through the Repro pipeline to
produce feature-coverage videos under `.repro/fixture-videos/`.

```bash
pnpm build
pnpm --filter @jitterbox/repro-e2e-fixture test:e2e
# or from root:
pnpm test:e2e-fixture
```

Default `pnpm test` in this package is a no-op unit placeholder so the monorepo
unit suite stays fast. Use `test:e2e` for the browser/video suite.
