import type { CSSProperties } from 'react';

import { severityColor } from '@repro/contracts';

import type { ConsoleLevel, ConsoleToastProps } from '../types.js';

const levelSeverity: Record<
  ConsoleLevel,
  'critical' | 'warn' | 'info'
> = {
  error: 'critical',
  warn: 'warn',
  info: 'info',
  log: 'info',
};

export function ConsoleToast(props: ConsoleToastProps) {
  const accent = severityColor(levelSeverity[props.level]);
  const plate: CSSProperties = {
    position: 'absolute',
    left: 'var(--repro-inset)',
    right: 'var(--repro-inset)',
    bottom: 'var(--repro-inset)',
    minHeight: 48,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 14px',
    background: 'var(--repro-label-bg)',
    borderLeft: `4px solid ${accent}`,
    borderRadius: 4,
    fontFamily: 'var(--repro-font-mono)',
    fontSize: 'var(--repro-console-size)',
    color: 'var(--repro-label-fg)',
    boxSizing: 'border-box',
  };

  return (
    <div
      style={{ width: 1280, height: 720, position: 'relative' }}
      data-component="console-toast"
    >
      <div style={plate}>
        <span
          style={{
            fontWeight: 700,
            fontSize: 11,
            letterSpacing: '0.06em',
            padding: '2px 8px',
            borderRadius: 3,
            background: accent,
            color: '#fff',
            textTransform: 'uppercase',
          }}
        >
          {props.level}
        </span>
        <span
          style={{
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {props.message}
        </span>
        {props.timestamp ? (
          <span style={{ color: 'var(--repro-meta)', flexShrink: 0 }}>
            {props.timestamp}
          </span>
        ) : null}
      </div>
    </div>
  );
}
