# Efficient recording and workflow audits

A Repro run records browser evidence. A **workflow audit** records how the agent produced it. Keep both: the run alone cannot explain time spent exploring, editing locators, waiting for login, or deciding to capture again.

## A short request

> Record this with Repro and audit the workflow. Keep a local native session transcript of my request, your visible decisions, and all tool calls/results. Enable Repro command timing logs. Record the reason and changed inputs before every recapture; reuse valid footage for presentation changes. Finish with time by phase, capture attempts, render attempts, and any tooling gaps. Mark any missing transcript coverage explicitly.

This asks for observable actions and concise decision summaries, not hidden model reasoning. The harness must actually support session logging/export to supply a full transcript. An agent-authored Markdown diary is useful context but is not a verbatim tool log. Repro cannot intercept arbitrary tools in Claude, Cursor, Codex or another host. Use the host's session export or configured tool hooks where available; preserve call IDs, start/end times, tool names, arguments/results, outcomes and original request. Retain sensitive transcripts locally and redact before sharing.

## Repro command timings

Enable a private JSONL log for the task before invoking the CLI:

```sh
# Linux
export REPRO_WORKFLOW_LOG="$PWD/.repro/workflow.jsonl"
```

```powershell
# Windows PowerShell
$env:REPRO_WORKFLOW_LOG = "$PWD/.repro/workflow.jsonl"
```

Or prefix individual commands with `repro --workflow-log .repro/workflow.jsonl …`.

```sh
repro workflow-report .repro/workflow.jsonl
```

The mirrored MCP `workflow-report` tool accepts `file`. Logging instruments CLI action execution only; MCP calls need the host's tool transcript. Each CLI invocation writes a start and a finish record with a unique ID, UTC timestamps, monotonic elapsed duration, command name and outcome. No command arguments, URLs, environment values, errors or output are logged. A killed process may leave an incomplete entry; the report keeps its outcome unknown. Help, argument parsing failures and commands run without logging are outside coverage. A fresh log per task avoids mixing unrelated sessions. Timing logs are local and are not included in evidence exports.

The report groups time by command and counts capture invocations. Overlapping commands have overlapping wall time; do not sum them into a claimed total agent duration. Repeated `run` commands may target different scenarios or deliberate comparison variants. Use transcript references and a short attempt ledger to explain them:

| Attempt | Run path / tool call ID | Reason | Changed execution or observations | Result |
| --- | --- | --- | --- | --- |
| 1 | Returned by `run` | Initial capture | Committed scenario | Passed / failed / inconclusive |
| 2 | Returned by `run` | Specific missing observation or execution failure | Exact input change | Outcome |

Use `run.json` stage timings to separate capture and review preparation from presentation. Scene render receipts report `renderMs` (browser setup, layout, frame capture and seek checks), `encodeMs` (encoding), and `totalMs` (both). These renderer timings exclude pipeline source sanitization and export OCR; the CLI log measures the full command. Report unmeasured time as unknown rather than assigning it to capture.

## Agent execution policy

1. Discover installed capabilities and check runtime dependencies once per environment. Explore authentication, navigation and locators together. Define the required checkpoints, state readers, data units and diagnostic streams before capturing.
2. Validate the committed config, evidence and treatment. Capture the entire deterministic scenario once, with real human-paced pointer input. A failed attempt remains part of the record.
3. Inspect the decisive source frame and diagnostic coverage before rendering. Rendering cannot recover a missed transient or observation. Recapture only for a concrete execution, timing, privacy or required-observation problem; record its reason before running again.
4. Reuse the returned run directory for layout, text, spacing, units, hold duration and encoding changes. Retain the original source and use `render --treatment …`. Do not change the viewport merely to gain annotation space. Prefer adaptive layout and fewer simultaneous explanations over increasing `style.minHeight`.
5. Inspect required moments and transition frames. Use at most three automatic presentation repair attempts, retaining drafts and reports. Export once the presentation is accepted; strict privacy/OCR gates still apply. Stop and report an unresolved limitation when the repair budget is exhausted.
6. Summarize the native transcript alongside command timings, run stages, render receipt and export result. Identify redundant discovery calls, avoidable recaptures, repeated full renders and repeated exports separately. Name any unavailable coverage.

The timing log provides a baseline for optimization; it does not promise a particular generation speed or prove that every tool call was efficient.
