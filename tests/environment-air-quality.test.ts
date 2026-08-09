import assert from "node:assert/strict";
import test from "node:test";

import { calculateChinaPm25Aqi, chinaPm25AqiFromConcentration } from "../lib/environment/air-quality/china-aqi";
import { calculateCo2Reference, co2VentilationBand } from "../lib/environment/air-quality/co2";
import { hourlyMetricAverages } from "../lib/environment/air-quality/hourly";
import { calculateUsPm25NowCast, usPm25AqiFromConcentration } from "../lib/environment/air-quality/us-aqi";

const now = new Date("2026-08-09T12:50:00.000Z");
const points = (values: number[], start = now.getTime() - (values.length - 1) * 10 * 60_000) =>
  values.map((value, index) => ({ sourceUpdatedAt: new Date(start + index * 10 * 60_000).toISOString(), value }));

test("China HJ 633-2026 PM2.5 breakpoints and upward rounding are exact", () => {
  const expected = [[0, 1], [35, 50], [60, 100], [115, 150], [150, 200], [250, 300], [350, 400], [500, 500]];
  for (const [concentration, aqi] of expected) {
    assert.equal(chinaPm25AqiFromConcentration(concentration).aqi, aqi);
  }
  assert.equal(chinaPm25AqiFromConcentration(35.4).aqi, 50);
  assert.equal(chinaPm25AqiFromConcentration(35.5).aqi, 52);
  assert.equal(chinaPm25AqiFromConcentration(34.5).concentration, 34);
  assert.equal(calculateChinaPm25Aqi(points([10, 10, 10, 10]), now).status, "insufficient_data");
  assert.equal(calculateChinaPm25Aqi(points([10, 10, 10, 10, 10]), now).status, "available");
});

test("US EPA May 2026 PM2.5 breakpoints truncate and interpolate correctly", () => {
  const expected = [[9, 50], [9.1, 51], [35.4, 100], [35.5, 101], [55.4, 150], [55.5, 151], [125.4, 200], [125.5, 201], [225.4, 300], [225.5, 301], [325.4, 500]];
  for (const [concentration, aqi] of expected) {
    assert.equal(usPm25AqiFromConcentration(concentration).aqi, aqi);
  }
  assert.equal(usPm25AqiFromConcentration(9.09).aqi, 50);
});

test("US NowCast requires two recent valid hours and weights changing air", () => {
  const recent = points(Array(18).fill(20), now.getTime() - 170 * 60_000);
  assert.equal(calculateUsPm25NowCast(recent, now).status, "available");
  const incomplete = points(Array(6).fill(20));
  assert.equal(calculateUsPm25NowCast(incomplete, now).status, "insufficient_data");
  assert.equal(hourlyMetricAverages(recent, now, 4, 3).length, 3);
});

test("CO2 one-hour reference needs four samples and keeps approved boundaries", () => {
  assert.equal(co2VentilationBand(799), "good");
  assert.equal(co2VentilationBand(800), "adequate");
  assert.equal(co2VentilationBand(1500), "adequate");
  assert.equal(co2VentilationBand(1501), "poor");
  assert.equal(calculateCo2Reference(points([700, 700, 700]), now).status, "insufficient_data");
  assert.deepEqual(calculateCo2Reference(points([700, 700, 700, 700]), now), {
    status: "available",
    averagePpm: 700,
    category: "good",
  });
});
