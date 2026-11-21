import { useState, useEffect, useRef } from 'react';
import { Search, X, SlidersHorizontal, Check } from 'lucide-react';
import type { JobStatus } from '@/lib/api';
import { Kbd, Switch, Segmented, type SegmentItem } from '@/components/ui';

const STATUS_TABS: { label: string; value: '' | JobStatus }[] = [
  { label: 'All', value: '' },
  { label: 'New', value: 'new' },
  { label: 'Shortlist', value: 'shortlist' },
  { label: 'Applied', value: 'applied' },
  { label: 'Interview', value: 'interview' },
  { label: 'Offer', value: 'offer' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'Hidden', value: 'hidden' },
];

type SourceOption = { value: string; label: string };

// Source types for the source filter, with display labels (the internal ids
// like "remoteok" aren't how the boards are branded). Split by kind: company
// boards are per-employer ATS feeds, aggregators are searched by keyword.
const BOARD_SOURCES: SourceOption[] = [
  { value: 'greenhouse', label: 'Greenhouse' },
  { value: 'ashby', label: 'Ashby' },
  { value: 'lever', label: 'Lever' },
  { value: 'recruitee', label: 'Recruitee' },
  { value: 'smartrecruiters', label: 'SmartRecruiters' },
  { value: 'workable', label: 'Workable' },
  { value: 'personio', label: 'Personio' },
  { value: 'bamboohr', label: 'BambooHR' },
  { value: 'workday', label: 'Workday' },
  { value: 'breezy', label: 'Breezy HR' },
  { value: 'rippling', label: 'Rippling' },
  { value: 'teamtailor', label: 'Teamtailor' },
];
const AGGREGATOR_SOURCES: SourceOption[] = [
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'google_jobs', label: 'Google Jobs' },
  { value: 'remoteok', label: 'RemoteOK' },
  { value: 'arbeitnow', label: 'Arbeitnow' },
  { value: 'himalayas', label: 'Himalayas' },
  { value: 'jobicy', label: 'Jobicy' },
  { value: 'themuse', label: 'The Muse' },
  { value: 'smartrecruiters_search', label: 'SmartRecruiters search' },
  { value: 'workingnomads', label: 'Working Nomads' },
  { value: 'weworkremotely', label: 'We Work Remotely' },
  { value: 'remotive', label: 'Remotive' },
  { value: 'jobtech', label: 'JobTech' },
  { value: 'hn_hiring', label: 'HN Who is hiring' },
];

/** Text filter over title and company, debounced; `/` focuses it from anywhere on the page. */
export function SearchField({ q, onQ }: { q: string; onQ: (v: string) => void }) {
  const [val, setVal] = useState(q);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => { setVal(q); }, [q]);
  const handle = (v: string) => {
    setVal(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => onQ(v), 250);
  };
  return (
    <div className="job-search">
      <Search size={15} className="job-search-icon" />
      <input
        aria-label="Filter jobs by title or company"
        placeholder="Filter by role or company"
        value={val}
        onChange={e => handle(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') { (e.target as HTMLInputElement).blur(); } }}
      />
      {val
        ? <button aria-label="Clear filter" onClick={() => { setVal(''); onQ(''); }}><X size={13} /></button>
        : <Kbd style={{ position: 'absolute', right: 10, pointerEvents: 'none' }}>/</Kbd>}
    </div>
  );
}

/**
 * The triage funnel as one segmented control, clustered the way triage flows:
 * the inbox (All, New), the pipeline (Shortlist through Offer), then the closed
 * piles. Triage states carry their count; All/New don't (they're most of the
 * table and the number says nothing).
 */
export function StatusTabs({ status, counts, onStatus }: {
  status: string; counts: Partial<Record<JobStatus, number>>; onStatus: (v: string) => void;
}) {
  const items: SegmentItem<'' | JobStatus>[] = STATUS_TABS.map(tab => ({
    value: tab.value,
    label: tab.label,
    count: tab.value && tab.value !== 'new' ? counts[tab.value] : undefined,
    groupStart: tab.value === 'shortlist' || tab.value === 'rejected',
  }));
  return (
    <div className="status-seg">
      <Segmented items={items} value={status as '' | JobStatus} onChange={onStatus} label="Filter by status" />
    </div>
  );
}

// All secondary filters collapse behind one control (progressive disclosure), so
// the always-visible bar stays calm. Badge shows how many are active. The sheet is
// capped to the space below its button: the header (with Reset) stays put and
// only the body scrolls, so nothing is ever cut off below the fold.
export function RefineControl({
  fit, remote, l1, l2, sourceTypes, onFit, onRemote, onL1, onL2, onToggleSource, onClearAll,
}: {
  fit: boolean; remote: boolean; l1: boolean; l2: boolean; sourceTypes: string[];
  onFit: (v: boolean) => void; onRemote: (v: boolean) => void; onL1: (v: boolean) => void;
  onL2: (v: boolean) => void; onToggleSource: (v: string) => void; onClearAll: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [maxH, setMaxH] = useState<number | undefined>(undefined);
  const ref = useRef<HTMLDivElement>(null);
  const count = [fit, remote, l1, l2].filter(Boolean).length + sourceTypes.length;

  useEffect(() => {
    if (!open) return;
    // 8px gap above the sheet + 16px breathing room at the window's bottom edge.
    const measure = () => {
      const r = ref.current?.getBoundingClientRect();
      if (r) setMaxH(Math.max(220, window.innerHeight - r.bottom - 24));
    };
    measure();
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); setOpen(false); } };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', measure);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', measure);
    };
  }, [open]);

  const row = (label: string, checked: boolean, onChange: (v: boolean) => void, hint: string) => (
    <label className="refine-row">
      <span>
        <span className="refine-row-label" data-on={checked || undefined}>{label}</span>
        <span className="refine-hint">{hint}</span>
      </span>
      <Switch checked={checked} onChange={onChange} label={label} />
    </label>
  );

  const chips = (opts: SourceOption[]) => (
    <div className="refine-chips">
      {opts.map(o => {
        const active = sourceTypes.includes(o.value);
        return (
          <button key={o.value} onClick={() => onToggleSource(o.value)} className="src-chip" aria-pressed={active}>
            {active && <Check size={11} strokeWidth={2.6} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button onClick={() => setOpen(o => !o)} className="refine-btn" aria-expanded={open} data-active={count > 0}>
        <SlidersHorizontal size={14} />
        Refine
        {count > 0 && <span className="refine-badge">{count}</span>}
      </button>

      {open && (
        <div className="refine-pop" role="dialog" aria-label="Refine results" style={{ maxHeight: maxH }}>
          <div className="refine-head">
            <span className="refine-title">Refine</span>
            <button onClick={onClearAll} className="refine-reset" disabled={count === 0}>Reset all</button>
          </div>
          <div className="refine-body">
            <section className="refine-sec">
              <div className="refine-sec-label">Match</div>
              {row('Fit only', fit, onFit, 'Claude called it a match')}
              {row('Passed filters', l1, onL1, 'Title, location, salary rules')}
              {row('Scored', l2, onL2, 'Has a Claude verdict')}
              {row('Remote only', remote, onRemote, 'Listed as remote')}
            </section>
            <section className="refine-sec">
              <div className="refine-sec-label">
                Source
                {sourceTypes.length > 0
                  ? <button className="refine-sec-clear" onClick={() => onToggleSource('')}>Any source</button>
                  : <span className="refine-sec-note">Any</span>}
              </div>
              <div className="refine-sub-label">Company boards</div>
              {chips(BOARD_SOURCES)}
              <div className="refine-sub-label">Aggregators</div>
              {chips(AGGREGATOR_SOURCES)}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
