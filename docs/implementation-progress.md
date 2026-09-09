# Consolidated implementation ledger

The **Phase 1–3 milestone is complete and verified locally**. The full five-phase specification remains the scope; remaining Phase 4–5 work below is not claimed complete. Consolidated acceptance: `.repro/milestone-acceptance.json` (also `/tmp/repro-milestone148/acceptance.json`). Remote CI has not been triggered.

## Implemented and exercised

- Contracts now own executable plan/geometry, timeline, visual-cue and quality-result types from Zod. Compatibility entry points remain in plan and evaluation. Executable plans use a distinct generated schema, preserving the older published plan document. Compiler outputs validate monotone timing centrally; public quality results normalize explicit states and reject contradictions. Normal builds check schema publication without rewriting tracked sources. HAR replay content hashes invalidate explicit capture reuse even when file timestamps do not change.
- Comparison source/test identity and proof-definition controls now reject changed scenario code, different selected tests and changed claims. Unknown legacy source identity cannot establish verified paired proof. Runtime file reads and arbitrary deployed inputs are explicitly unmeasured; build identity is caller-supplied or unknown.
- Shared evidence cue compilation has passed real continuous-motion privacy acceptance (`/tmp/repro-privacy134/acceptance.json`) and all published recipes (`/tmp/repro-recipes132/acceptance.json`). The moving-mask test decodes every relevant motion frame and checks opaque replacement; unmasked export fails strict OCR.
- Bracketed hit-test PNGs now own their measured diagnostic geometry. Real local review verified image/outline alignment and removal of the outline when switching checkpoints (`/tmp/repro-diagnostic138/diagnostic-review.json`). The iteration141 public pixel test exposed a missing visible recipient caption despite a rendered ring; separate caption/reference overlays now pass actual-frame OCR in the final public workflow. Portable image titles are distinct and audited before manifest publication.
- Real portable viewer checks passed side-by-side, onion, wipe, difference, edge, independent presentation timing and all exported images (`/tmp/repro-portable136b/portable-viewer.json`). The old two-image expectation was corrected to verify every manifest PNG after adding diagnostic images.
- Comparison rendering now displays independently timed numbered scenario steps, trigger identification, expected results and assertion-timed observed/outcome labels. `/tmp/repro-sync141/acceptance.json` passes actual-frame OCR, all four checkpoint alignments and all six independently measured transitions, with coarse synchronization and missing-evidence rejection controls. Its final proof frame was visually inspected. Local uncertainty/image-fallback/original-timing review also passes (`/tmp/repro-review141/acceptance.json`).
- Real legacy CLI capture HAR privacy passed at `/tmp/repro-har141b/acceptance.json`: request-body, authentication, cookie, query/OAuth, response-body/header and page-title canaries actually crossed the browser network boundary and were absent from sanitized HAR. Raw HAR was deleted. Opaque URL payloads and unrestricted comments are also scrubbed.


- Passive public Playwright console, page-exception, request and response events replace default CDP debugger telemetry. HTTP errors and transport failures remain distinct, with event/page/request references and conservative host-receipt timing. Step associations describe temporal containment, not causality. Review displays diagnostics and seeks original recordings; URLs exclude credentials, query strings, fragments and opaque data. Public before/after acceptance passed at `/tmp/repro-browser-diagnostics124/acceptance.json`, including actual page errors, HTTP 503, disconnection, redacted event canaries and review seeking. Controlled timer exceptions were reported as console errors by Playwright; the fixture now also exercises a genuine unhandled rejection without relabeling it.
- Committed proof segments and transient checkpoint event selections now execute through the public fixture and pipeline. Capture starts before the trigger; calibrated same-page events select existing captured frames after completion. Required missing segments, unknown clocks, missing events and excessive frame-selection offsets fail closed. Event-linked PNGs have separate source timestamps, requested timestamps, observation references and selection uncertainty. `/tmp/repro-transient126/acceptance.json` verifies red before/green after at 100 ms after the pointer event, plus a missing-event export rejection. Iteration125 retained a test sampling region overlapping text; inspection confirmed the captured transient, and the color assertion now measures an unobstructed part of the same panel.


- Contracts own configuration and semantic validation independently of core. Evidence/run schemas, generated structural configuration schema, capability discovery, recipes, and evidence validation are available.
- Comparison composition types and validation now also live in contracts. Zod generates the published compatibility schema, discovery artifact and MCP resource; a normal build rejects stale generated schema without rewriting sources. Structural parity covers malformed synchronization tuples and unsafe output filenames; centralized semantic rules reject swapped roles, non-increasing knots, missing ROI bounds and unapproved blink. `render-compare` consumes the public comparison report directly as well as legacy composition documents.
- Comparison renders now advance checkpoint numbers and committed titles at measured output times instead of displaying a static `STEP 1 / n`. Checkpoints remain distinct from scenario steps. Terminal images extend through the measured comparison endpoint at the declared frame rate, preventing the shortest pane from truncating the final checkpoint. The unequal-delay browser corpus checks actual transitions and checkpoint pixels, exact output frame counts and OCR labels, with a rejecting first/last-only synchronization control.
- Local review now shows comparison verification status, unmatched checkpoints, selectable uncertain intervals, screenshot acquisition uncertainty and actual recording durations. Uncertain comparisons default to original timing; no matched checkpoints disables synchronized playback. Native pause on the synchronized leader pauses both panes, and original mode restores independent controls at normal speed. Local and portable viewers share the same piecewise mapper, including endpoint clamping and original timing for fewer than two knots. Recording URLs follow manifest artifact paths. Only passed bounds qualify for measured target outlines/crops.
- Capture uses run-relative clocks, awaited registration and queue draining, timestamp-based normalization, and editorial popup cuts. Probe events use sampled host/page calibration and record uncertainty; this fixes synthetic controlled time origins previously producing zero timestamps. Uncalibrated events retain receipt timing explicitly, without an accuracy claim. Controlled Date preserves progressing timers; faithful anchors preserve animations. Unsupported OS/native production backends fail explicitly. Failed initialization closes storage; shutdown drains all page queues before closing resources. Frame rejections retain page identity, source-relative time, dimensions and drop counts.
- Exact stage keys and artifact hashes gate reuse. Render and package publication use private generations and locks. Packaging snapshots assets before auditing, verifies receipts against those bytes, and leaves previous bundles untouched on failure. Manifest verification and the review server reject symlinks escaping a run.
- Concurrent scenario invocations now own separate attempt directories. The regression exercises an overlapping successful invocation and a disconnected incomplete attempt, preventing either result from adopting the other's artifacts.
- The public Playwright fixture records targets, independent steps, checkpoints, ordinary named checks, designated assertions, hit-test samples, accessibility scans, and complete run artifacts. Ordinary checks can establish a stable checkpoint without supplying an outcome label. Their failures remain unsuccessful even if caller code catches them. Samples now link separately to calibrated same-page/step pointer dispatch events with actual fractional coordinates, recipient paths and event IDs; ambiguous correlation remains unavailable. Unrelated errors cannot qualify as designated assertion failures. Popup outcome assertions await registration and record the selected page identity. Bounds are measured before and after screenshots; changed geometry cannot produce an asserted alignment or crop.
- Public CLI capture → frame → compare → render → export has run against a real transparent-interceptor fixture. Before reports the designated failure; after reports successful behavior. Browser-measured shifts of 1, 4, and 12 CSS pixels passed.
- Frame inspection preserves context and produces padded crops with timestamps and transforms. Fractional crops report both requested CSS bounds and actual integer pixel bounds; a high-DPI test compares every crop pixel against its reported context position. Full-resolution stills scale correctly into normalized video holds. Annotated stills use the exact checkpoint PNG and the same annotation definitions as video. Real-pixel checks verify unchanged application pixels, measured outlines, descriptive titles, numbered steps, and outcome text. The public Checkout recipe now uses specific action/outcome wording.
- Presentation-only edits preserve capture hashes; unchanged presentations reuse verified artifacts. Reading holds affect presentation timing only. Checkpoint holds now use their exact redacted annotated still, with source observation/interval metadata and decoded-video outline/title/step/outcome verification. Stable screenshots requiring an assertion must follow it on the same page; earlier transient screenshots do not inherit a later verified-outcome label. Presentation keys measure the current renderer fonts and FFmpeg version, with separate hashed renderer provenance; they do not reuse capture-time environment claims. Paired export includes audited videos, stills, captions, safe reports, and synchronization through measured recording ends.
- Strict export audits decoded frames using Tesseract automatic and sparse layout modes. This addresses a measured blind spot for light text on dark caption bars. Missing OCR and a known forbidden phrase in actual output pixels both block export. Numeric report measurements are not mistaken for card numbers; all report text is audited.
- The moving privacy corpus exposed two defects: public rendering ignored the `probe.` prefix on measured masks, and the prior pixelated output left readable residual text that OCR missed. Rendering now consumes measured probe masks and uses opaque fills with outward rounding and input-resolution scaling. Every inspected text-region pixel must be black. An export compatibility gate rejects older selector-protected presentations until rerendered. Static union masking is conservative and may obscure unrelated pixels at other times.
- Relocated viewer acceptance checks default side-by-side playback, synchronized follower frames, exactly one action per keyboard shortcut, media decoding, captions on both variants, checkpoint images, after-side keyboard seeking, synchronized end seeking, high contrast, and absence of external requests. Scrubbers and keyboard chapter buttons now target the selected variant and exported per-variant chapter times, including decoded-frame verification. Original durations are probed from media rather than including capture setup. The local review viewer additionally supports context/crop switching and comparison layouts.
- CLI compatibility adapters call shared pipeline services. MCP descriptions come from the capability registry; project/configuration/build/repeat, presentation revisions, paired exports, recipes, and on-demand schemas are exposed. Protocol tests exercise discovery and service forwarding.
- Font measurement is shared below capture and compositor. Compositor keys include implementation, theme, viewport, fonts, and Playwright identity; cache hits verify pixel hashes before use. A serialized reusable page prevents concurrent DOM replacement. Browser tests cover corrupted cache repair, concurrent isolation, and cache hits without launching Chromium.
- Release tarballs installed in a clean project and captured a real scenario through the public API. External CLIs now resolve Playwright from the scenario's installed fixture, preventing separate runner/fixture instances; clean installation exercises both entry points. Fresh-agent evaluation completed discovery, capture, frame inspection, comparison, rendered-still inspection and strict paired export without implementation imports. Relocation hashes/HTTP passed; that evaluator had no browser UI, so it does not independently claim playback. Root's separate browser acceptance covers playback. No usage reset was consumed. Wording, outdated compatibility playbooks, unsupported OS guidance, excessive response-size issues and portable entry-point guidance were corrected.
- The native screencast experiment now exercises real popups and three tracing modes with awaited registration. Native rejected wrong-size popup/tracing frames; CDP remains the default. Repro-owned traces use DOM snapshots without screenshots to avoid a second pixel capture owner, and record the applied choice. Earlier intermittent CDP failures remain retained; one passing experiment does not establish universal coexistence.
- Public real-pixel timing acceptance verifies a stationary hold, a brief color change and the recording end. A snapshot-tracing run aligned transitions within 30–42 ms at 30 FPS. Negative controls reject compressed holds, missing brief frames and truncated endings. Interval checks use observed elapsed time, including instrumentation overhead, rather than assuming timer requests are exact.
- Presentation timing additionally checks synthetic edit decisions over real source pixels, including fractional and single-frame segments. Holds no longer add an extra repeat frame; absolute output boundaries avoid cumulative rounding. Explicit segment PTS and output CFR preserve one-frame segments and the final decodable frame. Slate dissolves use frame-aligned durations and map capture zero to the dissolve's actual start. The legacy transition schema now accepts fractional milliseconds. Failed predecessor outputs are retained.
- Terminal hold map boundaries use capture EOF while their images sample the last in-range frame. This fixes a one-frame backward jump in exported timing knots without changing the rendered frame.
- Probe calibration is keyed by an opaque document ID, preventing shared fixed-date origins from mixing navigation and iframe clocks. Hit-test/event correlation also requires the same document and explicit top-page coordinates. Child pointer coordinates are labeled separately.
- Document IDs now use a shared 128-bit letter-only encoding for the browser probe and clock calibration. Numeric IDs could accidentally pass the payment-card detector and be redacted out of event payloads, breaking correlation with unredacted observations. The regression exercises every byte value and confirms real email text is still masked. Prior affected captures must be recaptured; their missing correlation is not retroactively invented.
- Run identity hashes local scenario imports and explicitly selected or automatically discovered Playwright configuration imports without executing them. Content edits with preserved modification times invalidate identity.
- Cancellable runs own a process group on POSIX. Watch mode waits for descendant shutdown, coalesces pending edits and recovers after invalid inputs. The regression proves a descendant ignoring graceful termination releases its listening port before the replacement run.
- CI makes lint/typecheck blocking, separates fast/browser checks, retains failure artifacts, and now includes clean-project installation. Registry publication has not occurred. Browser versions are locked; system package versions are recorded but not pinned to immutable artifacts.

## Completed milestone acceptance

- Full public CLI capture → inspect → compare → render → strict export → relocated review passes at `/tmp/repro-milestone148/public/acceptance.json`. It includes 1/4/12 CSS-pixel measurements, source/test/claim mismatch controls, explicit migration preserving unknown identity, sample-image diagnostic outlines/captions, exact checkpoint holds and presentation-only revisions.
- Every media receipt in the final bundle matches its current artifact hash and records actual frame OCR. Captions, descriptive image labels, before/after roles, comparison layouts, independent presentation timing and keyboard controls pass in the relocated browser viewer.
- The full corpus pass at iteration145 and repaired affected checks at iterations146–148 cover timing/tracing, high-DPI crops, untouched/moving/scrolled/popup privacy, actual network canaries, missing evidence, ordinary/designated assertions, transient events, all recipes, 27 ShopLite/media regressions, 7 compositor tests, local review and 2 mock-agent checks. The optional live-agent test remains skipped.
- The corrected interaction fixture passes at `/tmp/repro-milestone146/interaction/acceptance.json`. Clean packed-package installation passes at `/tmp/repro-install-ywlxvc/consumer` (`/tmp/repro-clean147.log`). The consumer executes both its installed CLI and the external repository CLI.
- Final build, typecheck and lint pass, with **201 tests across 81 files** (`/tmp/repro-fast148.log`). The standalone browser mapper has a fast import regression. All **439 source files** remained unchanged during final acceptance; generated browser reports are ignored by Git.
- Failure evidence remains preserved: iteration145 selected a colliding interaction fixture and invoked clean installation outside the pinned pnpm script context; iteration146 exported a browser mapper with a bare workspace import. The fixture names, runner entry point and portable build output are corrected. Automatic plus sparse OCR modes verify the separately rendered diagnostic caption; the missing-caption predecessor also remains preserved.

## Work remaining after the Phase 1–3 milestone

The main remaining implementation items have now been delivered in the Phase 4–5
continuation below. These acceptance/distribution items remain open:

- Windows process-tree and SQLite lock recovery passed all four checks on the
  Windows Server 2022 CI runner. This is not a broad Windows capture claim.
- External registry publication awaits a chosen registry/owned namespace. Portable
  release tarballs and a relocatable installation manifest are available without it.
- The 50% annotation-iteration improvement target lacks a recorded Phase 1 median.
  Current unchanged-export benchmarks are reported separately, without substituting
  them for that historical annotation baseline.

Ancestor-frame interception remains explicitly unsupported as documented. Live ALM
writes require an authorized issue destination; delivery acceptance uses real HTTP
and strict OCR against local Jira/ADO protocol fixtures.

Provenance limitations are explicit product behavior: local static imports are hashed; arbitrary runtime file reads are unknown, external dependencies are covered by reported tool versions, and build identity is caller-supplied or unknown. Older unmeasured viewport/font/source identity cannot silently qualify for verified comparison. OCR remains imperfect; strict auditing is not a guarantee that arbitrary unknown secret text is recognized.

## Recorded verification

- Current blocking verification: full build, typecheck and lint pass; **200 tests across 81 files** pass (`/tmp/repro-build146.log`, `/tmp/repro-type146.log`, `/tmp/repro-lint146.log`, `/tmp/repro-fast146.log`). This includes plan/timeline schema parity, explicit quality states, sample-image alignment prerequisites, HAR input hashing, audited manifest captions and lossless manifest migration.
- The sequential browser/media pass at `/tmp/repro-milestone145` passed timing with and without tracing, high-DPI and opaque private crops, continuous-motion privacy and unmasked rejection, HAR privacy, ordinary/designated assertions, synchronization, passive diagnostics, transient selections, all recipes, local review, 7 compositor tests, all 27 ShopLite/media regressions and 2 deterministic mock-agent checks. One live-agent test remains deliberately skipped. Those three failing checks were repaired and rerun successfully; their failed logs remain preserved.


- Published recipes: `/tmp/repro-recipes132/acceptance.json` executes all three discovered recipes unchanged except explicit variants, verifies their before/after outcomes, measures the geometry delta, inspects selected frames, renders the transient pair and strictly audits its portable export. Rendered transient pixels retain red/green states and OCR confirms no premature outcome label. Iteration131 correctly rejected export without rendering; the acceptance workflow now explicitly renders and inspects first.
- Image fallback and review: `/tmp/repro-review131/acceptance.json` passes real captured PNG comparison with synthetic renamed checkpoint metadata, conservative estimated-match labeling, low-confidence spans, original timing and rejection of a semantic-proof claim. Duplicate and reordered image matching controls are tested. Screenshot uncertainty uses the larger of its recorded interval and explicit selection uncertainty, preventing stale metadata from understating acquisition time.
- Latest full fast checks before the shared cue-compiler refactor: **190 tests across 75 files**, full build/typecheck/lint (`/tmp/repro-fast131.log`). New shared compilation and continuous-motion privacy acceptance are currently being verified; no completion claim yet.


- Local public review: `/tmp/repro-review122/acceptance.json` passes real-browser controls over existing real captures, including a renamed manifest-relative recording, native pause synchronization, restoration of independent original timing, synthetic uncertain/unmatched metadata and synthetic zero matched checkpoints. Its uncertainty image was also visually inspected. Iteration 120 retained the seek-rounding failure at an uncertain interval boundary; warnings now conservatively include frames touching the interval. Portable compatibility with the new shared mapper passes at `/tmp/repro-portable122/portable-viewer.json`, explicitly reusing previously audited media with a viewer-build override.

- Unequal-delay comparison: `/tmp/repro-sync119/acceptance.json` verifies four semantic checkpoints, six color transitions (each at its expected output frame), changing committed titles through actual-frame OCR, and exact rounding of the 4,499.623 ms measured endpoint to 135 frames / 4,500 ms at 30 FPS. The coarse first/last-only control fails alignment, and the empty-checkpoint manifest control exits unsuccessfully with `ok: false`. Green and final checkpoint frames from iteration 115 were also visually inspected. Iteration 113 retained the failure that exposed final-checkpoint truncation; iteration 114 retained an OCR whitespace-only assertion failure corrected without weakening content checks. Iteration 118 correctly rejected empty checkpoints but exposed a harness expectation of exit code zero, corrected in 119.
- Legacy comparison compatibility: the full media run at iteration 116 passed 26 tests and exposed an existing zero-knot original-timing composition. Its focused regression passes at `/tmp/repro-legacy117.log`. The original schema allowed empty knots; that compatibility is retained with explicit `timing: "original"` in rendering results. Public run comparison now additionally requires at least one matched checkpoint before reporting successful proof. Iteration 117's public workflow remains a retained failure because numeric document IDs were redacted as payment-card candidates (`/tmp/repro-public-pair117`).

- Fast checks: **183 tests across 70 files** passed (`/tmp/repro-fast122.log`), with full workspace build, typecheck and lint at iteration 122. Shared viewer time-mapping and comparison Zod/JSON Schema parity/publication checks pass alongside the document-ID/redaction, terminal-hold, concurrent-execution, ordinary-check and privacy-version regressions.
- Compositor: **7 real-browser tests passed**, including corrupt cache repair and concurrent calls (`/tmp/repro-compositor41.log`).
- Complete ShopLite/media regression passed **27 tests** (`/tmp/repro-fixture107.log`), including the opaque renderer and original duration gate that detected the one-frame-short legacy slate export at iteration 90. Failure artifacts remain at `/tmp/repro-package-failure90`. Vite's config-file merge discarded `watch: null`; the committed fixture now owns its server configuration, eliminating the host watcher-limit errors. Strict OCR was enabled.
- Public real-pixel workflow, current renderer provenance, strict OCR, paired export and relocated viewer: `/tmp/repro-public-pair118/acceptance.json`, including exact checkpoint holds, sampled probe timing, observed obstruction/Checkout recipients, selected-variant chapter controls and invocation isolation. Both encoded presentation durations equal the planned **15,000 ms**. This rerun includes letter-only document identity, centralized comparison validation, slate/terminal-map corrections and the opaque renderer. Older captures with zero-clamped probe times or redacted document identities do not qualify for the corresponding event-linked timing/correlation claims.
- Public interaction controls: `/tmp/repro-diagnostics96/acceptance.json`; non-intercepting overlays, absent geometry, scrolling and child-frame limitation all behaved as specified. Child pointer events also retain sampled document-specific timing and explicitly frame-local coordinates.
- High-DPI fractional crop and video hold: `/tmp/repro-hidpi99/acceptance.json`, using isolated invocation directories. Opaque fractional target coverage at 2× resolution also passed (`/tmp/repro-hidpi-private108/acceptance.json`): every pixel through the outward-rounded target edges is covered, and its normalized video hold remains correctly positioned. Latest viewer build with existing audited media: `/tmp/repro-portable88-check/portable-viewer.json` (explicit viewer override).
- Fractional and one-frame synthetic edits over real captured pixels: `/tmp/repro-short-segments-after88/acceptance.json`, all 76 decoded frames match; failing predecessor outputs remain in `/tmp/repro-short-segments-before85` and iterations 85–87.
- The iteration 63 reference run prepared after-review in **0.81 seconds**, rendered a presentation edit in **1.85 seconds**, and reused an unchanged presentation in **0.98 seconds**. Full strict paired export took **61.09 seconds**. These are individual observations, not the required Phase 1 median comparison.
- Real timing with snapshot tracing and three rejecting negative controls: `/tmp/repro-timing99/acceptance.json`, including the 76-frame fractional/single-frame presentation check. Earlier plain timing: `/tmp/repro-timing57/acceptance.json`.
- Expanded native/CDP experiment: `/tmp/repro-native61/experiment.json`; native plain popup rejected 960×720 and screenshot tracing rejected 800×450 against 1280×720. Older experiment failures remain at `/tmp/repro-native58` and `/tmp/repro-native60`.
- A competing-load run correctly rejected an **89 ms** screenshot acquisition interval (`/tmp/repro-public-pair38.log`). It remains retained as a failure; timing thresholds were not relaxed.
- Latest clean installed public scenario and external repository CLI execution: `/tmp/repro-install-KZcytd/consumer` (`/tmp/repro-clean122.log`), installed offline from current tarballs including local review uncertainty/transport, centralized comparison contracts, MCP schema discovery, explicit original-timing compatibility, letter-only document IDs, ordinary checks, invocation isolation and opaque rendering.
- Fresh-agent report and exact public commands: `/tmp/repro-guidance-eval/current-agent-02/fresh-agent-report.json` and `commands.json`. Four OCR media audits, seven relocated asset hashes and nine HTTP endpoints passed. Its installed fixture predates sampled event-clock correction and does not claim event timing precision. Older unmeasured viewport provenance was correctly rejected and recaptured.
- Opaque moving-field privacy: `/tmp/repro-privacy107/acceptance.json` passed all four positions and rejected the unmasked control with current renderer-version enforcement. Iteration 104's moved-field image was also inspected visually. Iteration 101's weaker changed-pixel/OCR result is **invalid as privacy acceptance**: manual inspection found readable canary text. Its predecessor artifacts remain private failure evidence, and the public export CLI now rejects that old presentation until rerendered.
- Ordinary checks: `/tmp/repro-checks107/acceptance.json` verifies that a prerequisite screenshot has no fix-proof label, the designated result does, and a caught prerequisite failure remains an unsuccessful run and cannot export. OCR checks actual stills using automatic and sparse text layouts.

Temporary paths are session-local evidence. Committed acceptance scripts reproduce these checks; CI retains their outputs, including timing and fixture recordings.

## Phase 4–5 continuation

Implemented since milestone commit `8f3739a`:

- Two bounded OCR workers (configurable 1–8), mandatory dual-layout scans,
  deduplication before scheduling, and draining on failure. Shared invocation-local
  frame extraction/luminance analysis bounds expensive quality decoders to two.
- Exact unchanged-export reuse verifies the entire bundle, current OCR availability,
  model contents, policy/input/implementation/tool/viewer identity and audit receipts.
  Missing, corrupt and extra artifacts invalidate reuse. Cold export still audits
  private snapshots before atomic publication.
- SQLite transaction locks replace ad-hoc sentinel ownership for render, compositor,
  stage, package and delivery publication. Crash recovery and competing asynchronous
  writers pass; legacy sentinel locks remain explicitly rejected for inspection.
- Public visibility and response observations, contracts and registry-derived agent
  guidance. Real before/after scenarios cover absence, appearance, hidden state,
  ambiguous targets, removal, HTTP 503/200 and sanitized network canaries.
- Watch mode can own one persistent build server while cancelling/replacing browser
  runs. Public CLI acceptance verifies the same server PID across two runs, fresh
  browser localStorage each time, and owned-server shutdown.
- Immutable audit/upload bytes and a private outbox fix delivery's source-mutation
  window. Jira/ADO tests reconcile lost responses without duplicate attachments,
  reject corrupted downloads and recover deleted attachments. No live issues were
  modified. Registry selection remains a distribution decision.
- Windows process-tree and lock recovery checks are added to CI. This Linux host
  has not executed the Windows job.

Local continuation validation passed: build, typecheck, lint, **214 tests in 90 files**,
**27 ShopLite/media tests**, public observation/watch workflows, real OCR export
reuse/repair/rejection, real HTTP delivery fixtures, and relocated tarball installation.
Report: `.repro/phase45-acceptance.json`. The earlier Phase 1–3 acceptance remains
historical. Cold strict export took **39.94 s**; three verified repeated exports had
a median of **0.80 s**. Missing-image repair reaudited the media; missing OCR rejected
export without replacing the valid bundle. The release contains 16 tarballs, relative
dependency references and checked hashes at `.repro/releases/phase45`, archived as
`.repro/releases/repro-phase45-toolchain.tgz`. A historical Phase 1 annotation median was not
recorded, so current export/cache timings do not establish the 50% annotation
improvement target. Release tarballs passed installation after moving the distribution to an unrelated
consumer path and verifying every checksum. Remote Windows CI and registry
publication have not been performed.


## Remote acceptance follow-through

The Windows cancellation and crashed-writer lock gate passed **4 tests in 2 files**
at commit `ae02eef`: [Windows job](https://github.com/jitterbox/Repro/actions/runs/34310454937/job/102335855398).
Remote execution exposed and repaired three clean-machine assumptions: an ignored
`coverage/` source directory, CRLF conversion of generated TypeScript, and FFmpeg
tests assigned to the dependency-free job. The source module now uses
`fixture-coverage/`, Git attributes preserve LF bytes, and synthetic encoding tests
run in the media job. The Windows image is pinned to Server 2022 because pnpm 9's
bundled node-gyp does not recognize the VS 2026 compiler in the moving image.

The evaluation package now carries its canonical fixture coverage matrix with it;
relocated installation exercises that exported loader without repository access.
The annotation benchmark records seven actual title edits after one warmup, with
capture hash preservation and OCR verification outside the timed render call.
The current local median is **2.06 s** (`.repro/annotation-benchmark/attempt-k50nhV/benchmark.json`).
This is a present-day measurement, not a historical Phase 1 median or a claim of
50% improvement. CI records the same measurements with implementation, font, tool
and machine identity. Registry destination/authentication and the missing approved
performance baseline remain required to complete those two gates.

The first complete remote media pass reached synchronization and caught a final
checkpoint inside the last output-frame interval. Its timestamp followed the last
frame PTS, so its label was absent. Comparison rendering now includes the minimum
extra frame needed to display every cue without advancing cue timestamps, and
returns `outputTiming` with the measured endpoint, encoded duration and terminal
padding. The retained failure was 4,028.083 ms / 121 frames; the corrected output
is 122 frames with one explicitly reported extra frame. Actual-frame OCR and
visual inspection confirm checkpoint 4/4 and both verified outcomes. Fresh
uneven-delay acceptance and its negative controls pass at
`/tmp/repro-terminal-sync/acceptance.json`; the two-frame alignment tolerance is
unchanged. Four deterministic boundary cases cover fractional and exact endpoints.
