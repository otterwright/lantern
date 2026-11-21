// The in-memory db and fake LLM that src/test-setup.ts mocks db/client and
// llm/index with. Kept apart from test-harness.ts so the mock factories can load
// them without importing the server (which itself imports the mocked modules).
import { Database } from './db/sqlite';
import { runMigrations } from './db/migrate';

export const memDb = new Database(':memory:');
memDb.run('PRAGMA foreign_keys = ON');
runMigrations(memDb);

export type LlmReq = { task: string; prompt: string; timeoutMs?: number };
type LlmImpl = (req: LlmReq, schema: { parse: (x: unknown) => unknown }) => Promise<unknown>;

export const llmCalls: LlmReq[] = [];
const NOT_CONFIGURED: LlmImpl = async () => {
  throw new Error('llm not configured');
};
let llmImpl: LlmImpl = NOT_CONFIGURED;

export function setLlm(fn: LlmImpl): void {
  llmImpl = fn;
}

export function resetLlm(): void {
  llmCalls.length = 0;
  llmImpl = NOT_CONFIGURED;
}

export const fakeLlm = {
  __isMock: true,
  async call(req: LlmReq, schema: { parse: (x: unknown) => unknown }) {
    llmCalls.push(req);
    return schema.parse(await llmImpl(req, schema));
  },
  async healthcheck() {
    return { ok: true, detail: 'mock' };
  },
  get providerName() {
    return 'mock';
  },
};
