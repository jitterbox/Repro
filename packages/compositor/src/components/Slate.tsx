import type { CSSProperties } from 'react';

import type { SlateProps } from '../types.js';
import { color } from '../theme.css.js';

const frame: CSSProperties = {
  width: 1280,
  height: 720,
  boxSizing: 'border-box',
  fontFamily: 'var(--repro-font)',
  color: 'var(--repro-label-fg)',
  background: color('repro-slate-bg'),
  padding: 'var(--repro-inset)',
  display: 'flex',
  flexDirection: 'column',
};

const accentForMode = (mode: SlateProps['mode']): string => {
  if (mode === 'demo') return color('repro-add');
  if (mode === 'compare') return color('repro-before');
  return color('repro-info');
};

export function Slate(props: SlateProps) {
  const accent = accentForMode(props.mode);
  const dsf = props.viewport.deviceScaleFactor ?? 1;

  return (
    <div style={frame} data-component="slate">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.13em',
            color: 'var(--repro-meta)',
          }}
        >
          REPRO
        </span>
        <span
          style={{
            fontSize: 'var(--repro-badge-size)',
            fontWeight: 700,
            padding: '4px 10px',
            borderRadius: 4,
            background: 'var(--repro-label-bg)',
            border: '1px solid var(--repro-plate-hairline)',
          }}
        >
          {props.mode.toUpperCase()}
        </span>
      </div>

      <div style={{ marginTop: 48, flex: 1 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: '0.08em',
            color: accent,
            marginBottom: 12,
          }}
        >
          {props.bugId}
        </div>
        {props.title.trim().toLowerCase() ===
        props.bugId.trim().toLowerCase() ? null : (
          <div
            style={{
              fontSize: 'var(--repro-slate-title-size)',
              fontWeight: 600,
              lineHeight: 1.15,
              maxWidth: 'min(960px, 100%)',
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              overflowWrap: 'anywhere',
            }}
          >
            {props.title}
          </div>
        )}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '120px 1fr',
          gap: '8px 16px',
          fontSize: 'var(--repro-slate-meta-size)',
          color: 'var(--repro-meta)',
        }}
      >
        <MetaRow label="Browser" value={props.browser} />
        <MetaRow label="OS" value={props.os} />
        <MetaRow
          label="Viewport"
          value={`${props.viewport.width}×${props.viewport.height} @${dsf}x`}
        />
        {props.profile ? (
          <MetaRow
            label="Profile"
            value={
              props.profileChip
                ? `${props.profile} · ${props.profileChip}`
                : props.profile
            }
          />
        ) : null}
        {props.locale ? (
          <MetaRow
            label="Locale"
            value={
              props.timezone
                ? `${props.locale} · ${props.timezone}`
                : props.locale
            }
          />
        ) : null}
        {props.build ? <MetaRow label="Build" value={props.build} /> : null}
        {props.stepCount != null ? (
          <MetaRow label="Steps" value={String(props.stepCount)} />
        ) : null}
        {props.durationMs != null ? (
          <MetaRow
            label="Duration"
            value={`${(props.durationMs / 1000).toFixed(1)}s`}
          />
        ) : null}
        {props.outcome ? (
          <MetaRow label="Outcome" value={props.outcome} />
        ) : null}
      </div>

      <div
        style={{
          marginTop: 24,
          fontSize: 'var(--repro-slate-meta-size)',
          color: 'var(--repro-meta)',
        }}
      >
        {props.appLabel}
      </div>

      {props.mode === 'compare' && props.comparePanes ? (
        <ComparePanes panes={props.comparePanes} />
      ) : null}
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span style={{ fontWeight: 600 }}>{label}</span>
      <span>{value}</span>
    </>
  );
}

function ComparePanes({
  panes,
}: {
  panes: NonNullable<SlateProps['comparePanes']>;
}) {
  return (
    <div style={{ display: 'flex', gap: 24, marginTop: 16 }}>
      <PaneChip side="before" {...(panes.a ? { pane: panes.a } : {})} />
      <PaneChip side="after" {...(panes.b ? { pane: panes.b } : {})} />
    </div>
  );
}

function PaneChip({
  side,
  pane,
}: {
  side: 'before' | 'after';
  pane?: { runId?: string; build?: string; label?: string };
}) {
  const accent =
    side === 'before' ? color('repro-before') : color('repro-after');
  return (
    <div style={{ flex: 1 }}>
      <div style={{ height: 4, background: accent, marginBottom: 8 }} />
      <div style={{ fontSize: 14, fontWeight: 600 }}>
        {pane?.label ?? side.toUpperCase()}
      </div>
      {pane?.runId ? (
        <div style={{ fontSize: 13, color: 'var(--repro-meta)' }}>
          {pane.runId}
        </div>
      ) : null}
      {pane?.build ? (
        <div style={{ fontSize: 13, color: 'var(--repro-meta)' }}>
          {pane.build}
        </div>
      ) : null}
    </div>
  );
}
