import type { CSSProperties } from 'react';

import type { DeltaCaptionProps } from '../types.js';

export function DeltaCaption(props: DeltaCaptionProps) {
  const plate: CSSProperties = {
    position: 'absolute',
    left: 24,
    bottom: 112,
    maxWidth: 480,
    padding: '10px 14px',
    background: 'var(--repro-label-bg)',
    borderLeft: '4px solid var(--repro-change)',
    borderRadius: 4,
    color: 'var(--repro-label-fg)',
    fontFamily: 'var(--repro-font-sans)',
    boxSizing: 'border-box',
  };

  const caption = props.caption.slice(0, 42);

  return (
    <div
      style={{ width: 1280, height: 720, position: 'relative' }}
      data-component="delta-caption"
    >
      <div style={plate}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.13em',
            textTransform: 'uppercase',
            marginBottom: 4,
          }}
        >
          {props.deltaClass ?? 'change'}
        </div>
        <div style={{ fontSize: 17, fontWeight: 500 }}>{caption}</div>
      </div>
    </div>
  );
}
