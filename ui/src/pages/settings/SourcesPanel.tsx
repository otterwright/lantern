import { useState, useEffect, type Dispatch, type SetStateAction } from 'react';
import { Trash2, Plus, ChevronRight, Search as SearchIcon, X } from 'lucide-react';
import { api, type Source, type SourceType } from '@/lib/api';
import { Button, Input, Switch, useToast } from '@/components/ui';
import { Group, SettingRow, RowLoading, timeAgo, errText } from './parts';

const SOURCE_TYPE_OPTIONS: { value: SourceType; label: string; placeholder: string; aggregator?: boolean; gated?: boolean }[] = [
  { value: 'greenhouse', label: 'Greenhouse', placeholder: 'board-slug (e.g. stripe)' },
  { value: 'ashby', label: 'Ashby', placeholder: 'jobs.ashbyhq.com/company' },
  { value: 'lever', label: 'Lever', placeholder: 'jobs.lever.co/company' },
  { value: 'recruitee', label: 'Recruitee', placeholder: 'tenant slug (e.g. acme → acme.recruitee.com)' },
  { value: 'smartrecruiters', label: 'SmartRecruiters', placeholder: 'company slug (e.g. Bosch)' },
  { value: 'workable', label: 'Workable', placeholder: 'account slug (apply.workable.com/slug)' },
  { value: 'personio', label: 'Personio', placeholder: 'tenant slug (e.g. acme → acme.jobs.personio.de)' },
  { value: 'bamboohr', label: 'BambooHR', placeholder: 'subdomain slug (e.g. acme → acme.bamboohr.com)' },
  { value: 'workday', label: 'Workday', placeholder: 'tenant slug (e.g. salesforce)' },
  { value: 'breezy', label: 'Breezy HR', placeholder: 'subdomain slug (e.g. acme → acme.breezy.hr)' },
  { value: 'rippling', label: 'Rippling', placeholder: 'board slug (ats.rippling.com/slug)' },
  { value: 'teamtailor', label: 'Teamtailor', placeholder: 'subdomain slug (e.g. acme → acme.teamtailor.com)' },
  { value: 'remoteok', label: 'RemoteOK', placeholder: 'global — searched by your role keyword', aggregator: true },
  { value: 'arbeitnow', label: 'Arbeitnow', placeholder: 'global — searched by your role keyword', aggregator: true },
  { value: 'himalayas', label: 'Himalayas', placeholder: 'global — searched by your role keyword', aggregator: true },
  { value: 'linkedin', label: 'LinkedIn', placeholder: 'global — searched by your role keyword', aggregator: true, gated: true },
  { value: 'google_jobs', label: 'Google Jobs', placeholder: 'global — needs a SerpAPI key', aggregator: true },
  { value: 'jobicy', label: 'Jobicy', placeholder: 'global — searched by your role keyword', aggregator: true },
  { value: 'themuse', label: 'The Muse', placeholder: 'global — searched by your role keyword', aggregator: true },
  { value: 'smartrecruiters_search', label: 'SmartRecruiters (search)', placeholder: 'global — searched by your role keyword', aggregator: true },
  { value: 'workingnomads', label: 'Working Nomads', placeholder: 'global — searched by your role keyword', aggregator: true },
  { value: 'weworkremotely', label: 'We Work Remotely', placeholder: 'global — searched by your role keyword', aggregator: true },
  { value: 'remotive', label: 'Remotive', placeholder: 'global — searched by your role keyword (max ~4 calls/day)', aggregator: true },
  { value: 'jobtech', label: 'JobTech (Sweden)', placeholder: 'global — Swedish postings, searched by your role keyword', aggregator: true },
  { value: 'hn_hiring', label: 'HN Who is hiring', placeholder: 'global — monthly Hacker News threads, matched on your role keyword', aggregator: true },
];

const AGGREGATOR_TYPES = new Set<SourceType>(SOURCE_TYPE_OPTIONS.filter(o => o.aggregator).map(o => o.value));
const GATED_TYPES = new Set<SourceType>(SOURCE_TYPE_OPTIONS.filter(o => o.gated).map(o => o.value));

type Health = 'never' | 'ok' | 'limited' | 'failed';
const healthOf = (s: Source): Health =>
  !s.last_scan_at ? 'never' : s.last_status === 'ok' ? 'ok' : s.last_status === 'rate-limited' ? 'limited' : 'failed';

export function SourcesPanel({ sources, loading, setSources, reload }: {
  sources: Source[]; loading: boolean; setSources: Dispatch<SetStateAction<Source[]>>; reload: () => void;
}) {
  const toast = useToast();

  const handleToggle = async (source: Source) => {
    const newEnabled = source.enabled !== 1;
    setSources(prev => prev.map(s => s.id === source.id ? { ...s, enabled: newEnabled ? 1 : 0 } : s));
    try {
      await api.sources.update(source.id, { enabled: newEnabled });
    } catch (e) {
      toast(`Could not update ${source.display_name}: ${errText(e)}`, 'error');
      reload();
    }
  };

  // Seeded sources (or ones with saved jobs) can't be hard-deleted — the server
  // turns them off instead and says so. Wait for the real outcome rather than
  // optimistically removing the row: a "disabled" response must leave the row
  // in place (just switched off), and a genuine error must surface.
  const handleDelete = async (id: number) => {
    try {
      const res = await api.sources.delete(id);
      if ('deleted' in res && res.deleted) {
        setSources(prev => prev.filter(s => s.id !== id));
      } else if ('disabled' in res && res.disabled) {
        setSources(prev => prev.map(s => s.id === id ? { ...s, enabled: 0 } : s));
        toast(res.msg, 'info');
      }
    } catch (e) {
      toast(`Could not delete: ${errText(e)}`, 'error');
    }
  };

  if (loading) return <RowLoading />;
  if (sources.length === 0) {
    return <p className="settings-note">The default set of boards and aggregators loads on your first search.</p>;
  }

  const boards = sources.filter(s => !AGGREGATOR_TYPES.has(s.type));
  const aggregators = sources.filter(s => AGGREGATOR_TYPES.has(s.type));
  const rowProps = { onToggle: handleToggle, onDelete: handleDelete };

  return (
    <>
      <CompanyBoards boards={boards} reload={reload} {...rowProps} />
      {aggregators.length > 0 && (
        <Group
          title="Aggregators"
          desc={<>
            <span className="tnum">{aggregators.length}</span> job sites searched with your role on every search
            {countOn(aggregators) !== aggregators.length && <> · <span className="tnum">{countOn(aggregators)}</span> on</>}
          </>}
        >
          {aggregators.map(s => <SourceRow key={s.id} source={s} {...rowProps} />)}
        </Group>
      )}
    </>
  );
}

const countOn = (list: Source[]) => list.filter(s => s.enabled === 1).length;

function CompanyBoards({ boards, reload, onToggle, onDelete }: {
  boards: Source[]; reload: () => void; onToggle: (s: Source) => void; onDelete: (id: number) => void;
}) {
  const [filter, setFilter] = useState('');
  const [expanded, setExpanded] = useState<Set<SourceType>>(new Set());

  const f = filter.trim().toLowerCase();
  const filtered = f ? boards.filter(s => s.display_name.toLowerCase().includes(f) || s.identifier.toLowerCase().includes(f) || s.type.includes(f)) : boards;
  const vendors = SOURCE_TYPE_OPTIONS
    .filter(o => !o.aggregator)
    .map(o => ({ ...o, sources: filtered.filter(s => s.type === o.value) }))
    .filter(g => g.sources.length > 0);
  const vendorCount = new Set(boards.map(s => s.type)).size;

  const toggleOpen = (t: SourceType) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(t)) next.delete(t); else next.add(t);
    return next;
  });

  return (
    <Group
      title="Company boards"
      desc={<>
        <span className="tnum">{boards.length.toLocaleString()}</span> boards from <span className="tnum">{vendorCount}</span> applicant-tracking vendors
        {countOn(boards) !== boards.length && <> · <span className="tnum">{countOn(boards).toLocaleString()}</span> on</>}
      </>}
      action={
        <div className="roster-filter">
          <SearchIcon size={13} />
          <input placeholder="Filter boards" value={filter} onChange={e => setFilter(e.target.value)} aria-label="Filter boards" />
          {filter && <button onClick={() => setFilter('')} aria-label="Clear filter"><X size={12} /></button>}
        </div>
      }
    >
      <DiscoveredBoards />
      {vendors.length === 0 ? (
        <div className="roster-empty">No boards match “{filter}”.</div>
      ) : vendors.map(v => (
        <VendorGroup
          key={v.value} label={v.label} sources={v.sources}
          // a filter opens every vendor it matched; otherwise each opens on demand
          open={!!f || expanded.has(v.value)} onToggleOpen={() => toggleOpen(v.value)}
          onToggle={onToggle} onDelete={onDelete}
        />
      ))}
      <AddSourceForm onAdded={reload} />
    </Group>
  );
}

/**
 * One vendor's boards behind a single line: how many, how many on, and only the
 * problems (rate limits, failures) — healthy is the silent default. Opening it
 * lists the boards; the header sticks while you scroll a long vendor.
 */
function VendorGroup({ label, sources, open, onToggleOpen, onToggle, onDelete }: {
  label: string; sources: Source[]; open: boolean; onToggleOpen: () => void;
  onToggle: (s: Source) => void; onDelete: (id: number) => void;
}) {
  const on = countOn(sources);
  const limited = sources.filter(s => healthOf(s) === 'limited').length;
  const failed = sources.filter(s => healthOf(s) === 'failed').length;
  return (
    <div className="vgroup" data-open={open || undefined}>
      <button className="vgroup-head" aria-expanded={open} onClick={onToggleOpen}>
        <ChevronRight size={14} className="vgroup-chev" />
        <span className="vgroup-name">{label}</span>
        <span className="vgroup-count tnum">{sources.length.toLocaleString()}</span>
        <span className="vgroup-meta tnum">
          {failed > 0 && <span data-tone="danger"><i aria-hidden />{failed} failing</span>}
          {limited > 0 && <span data-tone="warning"><i aria-hidden />{limited} rate-limited</span>}
          {on !== sources.length && <span>{on} of {sources.length} on</span>}
        </span>
      </button>
      {open && (
        <div className="vgroup-rows">
          {sources.map(s => <SourceRow key={s.id} source={s} showId onToggle={onToggle} onDelete={onDelete} />)}
        </div>
      )}
    </div>
  );
}

// Boards found by scripts/discover-boards.ts: live-checked but unreviewed, and far
// too many to list, so they are one bulk switch rather than roster rows.
function DiscoveredBoards() {
  const toast = useToast();
  const [counts, setCounts] = useState<{ total: number; enabled: number } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.sources.discovered().then(setCounts).catch(e => console.error('discovered boards count failed', e));
  }, []);

  if (!counts || counts.total === 0) return null;
  const on = counts.enabled > 0;

  const toggle = async () => {
    setBusy(true);
    try {
      const res = await api.sources.setDiscovered(!on);
      setCounts({ total: res.total, enabled: res.enabled });
    } catch (e) {
      toast(`Could not update discovered boards: ${errText(e)}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingRow
      title={<>Include <span className="tnum">{counts.total.toLocaleString()}</span> discovered boards</>}
      desc={<>
        Found by public web crawls and checked live, but not hand-picked. The first background pass takes one to
        three hours; after that the refresher re-fetches them every cache window, which is a lot of traffic.
      </>}
      control={<Switch checked={on} onChange={toggle} busy={busy} label="Include discovered boards" />}
    />
  );
}

const HEALTH_TEXT: Record<Health, string> = { never: 'Not fetched yet', ok: 'Fetched', limited: 'Rate-limited', failed: 'Failing' };

function SourceRow({ source, showId, onToggle, onDelete }: {
  source: Source; showId?: boolean; onToggle: (s: Source) => void; onDelete: (id: number) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const enabled = source.enabled === 1;
  const health = healthOf(source);
  const title = health === 'limited'
    ? `Rate-limited by the host ${timeAgo(source.last_scan_at)}, will retry in the background`
    : health === 'failed'
    ? `Last attempt ${timeAgo(source.last_scan_at)} failed${source.last_error ? `: ${source.last_error}` : ''}`
    : undefined;

  return (
    <div className="source-row" data-off={!enabled || undefined}>
      <div className="source-text">
        <div className="source-name">
          {source.display_name}
          {GATED_TYPES.has(source.type) && (
            <span title="Unofficial endpoint: gray-area, rate-limited, may break" className="source-gated">unofficial</span>
          )}
        </div>
        {showId && <div className="source-id">{source.identifier}</div>}
      </div>
      {/* The age is of the last good fetch (what the board cache serves), the dot is the latest attempt. */}
      <div className="source-health" data-health={health} title={title}>
        <i aria-hidden />
        {source.last_ok_fetch_at
          ? <span className="tnum">{timeAgo(source.last_ok_fetch_at)}</span>
          : <span>{HEALTH_TEXT[health]}</span>}
      </div>
      <div className="source-del">
        {confirming ? (
          <>
            <button onClick={() => { onDelete(source.id); setConfirming(false); }} className="source-confirm" data-danger>Delete</button>
            <button onClick={() => setConfirming(false)} className="source-confirm">Keep</button>
          </>
        ) : (
          <button onClick={() => setConfirming(true)} aria-label={`Delete ${source.display_name}`} className="source-trash"><Trash2 size={13} /></button>
        )}
      </div>
      <Switch checked={enabled} onChange={() => onToggle(source)} label={`Include ${source.display_name}`} />
    </div>
  );
}

function AddSourceForm({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<SourceType>('greenhouse');
  const [identifier, setIdentifier] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [wdSite, setWdSite] = useState('');
  const [wdDc, setWdDc] = useState('');
  const [serpKey, setSerpKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const typeOpt = SOURCE_TYPE_OPTIONS.find(t => t.value === type)!;
  const isWorkday = type === 'workday';
  const isGoogleJobs = type === 'google_jobs';
  const isGated = GATED_TYPES.has(type);
  const workdayReady = !isWorkday || (wdSite.trim() && wdDc.trim());
  const googleReady = !isGoogleJobs || !!serpKey.trim();
  const ready = identifier.trim() && displayName.trim() && workdayReady && googleReady;
  const close = () => { setOpen(false); setError(null); };

  const handleAdd = async () => {
    if (!ready) return;
    setSaving(true); setError(null);
    try {
      const config_json = isWorkday
        ? { site: wdSite.trim(), dc: wdDc.trim() }
        : isGoogleJobs
          ? { apiKey: serpKey.trim() }
          : undefined;
      await api.sources.create({ type, identifier: identifier.trim(), display_name: displayName.trim(), config_json });
      setIdentifier(''); setDisplayName(''); setWdSite(''); setWdDc(''); setSerpKey(''); setOpen(false); onAdded();
    } catch (e) { setError(errText(e)); } finally { setSaving(false); }
  };

  if (!open) {
    return (
      <div className="sheet-foot">
        <button className="sheet-foot-btn" onClick={() => setOpen(true)}><Plus size={14} /> Add a source by hand</button>
      </div>
    );
  }

  return (
    <div className="add-source">
      <div className="add-source-head">
        <h3 className="srow-title">Add a source</h3>
        <button className="add-close" onClick={close} aria-label="Close"><X size={14} /></button>
      </div>
      <div className="add-grid">
        <label>
          <span>Type</span>
          <select value={type} onChange={e => setType(e.target.value as SourceType)} className="field">
            <optgroup label="Company boards">
              {SOURCE_TYPE_OPTIONS.filter(o => !o.aggregator).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </optgroup>
            <optgroup label="Aggregators">
              {SOURCE_TYPE_OPTIONS.filter(o => o.aggregator).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </optgroup>
          </select>
        </label>
        <label>
          <span>Identifier</span>
          <Input value={identifier} onChange={e => setIdentifier(e.target.value)} placeholder={typeOpt.placeholder} />
        </label>
        <label>
          <span>Display name</span>
          <Input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Company name" onKeyDown={e => e.key === 'Enter' && handleAdd()} />
        </label>
      </div>
      {isWorkday && (
        <>
          <div className="add-grid" style={{ gridTemplateColumns: '1fr 150px' }}>
            <label>
              <span>Career-site name</span>
              <Input value={wdSite} onChange={e => setWdSite(e.target.value)} placeholder="e.g. External_Career_Site" />
            </label>
            <label>
              <span>Datacenter</span>
              <Input value={wdDc} onChange={e => setWdDc(e.target.value)} placeholder="e.g. wd5" />
            </label>
          </div>
          <p className="add-note">
            From the careers URL <code>{'{tenant}.{dc}.myworkdayjobs.com/{site}'}</code>, e.g. <code>salesforce</code> · <code>wd12</code> · <code>External_Career_Site</code>.
          </p>
        </>
      )}
      {isGoogleJobs && (
        <>
          <div className="add-grid" style={{ gridTemplateColumns: '1fr' }}>
            <label>
              <span>SerpAPI key</span>
              <Input type="password" value={serpKey} onChange={e => setSerpKey(e.target.value)} placeholder="your SerpAPI api_key" />
            </label>
          </div>
          <p className="add-note">Google's deduplicated cross-board job index. Your key is stored locally and sent only to serpapi.com.</p>
        </>
      )}
      {isGated && (
        <p className="add-note" style={{ color: 'var(--warning)' }}>
          Unofficial endpoint: gray-area, aggressively rate-limited, and may break without notice. Use lightly for personal search.
        </p>
      )}
      {error && <p className="add-note" style={{ color: 'var(--danger)' }}>{error}</p>}
      <div className="add-actions">
        <Button size="sm" variant="ghost" onClick={close}>Cancel</Button>
        <Button size="sm" onClick={handleAdd} loading={saving} disabled={!ready}><Plus size={13} /> Add source</Button>
      </div>
    </div>
  );
}
