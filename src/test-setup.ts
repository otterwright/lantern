// Vitest setupFiles entry: every test file gets db/client and llm/index replaced
// before anything imports them, so no test can open the real data/data.db or
// spawn the claude CLI. Vitest isolates modules per test file, so these mocks
// can't leak between files.
import { vi } from 'vitest';

vi.mock('./db/client', async () => ({ db: (await import('./test-fakes')).memDb }));
vi.mock('./llm/index', async () => ({ llm: (await import('./test-fakes')).fakeLlm, resetLlmCache() {} }));
