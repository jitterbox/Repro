import type { CSSProperties } from 'react';

import type { BoundingRect, RoiMagnifierProps } from '../types.js';
import { color } from '../theme.css.js';

const defaultPip = (): BoundingRect => ({
  x: 24,
  y: 24,
  w: 320,
  h: 200,
});

export function RoiMagnifier(props: RoiMagnifierProps) {
  const pip = props.pipRect ?? defaultPip();
  const src = props.sourceRect;

  return (
    <div
      style={{ width: 1280, height: 720, position: 'relative' }}
      data-component="roi-magnifier"
    >
      <div
        style={{
          position: 'absolute',
          left: src.x,
          top: src.y,
          width: src.w,
          height: src.h,
          border: `2px dashed ${color('repro-change')}`,
          boxSizing: 'border-box',
          pointerEvents: 'none',
        }}
      />
      <MagnifierPip
        rect={pip}
        factor={props.magnification}
        {...(props.label ? { label: props.label } : {})}
      />
    </div>
  );
}

function MagnifierPip({
  rect,
  factor,
  label,
}: {
  rect: BoundingRect;
  factor: number;
  label?: string;
}) {
  const frame: CSSProperties = {
    position: 'absolute',
    left: rect.x,
    top: rect.y,
    width: rect.w,
    height: rect.h,
    border: `2px solid ${color('repro-info')}`,
    borderRadius: 4,
    background: 'transparent',
    boxSizing: 'border-box',
    overflow: 'hidden',
  };

  return (
    <div style={frame}>
      <div
        style={{
          position: 'absolute',
          top: 6,
          right: 8,
          fontSize: 12,
          fontWeight: 700,
          fontFamily: 'var(--repro-font)',
          color: 'var(--repro-label-fg)',
          background: 'var(--repro-label-bg)',
          padding: '2px 8px',
          borderRadius: 3,
        }}
      >
        {label ?? `${factor}×`}
      </div>
    </div>
  );
}
