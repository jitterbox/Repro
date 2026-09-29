# Fresh-agent evaluation

This evaluates whether an agent can interpret a new ticket and produce useful
evidence through public Repro interfaces. It is separate from deterministic
fixture replay, mock-agent tests, and a general claim of autonomous bug solving.

## Protocol

1. An evaluator creates unfamiliar tickets and a running application with before
   and after variants. Keep the implementation and evaluation answers outside the
   discovery agent's allowed reading set. Include misleading suspected causes,
   uncertain measurements, transient states, and an unsupported request.
2. Start agents without conversation history. Give them the tickets, application
   URLs, an installed Repro CLI/Playwright toolchain, and published usage guidance.
   Agents may inspect the running application and public package types. Record
   the exact prompt, model/context arrangement, guidance version and any coaching.
3. Each agent interprets the claim, discovers capabilities, records why tools are
   selected or rejected, and commits assessments, configuration, executable specs
   and evidence definitions. Capture through Repro. Preserve unsuccessful attempts.
4. The agent inspects actual evidence, verifies the before failure and after
   success, and exports through strict auditing. Unsupported requests produce an
   explicit limitation instead of substitute proof.
5. An independent evaluator reviews the assertions and measured observations,
   verifies artifact contents and audits, and inspects the decisive pixels.
   An agent's completion report is a submission, not a passing judgment.
6. Replay the committed scenarios with no LLM. Report this replay separately from
   the discovery result. Once solutions are published, these tickets become
   regression cases; future fresh evaluations need new held-out tickets.

The separation here is an instruction-based reading boundary, not a filesystem
sandbox guarantee. Agents share a model family and are not independent samples
of the entire agent population. A small corpus establishes demonstrated cases,
not a statistically estimated general success rate.

## Rubric

Every supported case must satisfy each applicable obligation:

- **Understanding:** a falsifiable claim and explicit expected state; reported
  causes and guessed numbers remain hypotheses until measured.
- **Selection:** relevant capabilities have reasons, irrelevant or intrusive
  diagnostics are omitted, and faithful timing is preserved where required.
- **Execution:** real locators and natural actions; same scenario/assertion on
  both variants; ordinary setup failures cannot masquerade as reproduced bugs.
- **Proof:** designated failure before and success after, sufficient diagnostic
  observations for each causal claim, and decisive transient pixels when needed.
- **Presentation:** meaningful numbered steps, variant labels, readable titles,
  purposeful highlights, retained context, and no annotation obscuring the defect.
- **Privacy and portability:** measured masks, actual media audits, verified
  artifact contents and a relocatable export. Raw capture is not review output.
- **Honesty:** failures and repairs remain visible; unsupported work is not
  silently converted into a passing alternative.

The six `FA-*` tickets cover pointer interception, keyboard focus restoration,
out-of-order search responses, a transient false failure, measured alignment with
long text, and native-surface rejection. Contact information is synthetic privacy
test data. The fixture server lives in `scripts/e2e/fresh-agent/server.mjs`;
discovery agents must not read it until their submissions are frozen.

## Live versus mock

The legacy `@jitterbox/repro-agent-e2e` package has no live provider adapter. Requesting
`REPRO_AGENT_E2E=1` fails explicitly rather than running a mock under a live label.
The nightly workflow reports this limitation. External fresh agents can execute
the protocol above without adding a hosted model dependency to committed replay.

## September evaluation findings

Three agents started with empty conversation history and used an independently
installed toolchain, untagged tickets, the running UI, and public guidance. They
authored five executable browser scenarios and correctly rejected one native
request. They did not receive the fixture source or expected implementation.
The evaluator subsequently read their code, observations and actual images.

The accepted solutions distinguish enabled-but-intercepted input from disabled
controls (FA-01), asynchronous focus restoration from an immediate focus sample
(FA-02), successful responses arriving out of order from HTTP failure (FA-03),
a transient false error from final successful state (FA-04), measured 12px
displacement from the reporter's 20px guess (FA-05), and native UI from page
capture (FA-06).

This was not a clean first-pass result. All agents repaired inherited TypeScript
configuration during setup. Other retained repairs include an incorrect expected
status string, missing diagnostic requirements, frame-selection uncertainty,
duplicate step numbering and highlights obscuring focus/edge evidence. The
evaluator requested editorial repairs on FA-01, FA-02 and FA-05. FA-01's assertion
repair coincided with evaluator feedback and is conservatively marked assisted.
Timing cases retained faithful primary runs and separate controlled companions.

The evaluation exposed a product defect: a final measured checkpoint could give
way to an older screencast frame during the padded outcome bed, while the video
still displayed “Fix verified.” Terminal stable outcome holds now retain the
measured checkpoint through the presentation end. The old contradictory video
is retained as a failing pixel negative control; original recordings are unchanged.
`terminal-checkpoint.mjs` compares decoded terminal pixels with the outcome still
using perceptual differences in local tiles, so a wrong status word cannot hide
inside a whole-frame average. This checks presentation consistency, not arbitrary
semantic correctness of an image.

Other fixes make `init` create a local compiler configuration, reject fake live
evaluation, and publish more specific guidance for numbering, concise expected
conditions, focus rings, reference edges, crop context and event-frame selection.
Remaining editorial limits are disclosed: some long Before outcome captions
ellipsize their suffix, and a callout can obscure nonessential page chrome. The
decisive application state, focus, or measured numeric tolerance remains visible;
the complete expectation is retained in evidence and the submission report.

## Replay and review

Run `pnpm test:fresh-agent-replay` after building. It launches an isolated fixture
server, copies the frozen inputs from `testdata/fresh-agent/replay.json`, executes
both variants, checks designated outcomes, renders and inspects terminal pixels,
and verifies the native rejection. No LLM participates. CI runs this command and
retains `.repro/fresh-agent-replay` on failure. It is now a regression corpus, not
unseen material for future fresh-agent scoring.

`node scripts/e2e/fresh-agent/verify-submissions.mjs` checks the original local
submission captures with the current renderer, reaudits exports, verifies all
artifact hashes and diagnostic obligations, and publishes `FA-01`–`FA-06` rows
in the existing evidence review table. It requires the session-local paths in the
agent reports; use deterministic replay on another machine. Original reports and
failed attempts are preserved rather than rewritten to claim first-pass success.
The final verification report lives under `.repro/fresh-agent-verification`.

Final local validation passed: all six frozen replay cases, independent checks
and fresh strict OCR audits for all five browser pairs, clean packed-package
installation beneath an incompatible parent compiler configuration, and the
public capture/render/export/relocated-viewer workflow. The local reports are
`.repro/fresh-agent-replay/attempt-6D1MHH/acceptance.json`,
`.repro/fresh-agent-verification/attempt-6MR9n1/acceptance.json`, and
`.repro/fresh-public-regression/acceptance.json`. Build, type checking, lint,
focused presentation/discovery tests and the unavailable-live-provider negative
test passed. The review table includes six FA rows with audited outputs and
per-test feedback fields. These results are local; they do not assert a new
remote CI run.
