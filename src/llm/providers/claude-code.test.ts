import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { z } from 'zod';
import { LlmError } from '../provider';
import { ClaudeCodeProvider } from './claude-code';

// Puts a shell shim named "claude" on PATH for the duration of this file, which
// runs fixtures/fake-claude-cli.mjs on this Node, so ClaudeCodeProvider's
// spawn('claude', ...) resolves to it instead of any real CLI.
// LIMIT: POSIX only — Node can't spawn a .cmd shim without a shell, so this file
// is skipped on Windows until the fake is built as a real .exe.
let fakeBinDir: string;
let originalPath: string | undefined;

beforeAll(() => {
  fakeBinDir = mkdtempSync(join(tmpdir(), 'lantern-fake-claude-'));
  const fakeCli = join(fakeBinDir, 'claude');
  const fixture = join(import.meta.dirname, 'fixtures', 'fake-claude-cli.mjs');
  writeFileSync(fakeCli, `#!/bin/sh\nexec "${process.execPath}" "${fixture}" "$@"\n`, { mode: 0o755 });

  originalPath = process.env.PATH;
  process.env.PATH = `${fakeBinDir}${delimiter}${originalPath ?? ''}`;

  // Refuse to run any test below if "claude" doesn't resolve to our fake —
  // never let this suite silently fall through to a real CLI subprocess.
  const resolved = process.env.PATH.split(delimiter).map(d => join(d, 'claude')).find(p => existsSync(p));
  if (resolved !== fakeCli) {
    throw new Error(`'claude' did not resolve to the fake CLI fixture (got: ${resolved})`);
  }
});

afterAll(() => {
  process.env.PATH = originalPath;
  delete process.env.FAKE_MODE;
  delete process.env.FAKE_OUT;
  rmSync(fakeBinDir, { recursive: true, force: true });
});

let outFile: string;
beforeEach(() => {
  outFile = join(fakeBinDir, `out-${Math.random().toString(36).slice(2)}.jsonl`);
  process.env.FAKE_OUT = outFile;
});

function readRecords(): Array<{ argv: string[]; stdinLen: number }> {
  if (!existsSync(outFile)) return [];
  return readFileSync(outFile, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

const OkShape = z.object({ ok: z.boolean() });

describe.skipIf(process.platform === 'win32')('ClaudeCodeProvider timeout', () => {
  test('a timed-out call throws once, without a STRICT_SUFFIX retry', async () => {
    process.env.FAKE_MODE = 'sleep';
    const provider = new ClaudeCodeProvider();

    let caught: unknown;
    try {
      // Long enough for the fake CLI's Node to boot and record its spawn even under
      // full-suite load; at 300ms it was killed first and the count read 0.
      await provider.call({ task: 'verdict', prompt: 'hi', timeoutMs: 3_000 }, OkShape);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(LlmError);
    expect((caught as LlmError).kind).toBe('transient');
    expect((caught as LlmError).message).toContain('timed out');
    // Exactly one spawn — the bug this guards against retried the whole call
    // (a second spawn) after a timeout, doubling the cost of an already-stuck
    // call for no benefit.
    expect(readRecords()).toHaveLength(1);
  }, 15_000);
});

describe.skipIf(process.platform === 'win32')('ClaudeCodeProvider healthcheck', () => {
  test('without deep, only checks --version — no model call', async () => {
    process.env.FAKE_MODE = 'ok';
    const provider = new ClaudeCodeProvider();

    const result = await provider.healthcheck();

    expect(result.ok).toBe(true);
    const records = readRecords();
    expect(records).toHaveLength(1);
    expect(records[0]!.argv).toContain('--version');
  });

  test('with deep, also runs the model probe', async () => {
    process.env.FAKE_MODE = 'ok';
    const provider = new ClaudeCodeProvider();

    const result = await provider.healthcheck({ deep: true });

    expect(result.ok).toBe(true);
    const records = readRecords();
    expect(records).toHaveLength(2);
    expect(records[0]!.argv).toContain('--version');
    expect(records[1]!.argv).toContain('--json-schema');
  });
});
