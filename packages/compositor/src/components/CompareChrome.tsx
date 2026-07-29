import type { CSSProperties } from 'react';

import type { CompareChromeProps } from '../types.js';
import { color } from '../theme.css.js';

const paneW = 612;
const paneH = 345;
const paneY = 124;

export function CompareChrome(props: CompareChromeProps) {
  const frame: CSSProperties = {
    width: 1280,
    height: 720,
    position: 'relative',
    fontFamily: 'var(--repro-font)',
    color: 'var(--repro-label-fg)',
    background: color('repro-slate-bg'),
    boxSizing: 'border-box',
  };

  return (
    <div style={frame} data-component="compare-chrome">
      <Header bugId={props.bugId} layout={props.layout} />
      <Pane
        side="before"
        x={28}
        pane={props.paneA}
      />
      <Pane
        side="after"
        x={640}
        pane={props.paneB}
      />
      {props.stepIndex != null && props.stepCount != null ? (
        <StepCounter index={props.stepIndex} total={props.stepCount} />
      ) : null}
      {props.deltaCaption ? (
        <DeltaCaption text={props.deltaCaption} />
      ) : null}
      {props.legend ? <Legend text={props.legend} /> : null}
    </div>
  );
}

function Header({ bugId, layout }: { bugId: string; layout: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 24,
        left: 24,
        right: 24,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <span style={{ fontWeight: 700, fontSize: 18 }}>{bugId}</span>
      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '0.08em',
          color: 'var(--repro-meta)',
        }}
      >
        {layout.toUpperCase()}
      </span>
    </div>
  );
}

function Pane({
  side,
  x,
  pane,
}: {
  side: 'before' | 'after';
  x: number;
  pane: CompareChromeProps['paneA'];
}) {
  const accent =
    side === 'before' ? color('repro-before') : color('repro-after');

  return (
    <div style={{ position: 'absolute', left: x, top: paneY, width: paneW }}>
      <div style={{ height: 4, background: accent, marginBottom: 8 }} />
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
        {pane.label}
      </div>
      {pane.build ? (
        <div style={{ fontSize: 12, color: 'var(--repro-meta)' }}>
          {pane.build}
        </div>
      ) : null}
      <div
        style={{
          marginTop: 8,
          width: paneW,
          height: paneH,
          border: '1px solid var(--repro-plate-hairline)',
          borderRadius: 4,
          background: '#0a0c10',
        }}
      />
    </div>
  );
}

function StepCounter({ index, total }: { index: number; total: number }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        fontSize: 14,
        fontWeight: 700,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      Step {index}/{total}
    </div>
  );
}

function DeltaCaption({ text }: { text: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: 24,
        right: 24,
        bottom: 56,
        textAlign: 'center',
        fontSize: 14,
        fontVariantNumeric: 'tabular-nums',
        color: 'var(--repro-meta)',
      }}
    >
      {text}
    </div>
  );
}

function Legend({ text }: { text: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        right: 24,
        bottom: 24,
        fontSize: 12,
        fontWeight: 700,
        padding: '4px 10px',
        borderRadius: 4,
        background: 'var(--repro-label-bg)',
        border: '1px solid var(--repro-plate-hairline)',
      }}
    >
      {text}
    </div>
  );
}
