import BetterSqlite3 from 'better-sqlite3';

/**
 * A thin layer over better-sqlite3 that keeps the statement semantics the codebase was
 * written against: `query()` caches the compiled statement per SQL string, `get()` returns
 * `null` (not `undefined`) when no row matches, `get()`/`all()` on a statement that returns
 * no rows yield `null`/`[]` instead of throwing, and booleans bind as 1/0.
 */
export type SQLBinding = string | number | bigint | boolean | null | undefined | Uint8Array;

export interface Changes {
  changes: number;
  lastInsertRowid: number | bigint;
}

type Bindable = Exclude<SQLBinding, boolean>;

function normalize(params: readonly unknown[]): unknown[] {
  // A single array argument is the parameter list itself, as in `db.run(sql, [a, b])`.
  const list = params.length === 1 && Array.isArray(params[0]) ? (params[0] as unknown[]) : params;
  for (let i = 0; i < list.length; i++) {
    if (typeof list[i] === 'boolean') return list.map(p => (typeof p === 'boolean' ? (p ? 1 : 0) : p));
  }
  return list as unknown[];
}

export class Statement<R = unknown, P extends unknown[] = any[]> {
  constructor(private readonly stmt: BetterSqlite3.Statement<Bindable[]>) {}

  get(...params: P): R | null {
    const args = normalize(params) as Bindable[];
    if (!this.stmt.reader) {
      this.stmt.run(...args);
      return null;
    }
    return (this.stmt.get(...args) as R | undefined) ?? null;
  }

  all(...params: P): R[] {
    const args = normalize(params) as Bindable[];
    if (!this.stmt.reader) {
      this.stmt.run(...args);
      return [];
    }
    return this.stmt.all(...args) as R[];
  }

  run(...params: P): Changes {
    return this.stmt.run(...(normalize(params) as Bindable[]));
  }

  values(...params: P): unknown[][] {
    this.stmt.raw(true);
    try {
      return this.stmt.all(...(normalize(params) as Bindable[])) as unknown[][];
    } finally {
      this.stmt.raw(false);
    }
  }
}

export class Database {
  private readonly raw: BetterSqlite3.Database;
  private readonly cache = new Map<string, Statement>();

  constructor(path: string, opts: { readonly?: boolean; create?: boolean } = {}) {
    this.raw = new BetterSqlite3(path, { readonly: opts.readonly ?? false, fileMustExist: opts.create === false });
  }

  query<R = unknown, P extends unknown[] = any[]>(sql: string): Statement<R, P> {
    let stmt = this.cache.get(sql);
    if (!stmt) {
      stmt = new Statement(this.raw.prepare<Bindable[]>(sql));
      this.cache.set(sql, stmt);
    }
    return stmt as unknown as Statement<R, P>;
  }

  prepare<R = unknown, P extends unknown[] = any[]>(sql: string): Statement<R, P> {
    return new Statement<R, P>(this.raw.prepare<Bindable[]>(sql));
  }

  run(sql: string, params: SQLBinding[] = []): Changes {
    return this.query(sql).run(...params);
  }

  exec(sql: string): void {
    this.raw.exec(sql);
  }

  transaction<A extends unknown[], T>(fn: (...args: A) => T): BetterSqlite3.Transaction<(...args: A) => T> {
    return this.raw.transaction(fn);
  }

  close(): void {
    this.cache.clear();
    this.raw.close();
  }
}
