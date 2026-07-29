import type { CSSProperties } from 'react';

import type { FreezeBannerProps } from '../types.js';

export function FreezeBanner(props: FreezeBannerProps) {
  const banner: CSSProperties = {
    position: 'absolute',
    left: '50%',
    top: 24,
    transform: 'translateX(-50%)',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 14px',
    background: 'var(--repro-label-bg)',
    borderLeft: '4px solid var(--repro-warn)',
    borderRadius: 4,
    color: 'var(--repro-label-fg)',
    fontFamily: 'var(--repro-font-sans)',
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    boxSizing: 'border-box',
    maxWidth: 720,
  };

  return (
    <div
      style={{ width: 1280, height: 720, position: 'relative' }}
      data-component="freeze-banner"
    >
      <div style={banner} role="status">
        <span aria-hidden="true">‖</span>
        <span>{props.label ?? 'UI freeze detected'}</span>
      </div>
    </div>
  );
}
