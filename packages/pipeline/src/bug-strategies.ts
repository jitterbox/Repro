import type { DiscoveryConcern } from '@jitterbox/repro-contracts';

export interface Strategy {
  id: DiscoveryConcern;
  signals: string[];
  capabilities: string[];
  features: string[];
  recipe?: string;
  question: string;
  capture: string;
  focus: string;
  verify: string;
  avoid: string;
}
/** Editorial decision cards. Capability implementation/availability stays in the registry. */
export const bugStrategies: readonly Strategy[] = [
  {
    id: 'interaction',
    signals: ['functional', 'pointer', 'hit-target', 'stacking', 'drag'],
    capabilities: ['hit-test', 'target', 'outcome'],
    features: ['cursor', 'clickViz', 'hitTargets', 'stackingContexts'],
    recipe: 'interaction',
    question:
      'Which natural action fails, which control should receive it, and what state should follow?',
    capture:
      'Show context, sample the intended point before its natural interaction, and capture the resulting state. For dragging retain the complete down/move/up interval.',
    focus:
      'Intended control, obstructing element only when measured, and affected result. Keep reference controls visible.',
    verify:
      'Compare the sampled stack with actual event recipients and the designated state assertion. A point sample does not measure the entire hit region.',
    avoid:
      'Do not force-click, change CSS, or label a transparent element as an interceptor from bounds alone.',
  },
  {
    id: 'geometry',
    signals: ['geometry', 'compare', 'visual', 'cls'],
    capabilities: ['compare', 'frame', 'render'],
    features: ['zoom', 'layoutShiftViz'],
    recipe: 'geometry',
    question:
      'Which measured relationship is wrong: position, size, alignment or displacement?',
    capture:
      'Capture affected and reference bounds at matching semantic checkpoints; use the same viewport and controlled comparison pass.',
    focus:
      'Affected element plus reference edge. Preserve context and shared crop bounds/scale, with 24 CSS-pixel padding. Keep the actual edges visible; remove diagnostic rings when their stroke hides the displacement being measured.',
    verify:
      'Compute deltas from browser observations. Use ROI/difference/edge views for small changes; retain unmatched or uncertain alignment.',
    avoid:
      'Do not copy ticket coordinates or claimed pixel deltas into proof. A controlled pass cannot establish faithful layout-shift timing.',
  },
  {
    id: 'appearance',
    signals: ['hidden', 'hover'],
    capabilities: ['visibility', 'checkpoint', 'segment'],
    features: ['hiddenElements', 'cursor'],
    question:
      'Is the element absent, hidden, occluded, or visible only during hover?',
    capture:
      'Sample visibility before and after the actual action; capture while hover is maintained. Keep transient behavior in a segment.',
    focus:
      'Trigger and revealed/affected content; label absent elements as absent rather than inventing a footprint.',
    verify:
      'Use visibility samples, rendered pixels and an outcome assertion. Playwright visibility alone does not prove perceptibility.',
    avoid:
      'Do not reveal an element with CSS or equate opacity, attachment and hit testing.',
  },
  {
    id: 'transient',
    signals: ['timing', 'animation', 'race', 'flake', 'intermittent'],
    capabilities: ['segment', 'frame', 'run'],
    features: ['slowmo', 'pauses'],
    recipe: 'transient',
    question:
      'What starts the brief failure, and which observable event locates the decisive frames?',
    capture:
      'Use faithful capture, start the segment before the trigger, select event-linked frames afterward and retain timing uncertainty. For intermittent issues use --repeat and keep every attempt.',
    focus:
      'The changing content and trigger; select onset, peak failure and recovery when each changes the explanation.',
    verify:
      'Inspect original-timing playback and event-linked pixels. Screencast frames are change-driven: a requested offset may have no nearby frame even during a visible stationary state. Inspect actual timestamps before revising the committed selection; retain rejected attempts and never widen tolerance merely to pass. Report failed, successful and inconclusive attempts with their denominator.',
    avoid:
      'No stability wait, fixed clock, reduced motion, network stubbing or screenshot before the trigger when it would disturb the race. Slow motion and reading holds belong to presentation.',
  },
  {
    id: 'console',
    signals: ['console'],
    capabilities: ['review', 'outcome'],
    features: ['consoleOverlay'],
    question:
      'Which error follows the trigger, and how does it affect the user-visible result?',
    capture:
      'Keep console evidence in the same step/page interval as the natural action and capture the resulting UI.',
    focus:
      'One relevant error callout plus the failed UI outcome; retain other errors in diagnostics.',
    verify:
      'Correlate timestamps and confirm the intended state assertion; temporal proximity is not proof of causality.',
    avoid:
      'Do not treat any console error or setup exception as the designated bug.',
  },
  {
    id: 'performance',
    signals: ['freeze', 'cls', 'performance'],
    capabilities: ['segment', 'review', 'frame'],
    features: ['freezeDetect', 'vitalsHud', 'layoutShiftViz'],
    question:
      'Is the issue blocked input, long work, late rendering or shifting layout?',
    capture:
      'Record the full natural action and recovery under faithful timing. Keep expensive diagnostics selective and account for their overhead.',
    focus:
      'User action and visible stall/shift; only show durations supported by recorded timing.',
    verify:
      'Inspect captured timing and responsiveness with outcome checks; use a separate controlled pass for precise geometry comparison.',
    avoid:
      'Do not infer a freeze from a stationary video or equate presentation duration with application latency.',
  },
  {
    id: 'accessibility',
    signals: ['a11y', 'accessibility'],
    capabilities: ['accessibility', 'checkpoint', 'outcome'],
    features: ['a11yOverlay', 'hitTargets'],
    question:
      'Which access requirement fails, and can an automated scan test that requirement?',
    capture:
      'Run checkpoint-scoped Axe against the relevant state; measure targets and retain context pixels.',
    focus:
      'Affected control and specific reported violation, with a readable callout rather than every scan result.',
    verify:
      'Link violations to observations and recheck after the fix. Manual interaction still needs its own assertions.',
    avoid:
      'A clean scan does not prove keyboard usability or complete accessibility.',
  },
  {
    id: 'keyboard',
    signals: ['keyboard'],
    capabilities: ['step', 'check', 'outcome'],
    features: ['keystrokes', 'a11yOverlay'],
    question:
      'What is the expected focus order and which key sequence exposes the failure?',
    capture:
      'Use real keyboard actions, observe completion of focus-changing events such as dialog close, assert focused elements at meaningful transitions, and capture the decisive focus state. An immediate activeElement sample can precede a queued focus change.',
    focus:
      'Current focus, skipped control and meaningful numbered keys/steps. Preserve native focus rings: use highlights: [] on a focus checkpoint when diagnostic outlines would hide or mimic the focus indicator.',
    verify:
      'Recheck the intended focus order and resulting action after the fix; combine with a scan only when useful.',
    avoid:
      'Do not replace keyboard navigation with clicks or expose printable form input in key badges.',
  },
  {
    id: 'multipage',
    signals: ['multipage', 'popup'],
    capabilities: ['checkpoint', 'check', 'outcome', 'review'],
    features: ['steps'],
    question: 'Which page owns the trigger, expected data and failed result?',
    capture:
      'Await popup registration, bind locators on their owning page and pass that Page to checkpoint/check/outcome. Preserve editorial cuts.',
    focus:
      'Source data, popup transition and incorrect result with page identity.',
    verify:
      'Assert the popup result against source state; inspect cuts and same-page outline/frame alignment.',
    avoid:
      'Never reuse geometry from the opener on a popup or silently select only the busiest page.',
  },
  {
    id: 'privacy',
    signals: ['pii', 'redaction', 'privacy'],
    capabilities: ['doctor', 'render', 'export'],
    features: ['redaction'],
    question:
      'What content is sensitive, including untouched fields, popups and moving elements?',
    capture:
      'Define strict selectors/patterns before capture. Keep raw traces, HAR and diagnostics local; test masks while content moves.',
    focus:
      'The behavior under test with opaque masks; use a synthetic canary only in an authorized fixture.',
    verify:
      'Inspect actual masked pixels and require current full-frame OCR audit before export.',
    avoid:
      'Never echo credentials from a ticket or treat captions/sidecars as a privacy audit.',
  },
  {
    id: 'network',
    signals: ['network', 'request'],
    capabilities: ['network', 'review', 'outcome'],
    features: ['consoleOverlay'],
    question: 'Which request and user action correlate with the failed state?',
    capture:
      'Observe the relevant response at a named checkpoint without collecting secret headers or bodies; preserve faithful network behavior.',
    focus: 'Trigger, sanitized failure status and resulting UI state.',
    verify:
      'Record actual response/failure observations and the designated UI assertion. Separate correlation from cause.',
    avoid:
      'Do not introduce HAR replay into a faithful network failure reproduction or expose authentication data.',
  },
  {
    id: 'native',
    signals: ['native', 'os', 'browser-chrome'],
    capabilities: ['os-capture', 'doctor'],
    features: [],
    question: 'Does the claimed defect occur outside the page content surface?',
    capture:
      'Stop page-proof planning for native dialogs/browser chrome and report unsupported OS capture.',
    focus:
      'Explain the missing surface rather than exporting page pixels as native proof.',
    verify: 'Check doctor/backend support and keep the limitation explicit.',
    avoid: 'No silent page-capture substitution.',
  },
];
