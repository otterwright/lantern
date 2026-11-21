// A stand-in for the real `claude` CLI, put on PATH as "claude" by
// claude-code.test.ts (through a shell shim) so ClaudeCodeProvider's
// spawn('claude', ...) resolves to this instead of a real subprocess. Never
// invoked outside tests. Plain JS so any supported Node runs it without a loader.
//
// Every invocation appends one JSON line to FAKE_OUT (argv + stdin length) so
// tests can assert exactly how many times — and with what — the CLI was
// spawned. Behavior is selected via FAKE_MODE:
//   ok    - a normal successful structured_output response.
//   sleep - hangs for 10 minutes (simulates a stuck call for timeout tests).
import { appendFileSync } from 'node:fs';
import { text } from 'node:stream/consumers';
import { setTimeout as sleep } from 'node:timers/promises';

const stdin = await text(process.stdin);

const out = process.env.FAKE_OUT;
if (out) {
  appendFileSync(out, JSON.stringify({ argv: process.argv.slice(2), stdinLen: stdin.length }) + '\n');
}

const mode = process.env.FAKE_MODE ?? 'ok';
if (mode === 'ok') {
  console.log(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, structured_output: { ok: true } }));
} else if (mode === 'sleep') {
  await sleep(600_000);
}
