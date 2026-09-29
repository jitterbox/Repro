# ShopLite fixture app

Demo e-commerce admin used to evaluate Repro capture, annotation, compare, and
redaction. **Not a production app.**

## Fixture modes

Global broken/fixed switch:

| Mode | How |
| --- | --- |
| Broken (default) | `?fixture=broken` or unset |
| Fixed | `?fixture=fixed` |

Also persisted to `localStorage.reproFixture`. The document root gets
`data-repro-fixture="broken|fixed"`. Add `&bug=BUG-1003` to isolate one defect
in broken mode; fixed mode disables defects. The selected bug is recorded in
`data-repro-defect`.

## Dev server

```bash
pnpm --filter @jitterbox/repro-shoplite dev
# http://localhost:5177/?fixture=broken
```

## Bugs

Intentional defects are documented as ADO-shaped work items in
`testdata/bugs/BUG-10xx.json` and exercised by `packages/e2e-fixture`.
