-- Optional durable mirror for deployed environments.
-- File ledger remains the local-first source of truth.

create table if not exists aj_events (
  operator_id text not null,
  seq integer not null,
  event_id text not null,
  type text not null,
  payload text not null,
  created_at timestamptz not null default now(),
  primary key (operator_id, seq)
);

create table if not exists aj_snapshots (
  operator_id text not null primary key,
  seq integer not null,
  payload text not null,
  updated_at timestamptz not null default now()
);
