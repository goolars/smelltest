// smelltest — the spend engine, pinned to an exact hand-computed fixture. If the dedup, the
// 1h-cache x2 rule, the iterations[] fallback, or a price changes, the EXACT number moves and this
// fails — the same evidence-grade discipline as the fuse halt-proof.

import assert from "node:assert/strict";
import { test } from "node:test";
import { costOfTurn, loadPrices, resolvePrice, sessionCost } from "../src/cost.ts";

const prices = loadPrices();

test("loadPrices resolves the pinned snapshot (the build/path wiring works)", () => {
  assert.ok(prices, "snapshot loaded");
  assert.ok(prices?.capturedAt, "snapshot is dated");
});

test("resolvePrice: exact-then-longest-prefix family match; unknown -> null", () => {
  if (!prices) return;
  assert.equal(
    resolvePrice("claude-opus-4-8", prices)?.in,
    0.000005,
    "new opus point release prices off the opus-4 family",
  );
  assert.equal(resolvePrice("claude-sonnet-4-6", prices)?.out, 0.000015, "sonnet-4 family");
  assert.equal(resolvePrice("claude-3-5-haiku-20241022", prices)?.in, 0.0000008, "3-5-haiku family");
  assert.equal(resolvePrice("totally-made-up-model", prices), null, "unknown model -> null (fail-soft)");
  assert.equal(resolvePrice("<synthetic>", prices), null, "synthetic -> null");
});

// Pins the PRICES to hard literals, independent of the fixture (which is derived FROM the
// snapshot and so can't catch a wrong price). A figure that drifts from Anthropic's list fails CI.
test("price snapshot pins to current Anthropic list prices ($/Mtok)", () => {
  if (!prices) return;
  assert.equal(resolvePrice("claude-opus-4-8", prices)?.in, 0.000005, "Opus 4.x = $5/Mtok in");
  assert.equal(resolvePrice("claude-opus-4-8", prices)?.out, 0.000025, "Opus 4.x = $25/Mtok out");
  assert.equal(resolvePrice("claude-sonnet-4-6", prices)?.in, 0.000003, "Sonnet 4.x = $3/Mtok in");
  assert.equal(resolvePrice("claude-haiku-4-5", prices)?.in, 0.000001, "Haiku 4.5 = $1/Mtok in");
  assert.equal(resolvePrice("claude-fable-5", prices)?.out, 0.00005, "Fable 5 = $50/Mtok out");
  assert.equal(resolvePrice("claude-3-opus", prices)?.in, 0.000015, "legacy Opus 3 stays $15/Mtok");
});

test("costOfTurn: 1h cache writes price at input x 2", () => {
  if (!prices) return;
  const u = {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation: { ephemeral_5m_input_tokens: 100, ephemeral_1h_input_tokens: 100 },
  };
  const { usd } = costOfTurn(u, "claude-sonnet-4-6", prices);
  // 100 * 0.00000375 (5m) + 100 * (0.000003 * 2) (1h) = 0.000375 + 0.0006
  assert.ok(Math.abs((usd ?? 0) - 0.000975) < 1e-12, `got ${usd}`);
});

test("sessionCost: dedup by (id+requestId), exact total, fail-soft on unknown model", () => {
  if (!prices) return;
  const turn = (id: string, req: string, model: string, usage: unknown) => ({
    type: "assistant",
    requestId: req,
    message: { id, role: "assistant", model, usage },
  });
  const entries = [
    turn("a", "ra", "claude-sonnet-4-6", {
      input_tokens: 1000,
      output_tokens: 500,
      cache_creation_input_tokens: 200,
      cache_read_input_tokens: 100,
    }),
    turn("a", "ra", "claude-sonnet-4-6", {
      input_tokens: 1000,
      output_tokens: 500,
      cache_creation_input_tokens: 200,
      cache_read_input_tokens: 100,
    }), // DUPLICATE — must count once
    turn("b", "rb", "claude-opus-4-8", { input_tokens: 2000, output_tokens: 1000 }),
    turn("c", "rc", "fable-5-unknown", { input_tokens: 50, output_tokens: 50 }), // unpriced -> notChecked
    turn("d", "rd", "claude-sonnet-4-6", {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation: { ephemeral_5m_input_tokens: 100, ephemeral_1h_input_tokens: 100 },
    }),
    { type: "user", message: { role: "user", content: "hi" } }, // non-assistant — ignored
  ];
  const s = sessionCost(entries, prices);

  // A=0.01128, B=0.035, D=0.000975  => 0.047255  (C excluded; the A duplicate excluded)
  assert.ok(Math.abs(s.usd - 0.047255) < 1e-9, `usd was ${s.usd}`);
  assert.equal(s.turns, 4, "4 unique counted turns (the duplicate A is deduped, the user row ignored)");
  assert.equal(s.tokens, 5000, "priced tokens = 1800 + 3000 + 200 (C's 100 is unpriced, excluded)");
  assert.equal(s.notCheckedModels.length, 1, "one unpriced model");
  assert.equal(s.notCheckedModels[0].model, "fable-5-unknown");
  assert.equal(s.notCheckedModels[0].tokens, 100, "unpriced tokens surfaced, never silently $0");
});

test("sessionCost: null price table -> all zero, never throws (fail-soft)", () => {
  const s = sessionCost(
    [
      {
        type: "assistant",
        requestId: "r",
        message: { id: "x", model: "claude-opus-4-8", usage: { input_tokens: 9 } },
      },
    ],
    null,
  );
  assert.equal(s.usd, 0);
  assert.equal(s.turns, 0);
});
