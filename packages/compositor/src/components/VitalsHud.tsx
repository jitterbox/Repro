import type { CSSProperties } from 'react';

import type { VitalsHudProps } from '../types.js';

const slotStyle = (
  slot: NonNullable<VitalsHudProps['slot']>,
): CSSProperties => {
  const inset = 'var(--repro-inset)';
  const base: CSSProperties = {
    position: 'absolute',
    padding: '8px 12px',
    background: 'var(--repro-label-bg)',
    borderRadius: 4,
    border: '1px solid var(--repro-plate-hairline)',
    fontFamily: 'var(--repro-font)',
    fontSize: 13,
    color: 'var(--repro-label-fg)',
    fontVariantNumeric: 'tabular-nums',
  };
  const corners: Record<
    NonNullable<VitalsHudProps['slot']>,
    CSSProperties
  > = {
    tl: { top: inset, left: inset },
    tr: { top: inset, right: inset },
    bl: { bottom: inset, left: inset },
    br: { bottom: inset, right: inset },
  };
  return { ...base, ...corners[slot] };
};

export function VitalsHud(props: VitalsHudProps) {
  const slot = props.slot ?? 'tr';
  const items = [
    props.cls != null ? `CLS ${props.cls.toFixed(3)}` : null,
    props.lcp != null ? `LCP ${Math.round(props.lcp)}ms` : null,
    props.inp != null ? `INP ${Math.round(props.inp)}ms` : null,
  ].filter(Boolean);

  return (
    <div
      style={{ width: 1280, height: 720, position: 'relative' }}
      data-component="vitals-hud"
    >
      <div style={slotStyle(slot)}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.1em',
            color: 'var(--repro-meta)',
            marginBottom: 4,
          }}
        >
          VITALS
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          {items.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
