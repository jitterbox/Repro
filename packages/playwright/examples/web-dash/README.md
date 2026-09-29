# Real Web-Dash walkthroughs

These scenarios drive the existing Web-Dash application through its UI. They do
not serve example HTML, intercept API requests, change application code, or use
Web-Dash's E2E mock fallback. They are additional standalone walkthroughs, not
before/after defect proofs.

Three initial plans:

- **Sales calendar, 1280 × 800:** navigation → Sales → Open calendar; measured
  calendar callout and recorded transfer sparkline.
- **Settings panel, 1024 × 768:** navigation → Sales → Settings; measured Theme
  callout and source-timed DOM observations. Preferences are only inspected.
- **Check-type filter, 393 × 852:** navigation → Checks → type DM; measured result
  callout and source-timed list count. No check is created or submitted.

All three use recorded humanPointer approaches/clicks, 1.8-second observation
pauses, three retained numbered markers, and a 5.4-second result checkpoint.
Normal descriptions use the normal palette; no fabricated bug gets an amber label.

## Prerequisites

Start Web-Dash following its own documentation. Its checked-in local configuration
uses the QA API, which must be reachable (including its normal VPN requirements):

```sh
cd /home/cory/repos/Web-Dash/innout.dash.web
API_TARGET=https://dashqa.innout.com/api pnpm start
```

The gitignored `dev-login.credentials.local.json` in the Web-Dash checkout must
contain the selected role. The default is `DM`; override with
`REPRO_WEBDASH_ROLE`. The file is read directly into the authentication fixture.
Never copy credential values into configuration, logs, or screenshots.

Authentication runs at `/dev-login` **before** Repro capture starts. No storage
state is written to disk. API failure stops the runner before credentials are
loaded. There is no offline or mock fallback.

## Run from Repro

```sh
pnpm test:web-dash-demos --validate-only
pnpm test:web-dash-demos
```

The normal command validates all plans, invokes public `repro run`, `render` and
strict `export --draft`, verifies full-frame layout/random seeking, and adds only
successfully audited recordings to the existing gallery. OCR must be installed
and available to the CLI; its strict audit is not bypassed. Draft status reflects
the scene renderer's existing promotion gate.

Optional environment settings:

- `REPRO_WEBDASH_CHECKOUT`: existing application checkout path.
- `REPRO_WEBDASH_URL`: application origin (default `http://localhost:4200`).
- `REPRO_WEBDASH_ROLE`: exact documented local account role (default `DM`).
- `REPRO_WEBDASH_DEMO`: one of `sales-calendar`, `settings-panel`, `mobile-checks`.

Artifacts live in `.repro/bug-corpus/web-dash/`. The gallery generator preserves
all existing simulated cases and comparisons. Failed or unexecuted plans do not
appear as completed demo cards. Raw local runs are not shareable exports.

## Live verification

All three workflows have been recorded against the existing local Web-Dash app
and its live QA API using the documented DM account. The mobile search clicks
the visible floating label, verifies input focus, and types `DM`; the captured
result contains “DM check” and “DM mystery shopper check.” Direct input-center
clicking is intentionally avoided because the app's label receives that click.

The captures retain original app pixels, browser diagnostics, real pointer
paths, and explicit DOM observations. The calendar walkthrough verifies the
picker, not Sales metric completeness: the selected date currently displays
empty report values. The Settings walkthrough inspects available controls
without changing preferences. No business records are created.

After the three strict exports finish, run:

```sh
node scripts/e2e/web-dash-check.mjs
```

This checks gallery/bundle video hashes, standalone passing outcomes, three
numbered actions, observation time, cursor samples, diagnostic coverage,
authentication exclusion, and the renderer's full-frame layout and exact-seeking
receipts. It also writes entry/hold/exit stills and `acceptance.json`. The complete
recording command runs this check automatically when all three results exist.

The gallery loads a video only on Play and releases the previous player when
switching examples, avoiding a page full of active media elements. Failed runs
remain local and are excluded from completed gallery cards.
