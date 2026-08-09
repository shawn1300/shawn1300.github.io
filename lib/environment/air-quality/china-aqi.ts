import { recentMean, type TimedMetricSample } from "@/lib/environment/air-quality/hourly";

// Source: https://www.mee.gov.cn/ywgz/fgbz/bz/bzwb/jcffbz/202602/W020260225366493492011.pdf
// HJ 633-2026 table 3, PM2.5 daily breakpoints. Section 4.2.3 uses the
// corresponding daily-average breakpoints for a PM2.5 real-time 1-hour mean.
const BREAKPOINTS = [
  [0, 0],
  [35, 50],
  [60, 100],
  [115, 150],
  [150, 200],
  [250, 300],
  [350, 400],
  [500, 500],
] as const;

const CATEGORIES = [
  "excellent",
  "good",
  "light_pollution",
  "moderate_pollution",
  "heavy_pollution",
  "severe_pollution",
] as const;

export interface ChinaPm25AqiResult {
  status: "available" | "insufficient_data";
  concentration: number | null;
  aqi: number | null;
  category: typeof CATEGORIES[number] | null;
}

function roundHalfEven(value: number) {
  const floor = Math.floor(value);
  const fraction = value - floor;
  if (Math.abs(fraction - 0.5) < Number.EPSILON * Math.max(1, value)) {
    return floor % 2 === 0 ? floor : floor + 1;
  }
  return Math.round(value);
}

export function chinaPm25AqiFromConcentration(concentration: number) {
  // HJ 633 section 4.2.2: PM concentration is rounded to an integer.
  const value = Math.max(0, Math.min(500, roundHalfEven(concentration)));
  let low: readonly [number, number] = BREAKPOINTS[0];
  let high: readonly [number, number] = BREAKPOINTS[1];
  for (let index = 1; index < BREAKPOINTS.length; index += 1) {
    high = BREAKPOINTS[index];
    if (value <= high[0]) break;
    low = high;
  }
  // HJ 633 section 4.2.6: IAQI results are rounded upward to integers.
  const aqi = Math.max(1, Math.ceil(
    ((high[1] - low[1]) / (high[0] - low[0])) * (value - low[0]) + low[1]
  ));
  const category = CATEGORIES[
    aqi <= 50 ? 0 : aqi <= 100 ? 1 : aqi <= 150 ? 2 : aqi <= 200 ? 3 : aqi <= 300 ? 4 : 5
  ];
  return { concentration: value, aqi, category };
}

export function calculateChinaPm25Aqi(
  points: TimedMetricSample[],
  now = new Date()
): ChinaPm25AqiResult {
  // Five 10-minute samples is the conservative completeness gate for a
  // consumer sensor approximation of the current 1-hour mean.
  const mean = recentMean(points, now, 5);
  if (mean === null) return { status: "insufficient_data", concentration: null, aqi: null, category: null };
  return { status: "available", ...chinaPm25AqiFromConcentration(mean) };
}
