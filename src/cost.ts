// smelltest — the deterministic spend engine (the v0.4 power tool). Pure + offline: it turns a
// Claude Code session transcript into an estimated USD/token cost by multiplying the per-turn
// `usage` token classes by a PINNED price snapshot. No network, no clock, no LLM. The number is a
// client-side ESTIMATE (it can drift from the real Anthropic bill, and on Pro/Max it is a
// token-equivalent budget, not literal dollars) — the gate is honest about that.
//
// Two correctness landmines, both verified against a real ~/.claude transcript and pinned by tests:
//   1. DEDUP: ~58% of assistant rows are duplicate (message.id + requestId) pairs; summing naively
//      nearly triples the cost. The dedup set is built first.
//   2. SCHEMA: token counts live in flat usage.* fields, but sometimes only in usage.iterations[];
//      flat is primary, iterations is the fallback.
// Pricing algorithm/schema follow LiteLLM (MIT) — idea-only, attributed in CREDITS.md.

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

export interface ModelPrice {
  in: number;
  out: number;
  cacheWrite5m: number;
  cacheRead: number;
}
export interface PriceTable {
  capturedAt?: string;
  models?: Record<string, ModelPrice>;
  families?: ({ prefix: string } & ModelPrice)[];
}
export interface SpendInfo {
  usd: number; // priced cost (a LOWER BOUND when notCheckedModels is non-empty)
  tokens: number; // total tokens across priced turns
  turns: number; // de-duplicated assistant turns counted
  notCheckedModels: { model: string; tokens: number; turns: number }[]; // unpriced — never counted as $0 silently
  capturedAt?: string;
}

interface Tokens {
  input: number;
  output: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  cacheRead: number;
}

// Load the pinned snapshot from disk. Resolves for both the source layout (src/cost.ts ->
// ../pricing) and the built layout (dist/cli.mjs -> ./pricing, dist/hooks/*.mjs -> ../pricing).
// Returns null on any failure -> the caller fails soft (every turn notChecked), never a false $0.
export function loadPrices(): PriceTable | null {
  try {
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    for (const rel of ["pricing", "../pricing", "../../pricing"]) {
      const p = path.join(here, rel, "litellm-snapshot.json");
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8")) as PriceTable;
    }
  } catch {
    /* fall through */
  }
  return null;
}

// Exact id, else the LONGEST matching family prefix (so a new point release like
// claude-opus-4-8 still prices off the opus-4 family), else null -> notChecked.
export function resolvePrice(model: string, prices: PriceTable): ModelPrice | null {
  if (!model) return null;
  const exact = prices.models?.[model];
  if (exact) return exact;
  let best: ModelPrice | null = null;
  let bestLen = -1;
  for (const fam of prices.families || []) {
    if (model.startsWith(fam.prefix) && fam.prefix.length > bestLen) {
      best = { in: fam.in, out: fam.out, cacheWrite5m: fam.cacheWrite5m, cacheRead: fam.cacheRead };
      bestLen = fam.prefix.length;
    }
  }
  return best;
}

function num(x: unknown): number {
  return typeof x === "number" && Number.isFinite(x) && x > 0 ? x : 0;
}

// Read token classes from one `usage` object. Flat fields are primary; if every flat class is 0
// and usage.iterations[] is present, sum the iterations (the verified fallback schema).
function tokensOf(usage: any): Tokens {
  if (!usage || typeof usage !== "object")
    return { input: 0, output: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0 };
  const cc = usage.cache_creation && typeof usage.cache_creation === "object" ? usage.cache_creation : null;
  const flat: Tokens = {
    input: num(usage.input_tokens),
    output: num(usage.output_tokens),
    cacheWrite5m: cc ? num(cc.ephemeral_5m_input_tokens) : num(usage.cache_creation_input_tokens),
    cacheWrite1h: cc ? num(cc.ephemeral_1h_input_tokens) : 0,
    cacheRead: num(usage.cache_read_input_tokens),
  };
  // Gate on the SUBSTANTIVE classes only (NOT cacheWrite1h): on some rows every substantive flat
  // field is 0 while a stray 1h-write marker sits on the parent and the real per-call counts live
  // in usage.iterations[]. Including cw1h here made flatTotal != 0, so the fallback never fired and
  // those rows undercounted by the whole iterations payload (a false LOW, which we forbid).
  const flatSubstantive = flat.input + flat.output + flat.cacheWrite5m + flat.cacheRead;
  if (flatSubstantive === 0 && Array.isArray(usage.iterations)) {
    const sum: Tokens = { input: 0, output: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0 };
    for (const it of usage.iterations) {
      const t = tokensOf(it); // iterations carry the same usage shape
      sum.input += t.input;
      sum.output += t.output;
      sum.cacheWrite5m += t.cacheWrite5m;
      sum.cacheWrite1h += t.cacheWrite1h;
      sum.cacheRead += t.cacheRead;
    }
    // Keep the parent's 1h-write marker if the iterations don't carry one — never drop real tokens.
    sum.cacheWrite1h = Math.max(sum.cacheWrite1h, flat.cacheWrite1h);
    return sum;
  }
  return flat;
}

function totalTokens(t: Tokens): number {
  return t.input + t.output + t.cacheWrite5m + t.cacheWrite1h + t.cacheRead;
}

// Cost of one turn. 1h cache writes price at input x 2 (the documented Anthropic subtlety).
// Returns null usd when the model is unpriced (the turn is notChecked, not $0).
export function costOfTurn(
  usage: any,
  model: string,
  prices: PriceTable,
): { usd: number | null; tokens: number } {
  const t = tokensOf(usage);
  const tokens = totalTokens(t);
  const price = resolvePrice(model, prices);
  if (!price) return { usd: null, tokens };
  const usd =
    t.input * price.in +
    t.output * price.out +
    t.cacheWrite5m * price.cacheWrite5m +
    t.cacheWrite1h * (price.in * 2) +
    t.cacheRead * price.cacheRead;
  return { usd, tokens };
}

// Walk the transcript entries, DEDUP by (message.id + requestId), and sum. A turn with tokens but
// an unpriced model goes to notCheckedModels (loud), never silently into a $0 "within budget".
export function sessionCost(entries: any[], prices: PriceTable | null): SpendInfo {
  const empty: SpendInfo = {
    usd: 0,
    tokens: 0,
    turns: 0,
    notCheckedModels: [],
    capturedAt: prices?.capturedAt,
  };
  if (!prices) return empty;
  const seen = new Set<string>();
  const notChecked = new Map<string, { tokens: number; turns: number }>();
  let usd = 0;
  let tokens = 0;
  let turns = 0;

  for (const e of entries) {
    const msg = e?.message;
    const usage = msg?.usage;
    if (!usage) continue;
    if (!String(e?.type || msg?.role || "").includes("assistant")) continue;

    const id = msg?.id;
    const reqId = e?.requestId ?? e?.request_id;
    if (id && reqId) {
      const key = `${id}|${reqId}`;
      if (seen.has(key)) continue; // duplicate (id+reqId) — count once
      seen.add(key);
    }

    const model = String(msg?.model || "");
    const { usd: turnUsd, tokens: turnTokens } = costOfTurn(usage, model, prices);
    if (turnTokens === 0) continue; // empty/synthetic turn — no cost, no noise
    turns++;
    if (turnUsd == null) {
      const cur = notChecked.get(model) || { tokens: 0, turns: 0 };
      notChecked.set(model, { tokens: cur.tokens + turnTokens, turns: cur.turns + 1 });
      continue;
    }
    usd += turnUsd;
    tokens += turnTokens;
  }

  return {
    usd,
    tokens,
    turns,
    notCheckedModels: [...notChecked.entries()].map(([model, v]) => ({ model, ...v })),
    capturedAt: prices.capturedAt,
  };
}

// A one-line human receipt. Honest by construction: says "est.", flags unpriced turns as a lower
// bound, and never implies it is the real invoice.
export function renderSpend(s: SpendInfo, ceilingUsd?: number): string {
  const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(0)}k` : `${n}`);
  const lb = s.notCheckedModels.length ? "≥ " : "~";
  let line = `${lb}$${s.usd.toFixed(2)} / ${k(s.tokens)} tokens (est.)`;
  if (typeof ceilingUsd === "number" && ceilingUsd > 0) {
    line += ` — ceiling $${ceilingUsd.toFixed(2)}, ${Math.min(999, Math.round((s.usd / ceilingUsd) * 100))}% used`;
  }
  if (s.notCheckedModels.length) {
    const names = s.notCheckedModels.map((n) => `${n.model} (${n.turns})`).join(", ");
    line += ` · unpriced, not counted: ${names}`;
  }
  return line;
}
