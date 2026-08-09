import { recentMean, type TimedMetricSample } from "@/lib/environment/air-quality/hourly";

export type Co2VentilationBand = "good" | "adequate" | "poor";

export function co2VentilationBand(value: number): Co2VentilationBand {
  if (value < 800) return "good";
  if (value <= 1500) return "adequate";
  return "poor";
}

export function calculateCo2Reference(
  points: TimedMetricSample[],
  now = new Date()
) {
  const average = recentMean(points, now, 4);
  if (average === null) {
    return { status: "insufficient_data" as const, averagePpm: null, category: null };
  }
  const averagePpm = Math.round(average);
  return {
    status: "available" as const,
    averagePpm,
    category: co2VentilationBand(averagePpm),
  };
}
