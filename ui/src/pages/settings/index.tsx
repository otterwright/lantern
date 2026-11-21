import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, type Source, type HealthCheck } from '@/lib/api';
import { useToast, Segmented } from '@/components/ui';
import { SourcesPanel } from './SourcesPanel';
import { MatchingPanel } from './MatchingPanel';
import { PipelinePanel } from './PipelinePanel';
import { SystemPanel } from './SystemPanel';
import { errText } from './parts';
import './settings.css';

const TABS = [
  { id: 'sources', label: 'Sources', intro: 'Where Lantern looks. Company boards are read whole and cached between searches; aggregators are searched with your role every time.' },
  { id: 'matching', label: 'Matching', intro: 'How each role is judged once it is found: against your resume, in what order, and how your own decisions feed back in.' },
  { id: 'pipeline', label: 'Pipeline', intro: 'What happens between finding a job and showing it to you: what is too old, how much Claude grades, and how boards stay fresh.' },
  { id: 'system', label: 'System', intro: 'The engine underneath, and the one irreversible action on this page.' },
] as const;
type TabId = typeof TABS[number]['id'];

/**
 * Settings as one column: a title, the four categories on a segmented track,
 * then that category's settings in titled sheets. The category lives in the URL
 * (?tab=) so it survives reloads and can be linked from the command menu.
 */
export default function Settings() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab: TabId = TABS.some(t => t.id === raw) ? (raw as TabId) : 'sources';
  const current = TABS.find(t => t.id === tab)!;

  const [sources, setSources] = useState<Source[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(true);
  const loadSources = useCallback(async () => {
    try {
      const res = await api.sources.list();
      setSources(res.sources);
    } catch (e) {
      toast(`Could not load sources: ${errText(e)}`, 'error');
    } finally {
      setSourcesLoading(false);
    }
  }, [toast]);
  useEffect(() => { loadSources(); }, [loadSources]);

  // A one-off check, not a live subscription — enough to know, when the page
  // loads, whether "Clear all" should start out disabled.
  const [scanRunning, setScanRunning] = useState(false);
  useEffect(() => {
    api.runs.list(1).then(res => setScanRunning(Boolean(res.runs[0] && !res.runs[0].finished_at)))
      .catch(e => console.error('run status failed', e));
  }, []);

  const [health, setHealth] = useState<HealthCheck | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  // Mount does the cheap check (DB + a quick LLM ping); "Re-check" runs the deep
  // probe (also exercises the model), so page loads don't pay that cost.
  const checkHealth = useCallback(async (deep = false) => {
    setHealthLoading(true);
    try {
      const res = await api.health.check(deep);
      setHealth(res); setCheckedAt(Date.now());
      if (!res.ok) toast('Some health checks failed.', 'error');
    } catch (e) { toast(`Health check failed: ${errText(e)}`, 'error'); } finally { setHealthLoading(false); }
  }, [toast]);
  useEffect(() => { checkHealth(); }, [checkHealth]);

  // Masthead summary — the page's state in one line, before any section is read.
  const enabledCount = sources.filter(s => s.enabled === 1).length;
  const failing = health ? Object.values(health.checks).filter(c => !c.ok).length : 0;
  const llmVersion = (health?.checks?.llm?.detail ?? '').match(/\d+(?:\.\d+)+/)?.[0];

  return (
    <div className="settings-page">
      <header className="settings-head">
        <div aria-hidden className="settings-glow" />
        <div className="settings-title-row">
          <h1>Settings</h1>
          {health && (
            <button className="settings-health" data-ok={failing === 0 || undefined} onClick={() => setParams({ tab: 'system' })}>
              <span aria-hidden />
              {failing === 0 ? 'All checks passing' : `${failing} check${failing === 1 ? '' : 's'} failing`}
            </button>
          )}
        </div>
        <p className="settings-meta">
          {sourcesLoading ? <span className="text-faint">Loading…</span> : sources.length > 0
            ? <><span className="tnum" style={{ color: 'var(--text)' }}>{sources.length.toLocaleString()}</span> sources{enabledCount !== sources.length && <> · <span className="tnum">{enabledCount.toLocaleString()}</span> enabled</>}</>
            : <>Sources load on your first search</>}
          <span className="text-faint"> · Claude Code{llmVersion ? <span className="tnum"> {llmVersion}</span> : null}</span>
        </p>
      </header>

      <div className="settings-tabs">
        <Segmented
          items={TABS.map(t => ({ value: t.id, label: t.label }))}
          value={tab}
          onChange={id => setParams({ tab: id }, { replace: true })}
          label="Settings categories"
        />
      </div>

      <section key={tab} className="settings-panel" role="tabpanel" aria-label={current.label}>
        <p className="settings-lede">{current.intro}</p>
        {tab === 'sources' && <SourcesPanel sources={sources} loading={sourcesLoading} setSources={setSources} reload={loadSources} />}
        {tab === 'matching' && <MatchingPanel />}
        {tab === 'pipeline' && <PipelinePanel />}
        {tab === 'system' && (
          <SystemPanel health={health} loading={healthLoading} checkedAt={checkedAt} onRecheck={() => checkHealth(true)} scanRunning={scanRunning} onCleared={loadSources} />
        )}
      </section>
    </div>
  );
}
