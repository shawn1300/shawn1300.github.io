import type { ModularEnvironmentChartSeries } from "@/lib/environment/chart";

export interface EnvironmentChartSelection {
  seriesIndex: number;
  pointIndex: number;
  distance: number;
}

export interface EnvironmentChartTooltipPlacement {
  inline: "before" | "after";
  block: "before" | "after";
}

export function environmentChartTooltipPlacement(
  x: number,
  y: number,
  width: number,
  height: number
): EnvironmentChartTooltipPlacement {
  return {
    inline: x > width / 2 ? "before" : "after",
    block: y < height / 2 ? "after" : "before",
  };
}

export function nearestEnvironmentChartPoint(
  series: ModularEnvironmentChartSeries[],
  x: number,
  y: number,
  maximumDistance = 32,
  scale = { x: 1, y: 1 }
): EnvironmentChartSelection | null {
  let nearest: EnvironmentChartSelection | null = null;
  for (const [seriesIndex, item] of series.entries()) {
    for (const [pointIndex, point] of item.points.entries()) {
      const distance = Math.hypot(
        (point.x - x) * scale.x,
        (point.y - y) * scale.y
      );
      if (
        distance <= maximumDistance &&
        (!nearest || distance < nearest.distance)
      ) {
        nearest = { seriesIndex, pointIndex, distance };
      }
    }
  }
  return nearest;
}

export function moveEnvironmentChartSelection(
  series: ModularEnvironmentChartSeries[],
  current: EnvironmentChartSelection | null,
  direction: "left" | "right" | "up" | "down"
): EnvironmentChartSelection | null {
  if (series.length === 0) return null;
  if (!current) {
    const firstSeries = series.findIndex((item) => item.points.length > 0);
    return firstSeries < 0 ? null : { seriesIndex: firstSeries, pointIndex: 0, distance: 0 };
  }
  if (direction === "left" || direction === "right") {
    const points = series[current.seriesIndex]?.points ?? [];
    if (points.length === 0) return current;
    const delta = direction === "left" ? -1 : 1;
    return { ...current, pointIndex: Math.max(0, Math.min(points.length - 1, current.pointIndex + delta)), distance: 0 };
  }
  const delta = direction === "up" ? -1 : 1;
  let next = current.seriesIndex + delta;
  while (next >= 0 && next < series.length) {
    const points = series[next].points;
    if (points.length > 0) {
      const targetTime = series[current.seriesIndex].points[current.pointIndex]?.sourceUpdatedAt;
      const target = Date.parse(targetTime ?? "");
      let pointIndex = 0;
      let distance = Number.POSITIVE_INFINITY;
      for (const [index, point] of points.entries()) {
        const candidate = Math.abs(Date.parse(point.sourceUpdatedAt) - target);
        if (candidate < distance) { distance = candidate; pointIndex = index; }
      }
      return { seriesIndex: next, pointIndex, distance: 0 };
    }
    next += delta;
  }
  return current;
}
