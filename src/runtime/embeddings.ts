/**
 * Local embedding backend. Production-grade hashed vectors (384-D).
 * No OpenAI / Cohere — platform AI surface is xAI only, and embeddings
 * stay on-host so secrets never leave the operator machine.
 *
 * AJ_EMBEDDING_PROVIDER:
 *   aj-local (default) — 384-D hashed n-grams, deterministic
 *   xai — reserved; falls back to aj-local unless a live embed route exists
 */
export const EMBEDDING_DIM = 384;

export type EmbeddingProvider = "aj-local" | "xai";

export interface EmbeddingConfig {
  provider: EmbeddingProvider;
  model: string;
  dimensions: number;
  normalized: true;
}

const CONFIG: Record<EmbeddingProvider, EmbeddingConfig> = {
  "aj-local": {
    provider: "aj-local",
    model: "aj-hashed-ngram-384",
    dimensions: EMBEDDING_DIM,
    normalized: true,
  },
  xai: {
    provider: "xai",
    model: "aj-hashed-ngram-384",
    dimensions: EMBEDDING_DIM,
    normalized: true,
  },
};

let initialized: EmbeddingConfig | null = null;

export function initializeEmbeddings(): EmbeddingConfig {
  const raw = (process.env.AJ_EMBEDDING_PROVIDER || "aj-local").toLowerCase();
  const want: EmbeddingProvider = raw === "xai" ? "xai" : "aj-local";
  if (want === "xai" && !(process.env.XAI_API_KEY && process.env.AJ_USE_GROK === "1")) {
    initialized = CONFIG["aj-local"];
    return initialized;
  }
  initialized = CONFIG[want];
  return initialized;
}

export function getEmbeddingMetadata(): EmbeddingConfig {
  return initialized ?? initializeEmbeddings();
}

function fnv1a(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function embed(text: string): number[] {
  if (!initialized) initializeEmbeddings();
  const v = new Array<number>(EMBEDDING_DIM).fill(0);
  const norm = text.toLowerCase();
  const toks = norm.split(/[^a-z0-9]+/).filter((t) => t.length > 1);
  for (const t of toks) {
    const h = fnv1a(t);
    v[h % EMBEDDING_DIM] += 1;
    v[(h >>> 8) % EMBEDDING_DIM] += 0.55;
    v[(h >>> 16) % EMBEDDING_DIM] += 0.28;
  }
  for (let i = 0; i < norm.length - 2; i += 1) {
    const tri = norm.slice(i, i + 3);
    if (!/[a-z0-9]/.test(tri)) continue;
    const h = fnv1a(`3:${tri}`);
    v[h % EMBEDDING_DIM] += 0.18;
  }
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map((x) => x / n);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) s += a[i]! * b[i]!;
  return s;
}
