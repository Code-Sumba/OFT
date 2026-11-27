import pg from "pg";

// Keep DATE columns (e.g. harvest_date) as "YYYY-MM-DD" text. By default pg turns them into
// local-midnight Date objects, which shift to the previous day when serialised on a server
// whose time zone is ahead of UTC (such as IST).
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);

/** Minimal query interface so tests can swap in an in-memory database. */
export interface Db {
  query<R extends pg.QueryResultRow = pg.QueryResultRow>(text: string, values?: unknown[]): Promise<pg.QueryResult<R>>;
}

/** "$1, $2, ..., $n" for an IN (...) list. */
export function placeholders(n: number, start = 1): string {
  return Array.from({ length: n }, (_, i) => `$${start + i}`).join(", ");
}

export function createPool(connectionString: string): pg.Pool {
  return new pg.Pool({
    connectionString,
    max: 10,
    // Supabase requires TLS; local Postgres usually does not.
    ssl: /localhost|127\.0\.0\.1/.test(connectionString) ? undefined : { rejectUnauthorized: false },
  });
}
