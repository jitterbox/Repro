# AC — Catalog layout & controls

## Acceptance criteria

1. Label and control columns in settings use a **16px** gutter (see
   `mockup.tokens.json` → `spacing.labelControlGutterPx`).
2. The Save control aligns with the input column; it must not shift left of the
   label column.
3. Body/price text on muted surfaces meets **4.5:1** contrast (`#1a1a1a` on
   `#ffffff`).
4. Status badge animates once over **200ms** with no opacity flicker loop.
5. Nested Actions → Export menus stack with the deepest menu **above** parents.
6. Advanced pricing panel is available on hover **and** keyboard focus; currency
   glyph is `$`.
7. Context menu Delete applies to the row under the cursor.
8. Drag-reorder snaps items to the list grid with **0px** residual offset.
9. Save does not emit console errors.
10. Promo banner reserves space; CLS attributable to banner inject &lt; 0.1.
11. Recalculate must not block the main thread for &gt; 100ms (use async work).
12. Overflow (⋯) hit target is at least **24×24** CSS pixels.
13. Help modal supports Escape and a complete Tab cycle including Close.
14. Invoice preview popup total matches cart (**84.50** in the demo catalog).
