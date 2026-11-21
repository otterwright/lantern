// Shared test harness. Chdirs into a scratch cwd OUTSIDE the repo (client.ts /
// seeds.ts / attachments.ts all resolve data/ and src/config/*.yml from
// process.cwd(), and tests must never touch the real data/), then imports
// server.ts so every route/runner module underneath runs against one real
// (migrated) :memory: db and one fake LLM — mocked in src/test-setup.ts — without
// a real database, the claude CLI, or a network listener.
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { inject } from 'vitest';
import { memDb, llmCalls, setLlm, resetLlm } from './test-fakes';

export { memDb, llmCalls, setLlm };
export type { LlmReq } from './test-fakes';

export const REPO = join(import.meta.dirname, '..').replace(/\\/g, '/');
// Per process: Vitest runs test files in parallel worker processes.
export const WORK = join(inject('testRoot'), String(process.pid)).replace(/\\/g, '/');

rmSync(WORK, { recursive: true, force: true });
mkdirSync(join(WORK, 'src/config'), { recursive: true });
writeFileSync(join(WORK, 'src/config/seed-sources.yml'), 'sources: []\n');
writeFileSync(join(WORK, 'src/config/search.yml'), readFileSync(join(REPO, 'src/config/search.yml'), 'utf-8'));
mkdirSync(join(WORK, 'ui/dist'), { recursive: true });
writeFileSync(join(WORK, 'ui/dist/index.html'), '<!doctype html><html><body>SPA-INDEX</body></html>');
process.chdir(WORK);

export const server = (await import(`${REPO}/src/server.ts`)).default as {
  fetch: (r: Request) => Promise<Response>;
};

const llmMod = await import(`${REPO}/src/llm/index.ts`);
if (!(llmMod.llm as { __isMock?: boolean }).__isMock) throw new Error('LLM MOCK NOT APPLIED — aborting');
if (existsSync(join(WORK, 'data'))) throw new Error('DB MOCK NOT APPLIED (real client.ts ran) — aborting');
const dbMod = await import(`${REPO}/src/db/client.ts`);
if (dbMod.db !== memDb) throw new Error('db mock identity mismatch');

export const { bus } = await import(`${REPO}/src/runner/progress.ts`);
export const scan = await import(`${REPO}/src/runner/scan.ts`);
export const { runs } = await import(`${REPO}/src/routes/runs.ts`);

export const NL_OK = {
  title: { positive: ['engineer'], negative: [] },
  location: { remote_required: false, allowed: [], block: [], always_allow: [] },
  seniority: { allowed: [] },
  experience_years: null,
  salary_min_usd: null,
  salary_currency: 'USD',
  exclude_companies: [],
  employment_types: [],
  visa_sponsorship_required: false,
  skills: { must: [], nice: [] },
  industries: { include: [], exclude: [] },
  company_stage: [],
};

/** Hits the full server (with the Host/Origin middleware, 404 catch-all, etc). A
 * real HTTP client always sends a Host header (added by the transport layer); a
 * synthetic Request built in-process does not, so this defaults one to a
 * legitimate value — tests that exercise the Host allowlist override it
 * explicitly. */
export function req(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has('host')) headers.set('host', 'localhost:3000');
  return server.fetch(new Request(`http://localhost:3000${path}`, { ...init, headers }));
}

/** Embeddings default to enabled, which would otherwise load the real local ML
 * model — every test that reaches runFull/runL2Pass must turn it off first. */
export function seedEmbeddingsOff(): void {
  memDb.run(
    `INSERT OR REPLACE INTO settings (key, value_json, updated_at) VALUES ('embeddings', '{"enabled":false}', 0)`
  );
}

export function insertSource(overrides: Record<string, unknown> = {}): number {
  const cols = {
    type: 'greenhouse',
    identifier: `acme${Math.random().toString(36).slice(2)}`,
    display_name: 'Acme',
    enabled: 0,
    created_at: 0,
    ...overrides,
  };
  const keys = Object.keys(cols);
  return memDb
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- column set is dynamic per call site
    .query<{ id: number }, any[]>(
      `INSERT INTO sources (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')}) RETURNING id`
    )
    .get(...Object.values(cols))!.id;
}

export function insertJob(sourceId: number, extra: Record<string, unknown> = {}): number {
  const n = Math.random().toString(36).slice(2);
  const cols = {
    source_id: sourceId,
    url: `https://x.test/${n}`,
    title: 'Engineer',
    company: 'Acme',
    company_norm: 'acme',
    content_hash: n,
    first_seen: 1,
    last_seen: 1,
    ...extra,
  };
  const keys = Object.keys(cols);
  return memDb
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- column set is dynamic per call site
    .query<{ id: number }, any[]>(
      `INSERT INTO jobs (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')}) RETURNING id`
    )
    .get(...Object.values(cols))!.id;
}

/**
 * Full reset, called from every consuming test file's `beforeEach`. The db is
 * shared by every test in a file, so every mutable table needs clearing between
 * tests, not just runs/jobs/locks (a leftover enabled `sources` row, for
 * instance, used to make a later scan test issue a real HTTP fetch).
 */
export function resetDb(): void {
  memDb.run('DELETE FROM scan_locks');
  memDb.run('DELETE FROM jobs'); // cascades attachments (ON DELETE CASCADE)
  memDb.run('DELETE FROM sources');
  memDb.run('DELETE FROM runs');
  memDb.run('DELETE FROM criteria');
  memDb.run('DELETE FROM settings');
  resetLlm();
}
