/**
 * Local-first ledger remains source of truth.
 * This module mirrors events into Postgres (DATABASE_URL) or PGLite.
 * Never replaces JSONL. Never stores secret values.
 */
import { createHash } from "node:crypto";

export interface MirrorRow {
  seq: number;
  event_id: string;
  type: string;
  operator_id: string;
  mission_id: string | null;
  payload_hash: string;
  at: string;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS aj_events (
  seq INTEGER NOT NULL,
  event_id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  operator_id TEXT NOT NULL,
  mission_id TEXT,
  payload_hash TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS aj_events_op_seq ON aj_events (operator_id, seq);
`;

const mem: MirrorRow[] = [];

function rowOf(ev: {
  seq: number;
  eventId: string;
  type: string;
  operatorId: string;
  missionId?: string;
  payload?: unknown;
  at: string;
}): MirrorRow {
  const payload_hash = createHash("sha256").update(JSON.stringify(ev.payload ?? {})).digest("hex").slice(0, 32);
  return {
    seq: ev.seq,
    event_id: ev.eventId,
    type: ev.type,
    operator_id: ev.operatorId,
    mission_id: ev.missionId ?? null,
    payload_hash,
    at: ev.at,
  };
}

export function mirroredRows(): MirrorRow[] {
  return [...mem];
}

export function resetMirrorForTests(): void {
  mem.length = 0;
}

export async function ensureMirror(): Promise<void> {
  const sql = await trySql();
  if (!sql) return;
  await sql.exec(SCHEMA);
}

export async function mirrorEvent(ev: {
  seq: number;
  eventId: string;
  type: string;
  operatorId: string;
  missionId?: string;
  payload?: unknown;
  at: string;
}): Promise<MirrorRow> {
  const row = rowOf(ev);
  if (!mem.some((r) => r.event_id === row.event_id)) mem.push(row);
  const sql = await trySql();
  if (sql) {
    await sql.exec(SCHEMA);
    await sql.run(
      `INSERT INTO aj_events (seq, event_id, type, operator_id, mission_id, payload_hash, at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (event_id) DO NOTHING`,
      [row.seq, row.event_id, row.type, row.operator_id, row.mission_id, row.payload_hash, row.at],
    );
  }
  return row;
}

type SqlLite = {
  exec: (q: string) => Promise<unknown>;
  run: (q: string, params: unknown[]) => Promise<unknown>;
};

let cached: SqlLite | null | undefined;

async function trySql(): Promise<SqlLite | null> {
  if (cached !== undefined) return cached;
  if (process.env.AJ_PG_MIRROR === "0") {
    cached = null;
    return null;
  }
  if (process.env.DATABASE_URL) {
    try {
      const pg = await import("pg");
      const client = new pg.default.Client({ connectionString: process.env.DATABASE_URL });
      await client.connect();
      cached = {
        exec: async (q) => client.query(q),
        run: async (q, params) => client.query(q, params),
      };
      return cached;
    } catch {
      cached = null;
      return null;
    }
  }
  try {
    const { PGlite } = await import("@electric-sql/pglite");
    const dir = process.env.AJ_MIRROR_DIR;
    const db = dir ? new PGlite(dir) : new PGlite();
    cached = {
      exec: async (q) => db.exec(q),
      run: async (q, params) => db.query(q, params),
    };
    return cached;
  } catch {
    cached = null;
    return null;
  }
}
