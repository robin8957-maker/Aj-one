import type { MemoryKind, MemoryRecord } from "../protocol/index.ts";
import { makeId, nowIso } from "../protocol/index.ts";

const INCIDENT_TTL_MS = 6 * 60 * 60 * 1000;
const STALE_MS = 14 * 24 * 60 * 60 * 1000;
const DECAY_PER_DAY = 0.04;

export function normalizeSubject(title: string, body: string): string {
  const fromTitle = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (fromTitle.length >= 4) return fromTitle;
  return `${title} ${body}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 8)
    .join(" ");
}

export function inferPolarity(text: string): MemoryRecord["polarity"] {
  const t = text.toLowerCase();
  if (/\b(fail|failed|broken|defect|race|denied|error|poison)\b/.test(t)) return "negative";
  if (/\b(pass|passed|ok|healthy|verified|complete|fixed)\b/.test(t)) return "positive";
  return "neutral";
}

export function ingestMemory(
  existing: MemoryRecord[],
  draft: Omit<MemoryRecord, "memoryId" | "createdAt" | "updatedAt" | "health"> & {
    memoryId?: string;
  },
): { accepted: MemoryRecord; discarded?: string; superseded?: string[] } {
  const now = Date.now();
  const subject = draft.subject ?? normalizeSubject(draft.title, draft.body);
  const polarity = draft.polarity ?? inferPolarity(draft.body);
  const kind = draft.kind;

  if (kind === "verified-fact" && (draft.evidence?.length ?? 0) === 0) {
    const demoted: MemoryRecord = {
      ...draft,
      memoryId: draft.memoryId ?? makeId("mem"),
      kind: "hypothesis",
      health: "unverified",
      subject,
      polarity,
      confidence: Math.min(draft.confidence, 0.35),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    return { accepted: demoted, discarded: "memory-poisoning: verified-fact requires evidence" };
  }

  if (kind === "incident") {
    draft.ttlMs = draft.ttlMs ?? INCIDENT_TTL_MS;
    draft.expiresAt = new Date(now + draft.ttlMs).toISOString();
  }

  const dup = existing.find(
    (m) =>
      m.health !== "superseded" &&
      (m.subject ?? normalizeSubject(m.title, m.body)) === subject &&
      (m.polarity ?? inferPolarity(m.body)) === polarity,
  );
  if (dup) {
    const merged: MemoryRecord = {
      ...dup,
      body: draft.body.length > dup.body.length ? draft.body : dup.body,
      evidence: [...new Set([...dup.evidence, ...(draft.evidence ?? [])])],
      confidence: Math.max(dup.confidence, draft.confidence),
      updatedAt: nowIso(),
      lastVerified: draft.lastVerified ?? dup.lastVerified,
    };
    return { accepted: refreshHealth(merged, now), discarded: "deduplicated" };
  }

  const opposite = existing.filter(
    (m) =>
      m.health !== "superseded" &&
      (m.subject ?? normalizeSubject(m.title, m.body)) === subject &&
      (m.polarity ?? inferPolarity(m.body)) &&
      polarity &&
      (m.polarity ?? inferPolarity(m.body)) !== polarity &&
      polarity !== "neutral" &&
      (m.polarity ?? inferPolarity(m.body)) !== "neutral",
  );

  const accepted: MemoryRecord = {
    ...draft,
    memoryId: draft.memoryId ?? makeId("mem"),
    subject,
    polarity,
    health: opposite.length ? "contradictory" : "unverified",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    lastVerified: draft.lastVerified,
  };

  if (opposite.length && accepted.kind === "verified-fact" && (accepted.evidence?.length ?? 0) > 0) {
    return {
      accepted: { ...accepted, health: "healthy" },
      superseded: opposite.map((m) => m.memoryId),
    };
  }

  return { accepted: refreshHealth(accepted, now) };
}

export function refreshHealth(memory: MemoryRecord, now = Date.now()): MemoryRecord {
  if (memory.pinned && memory.health !== "contradictory") {
    return { ...memory, health: memory.health === "superseded" ? memory.health : "healthy" };
  }
  if (memory.expiresAt && Date.parse(memory.expiresAt) < now) {
    return { ...memory, health: "superseded", confidence: Math.min(memory.confidence, 0.2) };
  }
  const age = now - Date.parse(memory.updatedAt || memory.createdAt);
  let confidence = memory.confidence - (age / 86_400_000) * DECAY_PER_DAY;
  confidence = Math.max(0.05, Math.min(1, confidence));
  let health = memory.health;
  if (health !== "contradictory" && health !== "superseded") {
    if (confidence < 0.4) health = "low-confidence";
    else if (age > STALE_MS) health = "stale";
    else if (memory.kind === "verified-fact" && (memory.evidence?.length ?? 0) > 0) health = "healthy";
    else if (memory.kind === "incident" || memory.kind === "hypothesis") health = "unverified";
  }
  return { ...memory, confidence, health };
}

export function refreshAll(memories: MemoryRecord[], now = Date.now()): MemoryRecord[] {
  return memories.map((m) => refreshHealth(m, now));
}

export function canPromote(kind: MemoryKind, evidence: string[]): boolean {
  if (kind === "verified-fact" || kind === "decision") return evidence.length > 0;
  return true;
}
