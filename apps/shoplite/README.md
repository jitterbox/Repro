# ShopLite fixture app

Demo e-commerce admin used to evaluate Repro capture, annotation, compare, and
redaction. **Not a production app.**

## Fixture modes

Global broken/fixed switch (not per-bug):

| Mode | How |
| --- | --- |
| Broken (default) | `?fixture=broken` or unset |
| Fixed | `?fixture=fixed` |

Also persisted to `localStorage.reproFixture`. The document root gets
`data-repro-fixture="broken|fixed"`.

## Dev server

```bash
pnpm --filter @repro/shoplite dev
# http://localhost:5177/?fixture=broken
```

## Bugs

Intentional defects are documented as ADO-shaped work items in
`testdata/bugs/BUG-10xx.json` and exercised by `packages/e2e-fixture`.
