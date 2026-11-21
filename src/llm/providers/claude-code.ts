import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { extractFirstJsonBlock, stripCodeFence } from '../extract-json';
import { classifyErrorMessage, LlmError } from '../provider';
import type { HealthcheckOptions, HealthcheckResult, LlmProvider, LlmRequest, LlmTask } from '../provider';
import { zodToProviderSchema } from '../zod-to-schema';

// CLI aliases, not pinned ids: the installed `claude` CLI resolves `sonnet` to
// the newest Sonnet it supports, so a CLI update picks up a new model with no
// code change. Pin a full id via the Settings per-task override if needed.
const TASK_MODELS: Record<LlmTask, string> = {
  verdict: 'sonnet',
  // nl-filter drives the entire search — getting the criteria wrong wastes the
  // whole scan — so it runs on sonnet despite being a single short call.
  'nl-filter': 'sonnet',
};

const STRICT_SUFFIX =
  '\n\nIMPORTANT: Respond with ONLY the JSON object that conforms to the provided schema. No prose, no markdown, no code fences.';

// Replaces Claude Code's heavy agentic default system prompt. The task prompt
// already carries full instructions and `--json-schema` constrains the output,
// so a minimal generic system prompt is enough — and roughly halves per-call
// token cost versus the default.
const ISOLATED_SYSTEM_PROMPT =
  'You convert the user message into a single JSON object that conforms to the provided JSON schema. Output only that JSON object — no prose, no markdown, no code fences.';

const EMPTY_MCP_CONFIG = '{"mcpServers":{}}';

type SpawnFailureReason = 'timeout' | 'process' | 'invalid-output';

// Distinguishes WHY a spawnClaude() attempt failed so call() can decide whether
// a STRICT_SUFFIX retry is worth it. Only 'invalid-output' (the process exited
// 0 but stdout wasn't parseable JSON, or failed the schema) is worth retrying —
// a timeout or a non-zero exit (auth failure, usage limit, missing CLI, ...)
// will fail the same way again, so retrying just doubles the cost of an
// already-stuck or already-erroring call.
class SpawnFailure extends Error {
  constructor(message: string, readonly reason: SpawnFailureReason) {
    super(message);
    this.name = 'SpawnFailure';
  }
}

// Run claude from a throwaway directory so no project-level CLAUDE.md is
// auto-discovered into the context. Created once per process.
let isolatedCwdMemo: string | null = null;
function isolatedCwd(): string {
  if (!isolatedCwdMemo) isolatedCwdMemo = mkdtempSync(join(tmpdir(), 'lantern-claude-'));
  return isolatedCwdMemo;
}

interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}

/**
 * Runs the `claude` CLI to completion, optionally piping `input` to stdin and
 * SIGTERMing it after `timeoutMs`. Rejects only when the process can't be
 * started (e.g. ENOENT); a non-zero exit or a timeout resolves.
 */
function runCli(
  args: string[],
  opts: { input?: string; cwd?: string; env: NodeJS.ProcessEnv; timeoutMs?: number },
): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    // `env` is passed explicitly so the bare "claude" resolves against the live
    // PATH — a CLI installed (or a PATH change) after the server started is found.
    const proc = spawn('claude', args, { cwd: opts.cwd, env: opts.env, stdio: 'pipe' });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    proc.stdout.setEncoding('utf8').on('data', (d: string) => (stdout += d));
    proc.stderr.setEncoding('utf8').on('data', (d: string) => (stderr += d));
    // A CLI that exits before reading its stdin makes the write EPIPE; the exit
    // code already reports that failure.
    proc.stdin.on('error', () => {});
    const timer = opts.timeoutMs === undefined ? undefined : setTimeout(() => {
      timedOut = true;
      proc.kill('SIGTERM');
    }, opts.timeoutMs);
    proc.once('error', err => {
      clearTimeout(timer);
      reject(err);
    });
    proc.once('close', exitCode => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode, timedOut });
    });
    proc.stdin.end(opts.input ?? '');
  });
}

// Walk the wrapper Claude Code emits and return the raw structured payload.
// `--json-schema` is supposed to populate `structured_output`, but versions
// vary: some emit `{ result: "<json-as-string>" }`, others embed the JSON in
// prose inside `result`. Try each shape in order.
function unwrapClaudeResponse(stdout: string): unknown {
  let wrapper: Record<string, unknown>;
  try {
    wrapper = JSON.parse(stdout);
  } catch (err) {
    const preview = stdout.slice(0, 200).replace(/\s+/g, ' ');
    throw new Error(
      `claude response was not parseable JSON (preview: "${preview}"): ${(err as Error).message}`,
    );
  }

  if ('structured_output' in wrapper && wrapper.structured_output !== undefined) {
    return wrapper.structured_output;
  }

  // `result` is sometimes a JSON-as-string, sometimes prose with JSON inside.
  if (typeof wrapper.result === 'string') {
    const cleaned = stripCodeFence(wrapper.result);
    try {
      return JSON.parse(cleaned);
    } catch {
      const block = extractFirstJsonBlock(cleaned);
      if (block) {
        try { return JSON.parse(block); } catch { /* fall through */ }
      }
    }
  }

  return wrapper;
}

async function spawnClaude<T>(
  model: string,
  prompt: string,
  schema: z.ZodType<T>,
  timeoutMs?: number,
): Promise<unknown> {
  const jsonSchema = JSON.stringify(zodToProviderSchema(schema));

  // We deliberately do NOT use `--bare`: it disables OAuth/keychain auth and
  // forces ANTHROPIC_API_KEY, so subscription users get "Not logged in". We
  // instead keep normal auth and isolate the context flag-by-flag:
  //   -p                       print mode (one-shot, non-interactive).
  //   --output-format json     structured wrapper around the model output.
  //   --json-schema            constrains the response to the supplied schema
  //                            (populates `structured_output`).
  //   --system-prompt          replaces the agentic default (cheaper, focused).
  //   --setting-sources ''     load no user/project/local settings → no hooks.
  //   --strict-mcp-config +    use only the empty inline MCP config → no MCP
  //   --mcp-config             servers.
  //   --disable-slash-commands no skills.
  //   --tools ''               no built-in tool definitions. These are the bulk
  //                            of the fixed per-spawn context (~27K -> ~1.5K
  //                            input tokens measured on CLI 2.1.x) and none are
  //                            used. --json-schema still works without them.
  //   --no-session-persistence don't write a resumable transcript per call.
  //   cwd = throwaway dir      no project CLAUDE.md auto-discovery.
  //   CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC
  //                            skips the CLI's background Haiku side call
  //                            (~2.5K tokens per spawn) plus telemetry.
  // Prompt piped on stdin to avoid Windows multi-line argv truncation
  // (a known gotcha with headless CLI wrappers).
  const effectiveTimeoutMs = timeoutMs ?? 120_000;

  let result: CliResult;
  try {
    result = await runCli(
      [
        '-p', '--model', model,
        '--output-format', 'json', '--json-schema', jsonSchema,
        '--system-prompt', ISOLATED_SYSTEM_PROMPT,
        '--setting-sources', '',
        '--strict-mcp-config', '--mcp-config', EMPTY_MCP_CONFIG,
        '--disable-slash-commands',
        '--tools', '',
        '--no-session-persistence',
      ],
      {
        input: prompt,
        cwd: isolatedCwd(),
        env: { ...process.env, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' },
        timeoutMs: effectiveTimeoutMs,
      },
    );
  } catch (err) {
    // The executable couldn't be started at all (e.g. "spawn claude ENOENT") —
    // no process exists to time out or produce output. Treat it like any other
    // process failure: classified (fatal for a missing CLI) and never retried.
    throw new SpawnFailure((err as Error).message, 'process');
  }
  const { stdout, stderr, exitCode, timedOut } = result;

  if (timedOut) {
    throw new SpawnFailure(`timed out after ${Math.round(effectiveTimeoutMs / 1000)}s`, 'timeout');
  }

  if (exitCode !== 0) {
    // Auth/usage failures (e.g. "Not logged in · Please run /login") arrive on
    // stdout inside the JSON wrapper's `result`, with stderr empty. Surface
    // that so classifyErrorMessage can flag fatal cases instead of retrying.
    throw new SpawnFailure(`claude cli exit ${exitCode}: ${stderr.trim() || resultMessage(stdout)}`, 'process');
  }

  try {
    return unwrapClaudeResponse(stdout);
  } catch (err) {
    throw new SpawnFailure((err as Error).message, 'invalid-output');
  }
}

// Best-effort extraction of the human-readable message the CLI puts in the
// wrapper's `result` field on error. Falls back to a stdout preview.
function resultMessage(stdout: string): string {
  try {
    const wrapper = JSON.parse(stdout) as { result?: unknown };
    if (typeof wrapper.result === 'string' && wrapper.result.trim()) return wrapper.result.trim();
  } catch {
    /* not JSON — fall through */
  }
  return stdout.slice(0, 200).replace(/\s+/g, ' ').trim() || '(no output)';
}

export class ClaudeCodeProvider implements LlmProvider {
  readonly name = 'claude-code' as const;

  defaultModelFor(task: LlmTask): string {
    return TASK_MODELS[task];
  }

  async call<T>(req: LlmRequest, schema: z.ZodType<T>): Promise<T> {
    const model = req.modelOverride ?? this.defaultModelFor(req.task);

    let raw: unknown = undefined;
    let haveRaw = false;
    try {
      raw = await spawnClaude(model, req.prompt, schema, req.timeoutMs);
      haveRaw = true;
    } catch (err) {
      if (err instanceof SpawnFailure && err.reason !== 'invalid-output') {
        // Timeout or a non-zero-exit process failure (auth, usage limit,
        // missing CLI, ...): the same prompt will fail the same way again, so
        // fail fast instead of paying for an identical second attempt.
        console.warn(`[claude-code] first-attempt failed (${err.reason}): ${err.message}`);
        const kind = err.reason === 'timeout' ? 'transient' : classifyErrorMessage(err.message);
        throw new LlmError(kind, `claude-code: ${err.message}`);
      }
      // 'invalid-output' (process ran, stdout wasn't parseable JSON) or an
      // unexpected non-SpawnFailure error: worth one retry with a stricter
      // "JSON only" instruction.
      console.warn(`[claude-code] first-attempt failed: ${(err as Error).message}`);
    }

    if (haveRaw) {
      const first = schema.safeParse(raw);
      if (first.success) return first.data;
      console.warn(`[claude-code] first-attempt schema error: ${first.error.message}`);
    }

    try {
      const strict = await spawnClaude(model, req.prompt + STRICT_SUFFIX, schema, req.timeoutMs);
      return schema.parse(strict);
    } catch (err) {
      if (err instanceof SpawnFailure && err.reason === 'timeout') {
        throw new LlmError('transient', `claude-code: ${err.message}`);
      }
      const msg = (err as Error).message;
      throw new LlmError(classifyErrorMessage(msg), `claude-code: ${msg}`);
    }
  }

  async healthcheck(opts: HealthcheckOptions = {}): Promise<HealthcheckResult> {
    let version: string;
    try {
      // Async spawn, not spawnSync — this runs on every Settings mount (twice
      // under React StrictMode) and a blocking sync spawn stalled SSE streams
      // and in-flight scans.
      const { stdout, stderr, exitCode } = await runCli(['--version'], { env: process.env });
      if (exitCode !== 0) {
        return { ok: false, detail: `claude --version exited ${exitCode}: ${stderr.trim()}` };
      }
      version = stdout.trim();
    } catch (err) {
      return {
        ok: false,
        detail: `claude CLI not found — install Claude Code from https://claude.com/claude-code (${(err as Error).message})`,
      };
    }

    if (!opts.deep) {
      // Default (cheap) path: CLI presence/version only, no model call.
      return { ok: true, detail: version };
    }

    // Deep probe (?deep=1 only): a tiny structured call. `--version` only
    // proves the binary exists; it does NOT prove auth works (the old
    // --bare/--help probe falsely reported healthy while the user was logged
    // out). A trivial haiku call surfaces "Not logged in" and wrapper breakage
    // before the first scan.
    const ProbeShape = z.object({ ok: z.boolean() });
    try {
      const raw = await spawnClaude('haiku', 'Respond with the JSON {"ok":true}.', ProbeShape, 30_000);
      ProbeShape.parse(raw);
      return { ok: true, detail: version };
    } catch (err) {
      return { ok: false, detail: `${version} — call failed: ${(err as Error).message}` };
    }
  }
}
