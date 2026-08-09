export interface TimedMetricSample {
  sourceUpdatedAt: string;
  value: number;
}

export interface HourlyMetricSample {
  hour: string;
  value: number;
  sampleCount: number;
}

const HOUR_MS = 60 * 60 * 1000;

export function hourlyMetricAverages(
  points: TimedMetricSample[],
  now: Date,
  minimumSamples = 4,
  hours = 12
): Array<HourlyMetricSample | null> {
  const currentHour = Math.floor(now.getTime() / HOUR_MS) * HOUR_MS;
  const grouped = new Map<number, number[]>();
  for (const point of points) {
    const time = new Date(point.sourceUpdatedAt).getTime();
    if (!Number.isFinite(time) || !Number.isFinite(point.value)) continue;
    const bucket = Math.floor(time / HOUR_MS) * HOUR_MS;
    const age = Math.round((currentHour - bucket) / HOUR_MS);
    if (age < 0 || age >= hours) continue;
    const values = grouped.get(bucket) ?? [];
    values.push(point.value);
    grouped.set(bucket, values);
  }
  return Array.from({ length: hours }, (_, age) => {
    const bucket = currentHour - age * HOUR_MS;
    const values = grouped.get(bucket) ?? [];
    if (values.length < minimumSamples) return null;
    return {
      hour: new Date(bucket).toISOString(),
      value: values.reduce((sum, value) => sum + value, 0) / values.length,
      sampleCount: values.length,
    };
  });
}

export function recentMean(
  points: TimedMetricSample[],
  now: Date,
  minimumSamples = 4,
  durationMs = HOUR_MS
): number | null {
  const from = now.getTime() - durationMs;
  const values = points
    .filter((point) => {
      const time = new Date(point.sourceUpdatedAt).getTime();
      return Number.isFinite(time) && time > from && time <= now.getTime() && Number.isFinite(point.value);
    })
    .map((point) => point.value);
  if (values.length < minimumSamples) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
