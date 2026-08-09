import assert from "node:assert/strict";
import test from "node:test";

import { createModularEnvironmentChartModel } from "../lib/environment/chart";
import { moveEnvironmentChartSelection, nearestEnvironmentChartPoint } from "../lib/environment/chart-hit-test";

const model = createModularEnvironmentChartModel([
  { id: "inside", label: "Inside", data: [
    { sourceUpdatedAt: "2026-08-09T00:00:00.000Z", value: 20 },
    { sourceUpdatedAt: "2026-08-09T01:00:00.000Z", value: 21 },
  ] },
  { id: "outside", label: "Outside", data: [
    { sourceUpdatedAt: "2026-08-09T00:00:00.000Z", value: 20 },
    { sourceUpdatedAt: "2026-08-09T01:00:00.000Z", value: 18 },
  ] },
])!;

test("nearest chart hit testing returns one deterministic series within radius", () => {
  const first = model.series[0].points[0];
  assert.deepEqual(nearestEnvironmentChartPoint(model.series, first.x, first.y, 1), {
    seriesIndex: 0, pointIndex: 0, distance: 0,
  });
  assert.equal(nearestEnvironmentChartPoint(model.series, -100, -100, 10), null);
});

test("keyboard movement clamps endpoints and chooses nearest time on another series", () => {
  const initial = { seriesIndex: 0, pointIndex: 0, distance: 0 };
  assert.equal(moveEnvironmentChartSelection(model.series, initial, "left")?.pointIndex, 0);
  assert.equal(moveEnvironmentChartSelection(model.series, initial, "right")?.pointIndex, 1);
  assert.deepEqual(moveEnvironmentChartSelection(model.series, initial, "down"), {
    seriesIndex: 1, pointIndex: 0, distance: 0,
  });
});
