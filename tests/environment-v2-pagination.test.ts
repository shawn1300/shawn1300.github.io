import assert from "node:assert/strict";
import test from "node:test";

import { readEnvironmentHistoryPagesV2 } from "../lib/environment/v2/pagination";

test("v2 history pagination reads past the Supabase 1000-row response limit", async () => {
  const source = Array.from({ length: 6_048 }, (_, index) => index);
  const ranges: Array<[number, number]> = [];

  const rows = await readEnvironmentHistoryPagesV2(async (from, to) => {
    ranges.push([from, to]);
    return source.slice(from, to + 1);
  });

  assert.deepEqual(ranges, [
    [0, 999],
    [1_000, 1_999],
    [2_000, 2_999],
    [3_000, 3_999],
    [4_000, 4_999],
    [5_000, 5_999],
    [6_000, 6_999],
  ]);
  assert.equal(rows.length, 6_048);
  assert.equal(rows[0], 0);
  assert.equal(rows.at(-1), 6_047);
});

test("v2 history pagination stops at its total safety bound", async () => {
  const ranges: Array<[number, number]> = [];
  const rows = await readEnvironmentHistoryPagesV2(async (from, to) => {
    ranges.push([from, to]);
    return Array.from({ length: to - from + 1 }, (_, index) => from + index);
  }, 1_000, 2_500);

  assert.equal(rows.length, 2_500);
  assert.deepEqual(ranges, [[0, 999], [1_000, 1_999], [2_000, 2_499]]);
});

test("v2 history pagination rejects instead of returning a partial snapshot", async () => {
  await assert.rejects(
    readEnvironmentHistoryPagesV2(async (from, to) => {
      if (from === 1_000) throw new Error("database unavailable");
      return Array.from({ length: to - from + 1 }, (_, index) => from + index);
    }),
    /database unavailable/
  );
});
