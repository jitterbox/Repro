# Negative controls corpus

Metadata fixtures for deterministic gate regression. Real MP4s can be wired
later; gates consume plan/timeline/composition JSON directly today.

| Fixture | Intended failure | Gate |
| --- | --- | --- |
| `zero-overlays.json` | Empty annotation list | `overlay-presence` |
| `centre-plate.json` | Callout plate centred in frame | `placement` |
| `15hz-blink.json` | High-frequency luminance flash | `flash` |
| `canary-leak.json` | Strict redaction without rects | `redaction` |
| `slate-id-mismatch.json` | Filename bug ID ≠ plan metadata | `slate` |
| `4s-clip.json` | Duration below hard minimum | `duration` |

Each JSON file includes a `expectedFailures` array naming gate modules that
should fail when `runDeterministicGates` is invoked with the embedded plan or
timeline payload.
