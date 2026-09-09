import type { CSSProperties } from 'react';

import type { OutcomePairProps } from '../types.js';
import { color } from '../theme.css.js';

export function OutcomePair(props: OutcomePairProps) {
  const scrim: CSSProperties = {
    width: 1280,
    height: 720,
    background: color('repro-scrim'),
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'var(--repro-font)',
  };

  return (
    <div style={scrim} data-component="outcome-pair">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <OutcomePlate kind="expected" text={props.expected} />
        <OutcomePlate kind="actual" text={props.actual} />
      </div>
    </div>
  );
}

function OutcomePlate({
  kind,
  text,
}: {
  kind: 'expected' | 'actual';
  text: string;
}) {
  const accent =
    kind === 'expected' ? color('repro-add') : color('repro-remove');
  const label = kind === 'expected' ? 'EXPECTED' : 'ACTUAL';

  return (
    <div
      style={{
        minWidth: 480,
        padding: '14px 18px',
        background: 'var(--repro-label-bg)',
        borderLeft: `4px solid ${accent}`,
        borderRadius: 4,
        color: 'var(--repro-label-fg)',
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.1em',
          color: 'var(--repro-label-fg)',
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 500,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {text}
      </div>
    </div>
  );
}
