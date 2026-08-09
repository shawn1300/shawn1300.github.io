import { hourlyMetricAverages, type TimedMetricSample } from "@/lib/environment/air-quality/hourly";

// Source: https://document.airnow.gov/technical-assistance-document-for-the-reporting-of-daily-air-quailty.pdf
// EPA Technical Assistance Document, May 2026, table 6.
const BREAKPOINTS = [
  [0, 9, 0, 50],
  [9.1, 35.4, 51, 100],
  [35.5, 55.4, 101, 150],
  [55.5, 125.4, 151, 200],
  [125.5, 225.4, 201, 300],
  [225.5, 325.4, 301, 500],
] as const;

const CATEGORIES = [
  "good",
  "moderate",
  "unhealthy_sensitive",
  "unhealthy",
  "very_unhealthy",
  "hazardous",
] as const;

function truncateTenth(value: number) {
  return Math.trunc(value * 10) / 10;
}

export function usPm25AqiFromConcentration(concentration: number) {
  const value = Math.max(0, truncateTenth(concentration));
  let index = BREAKPOINTS.findIndex((band) => value >= band[0] && value <= band[1]);
  if (index < 0) index = BREAKPOINTS.length - 1;
  const [lowConcentration, highConcentration, lowAqi, highAqi] = BREAKPOINTS[index];
  const aqi = Math.round(
    ((highAqi - lowAqi) / (highConcentration - lowConcentration)) *
      (value - lowConcentration) + lowAqi
  );
  return { concentration: value, aqi, category: CATEGORIES[index] };
}

export function calculateUsPm25NowCast(
  points: TimedMetricSample[],
  now = new Date()
) {
  const hourly = hourlyMetricAverages(points, now, 4, 12);
  if (hourly.slice(0, 3).filter(Boolean).length < 2) {
    return { status: "insufficient_data" as const, concentration: null, aqi: null, category: null };
  }
  const valid = hourly.flatMap((sample, hoursAgo) => sample ? [{ ...sample, hoursAgo }] : []);
  const values = valid.map((sample) => sample.value);
  const maximum = Math.max(...values);
  const minimum = Math.min(...values);
  const weight = maximum === 0 ? 1 : Math.max(0.5, 1 - (maximum - minimum) / maximum);
  let numerator = 0;
  let denominator = 0;
  for (const sample of valid) {
    const factor = weight ** sample.hoursAgo;
    numerator += sample.value * factor;
    denominator += factor;
  }
  const result = usPm25AqiFromConcentration(numerator / denominator);
  return { status: "available" as const, ...result };
}
