// One scratch root per test run, removed at teardown. Each worker process makes
// its own cwd under it (see test-harness.ts) — worker exit hooks don't run reliably.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    testRoot: string;
  }
}

export default function setup(project: TestProject): () => void {
  const root = mkdtempSync(join(tmpdir(), 'lantern-test-'));
  project.provide('testRoot', root);
  return () => rmSync(root, { recursive: true, force: true });
}
