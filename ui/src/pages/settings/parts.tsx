import { useState, useEffect, type ReactNode } from 'react';
import { Spinner } from '@/components/ui';

export function timeAgo(ts: number | null): string {
  if (!ts) return 'never';
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

export const errText = (e: unknown) => String(e instanceof Error ? e.message : e);

/**
 * A titled sheet of related settings. The heading and its one-line gloss sit on
 * the page; the rows sit on one sheet of paper, divided by hairlines, so each
 * category reads as a few deliberate groups rather than a run of loose rows.
 */
export function Group({ title, desc, action, tone, children }: {
  title: ReactNode; desc?: ReactNode; action?: ReactNode; tone?: 'danger'; children: ReactNode;
}) {
  return (
    <section className="sgroup">
      <header className="sgroup-head">
        <div className="sgroup-text">
          <h2>{title}</h2>
          {desc && <p>{desc}</p>}
        </div>
        {action && <div className="sgroup-action">{action}</div>}
      </header>
      <div className="sheet" data-tone={tone}>{children}</div>
    </section>
  );
}

/**
 * One setting: what it is and why you'd change it on the left, the control on
 * the right edge every row shares, anything bigger (a textarea, a report)
 * full-width below.
 */
export function SettingRow({ title, desc, control, children }: {
  title: ReactNode; desc?: ReactNode; control?: ReactNode; children?: ReactNode;
}) {
  return (
    <div className="srow">
      <div className="srow-main">
        <div className="srow-text">
          <h3 className="srow-title">{title}</h3>
          {desc && <p className="srow-desc">{desc}</p>}
        </div>
        {control && <div className="srow-control">{control}</div>}
      </div>
      {children && <div className="srow-body">{children}</div>}
    </div>
  );
}

export function RowLoading() {
  return <div className="row-loading"><Spinner /></div>;
}

/**
 * A number with its unit set inside the field, so every numeric control is one
 * object of one shape. It saves on Enter or when focus leaves, Escape puts it
 * back, and the value is clamped first so it can't send something the server
 * would reject.
 */
export function NumberSetting({ label, value, unit, min, max, step, width = 56, disabled, onSave }: {
  label: string; value: number; unit: string; min: number; max: number; step?: number; width?: number;
  disabled?: boolean; onSave: (v: number) => Promise<void>;
}) {
  const [draft, setDraft] = useState(String(value));
  const [saving, setSaving] = useState(false);
  useEffect(() => { setDraft(String(value)); }, [value]);

  const commit = async () => {
    const parsed = Math.floor(Number(draft));
    if (draft.trim() === '' || !Number.isFinite(parsed)) { setDraft(String(value)); return; }
    const clamped = Math.min(max, Math.max(min, parsed));
    setDraft(String(clamped));
    if (clamped === value) return;
    setSaving(true);
    try { await onSave(clamped); } finally { setSaving(false); }
  };

  return (
    <label className="num-field" data-disabled={disabled || undefined} data-saving={saving || undefined}>
      <input
        type="number" inputMode="numeric" min={min} max={max} step={step} value={draft} disabled={disabled || saving}
        aria-label={label} className="tnum" style={{ width }}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') { setDraft(String(value)); requestAnimationFrame(() => (e.target as HTMLInputElement).blur()); }
        }}
      />
      <span className="num-unit">{unit}</span>
    </label>
  );
}
