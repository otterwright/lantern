import { useState } from 'react';
import { CheckCircle2, RefreshCw } from 'lucide-react';
import { api, type HealthCheck } from '@/lib/api';
import { Button, useToast } from '@/components/ui';
import { Group, SettingRow, RowLoading, errText } from './parts';

const HEALTH_LABELS: Record<string, string> = { db: 'Database', llm: 'Claude Code' };
const HEALTH_ROLE: Record<string, string> = {
  db: 'Jobs, scores, settings and attachments, in data/data.db.',
  llm: 'Scores matches and turns your searches into criteria.',
};
const HEALTH_FIX: Record<string, string> = {
  db: 'Check that data/ is writable.',
  llm: 'Ensure the claude CLI is installed and logged in.',
};

// A passing check reads as its version when it reports one ("claude-code: 2.1.220 (Claude Code)" → "v2.1.220").
function okLabel(detail?: string): string {
  const version = detail?.match(/\d+(?:\.\d+)+/)?.[0];
  return version ? `v${version}` : 'OK';
}

export function SystemPanel({ health, loading, checkedAt, onRecheck, scanRunning, onCleared }: {
  health: HealthCheck | null; loading: boolean; checkedAt: number | null; onRecheck: () => void;
  scanRunning: boolean; onCleared: () => void;
}) {
  const entries = health ? Object.entries(health.checks) : [];
  const ordered = ['llm', 'db'].map(k => {
    const found = entries.find(([name]) => name === k);
    return found ?? [k, { ok: false, detail: 'not checked' }] as [string, { ok: boolean; detail?: string }];
  }).concat(entries.filter(([name]) => !['llm', 'db'].includes(name)));

  return (
    <>
      <Group
        title="Health"
        desc={checkedAt && !loading ? `Checked at ${new Date(checkedAt).toLocaleTimeString()}. Re-check also exercises the model.` : 'Checked when this page opens. Re-check also exercises the model.'}
        action={<Button variant="outline" size="sm" onClick={onRecheck} loading={loading}><RefreshCw size={12} /> Re-check</Button>}
      >
        {loading && health === null ? <RowLoading /> : ordered.map(([name, status]) => (
          <SettingRow
            key={name}
            title={HEALTH_LABELS[name] ?? name}
            desc={status.ok ? HEALTH_ROLE[name] : (
              <>
                {HEALTH_FIX[name]}
                {name === 'llm' && <> <a className="settings-link" href="https://claude.com/claude-code" target="_blank" rel="noreferrer">Install Claude Code</a></>}
              </>
            )}
            control={
              <span className="health-state" data-ok={status.ok || undefined} title={status.detail}>
                <i aria-hidden />
                {status.ok ? okLabel(status.detail) : (status.detail?.slice(0, 40) ?? 'Failing')}
              </span>
            }
          />
        ))}
      </Group>
      <Group title="Danger zone" tone="danger">
        <ClearData scanRunning={scanRunning} onCleared={onCleared} />
      </Group>
    </>
  );
}

function ClearData({ scanRunning, onCleared }: { scanRunning: boolean; onCleared: () => void }) {
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [done, setDone] = useState(false);

  const handleClear = async () => {
    setClearing(true);
    try {
      await api.admin.clearJobs();
      setDone(true);
      setConfirming(false);
      onCleared();
    } catch (e) {
      toast(`Could not clear: ${errText(e)}`, 'error');
    } finally {
      setClearing(false);
    }
  };

  return (
    <SettingRow
      title="Clear all scanned data"
      desc="Deletes every job, score, run and attachment. Your boards and settings stay. This can't be undone."
      control={done ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '12.5px', color: 'var(--success)' }}><CheckCircle2 size={13} /> Cleared</span>
      ) : confirming ? (
        <div className="srow-controls">
          <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>Cancel</Button>
          <Button variant="danger" size="sm" onClick={handleClear} loading={clearing}>Yes, clear everything</Button>
        </div>
      ) : (
        <Button variant="danger" size="sm" onClick={() => setConfirming(true)} disabled={scanRunning} title={scanRunning ? 'A search is running. Try again once it finishes.' : undefined}>
          Clear all jobs
        </Button>
      )}
    />
  );
}
