import type { EnvironmentRole } from "@/types/environment";

const WIDTH = 800;
const HEIGHT = 260;
const PADDING = { top: 18, right: 18, bottom: 34, left: 54 };

export interface EnvironmentChartDatum {
  sourceUpdatedAt: string;
  value: number;
}

export interface EnvironmentChartPoint extends EnvironmentChartDatum {
  x: number;
  y: number;
}

export interface EnvironmentChartSeries {
  path: string;
  points: EnvironmentChartPoint[];
}

export interface ModularEnvironmentChartSeriesInput {
  id: string;
  label: string;
  data: EnvironmentChartDatum[];
}

export interface ModularEnvironmentChartSeries extends EnvironmentChartSeries {
  id: string;
  label: string;
  styleIndex: number;
}

export interface EnvironmentChartTimeDomain {
  minimumTime: number;
  maximumTime: number;
}

export interface ModularEnvironmentChartModel extends Omit<EnvironmentChartModel, "series"> {
  series: ModularEnvironmentChartSeries[];
}

export interface EnvironmentChartModel {
  width: number;
  height: number;
  minimumValue: number;
  maximumValue: number;
  minimumTime: number;
  maximumTime: number;
  valueTicks: Array<{ value: number; y: number }>;
  timeTicks: Array<{ value: number; x: number }>;
  series: Record<EnvironmentRole, EnvironmentChartSeries>;
}

function validData(values: EnvironmentChartDatum[]) {
  return values
    .filter(
      (item) =>
        Number.isFinite(item.value) &&
        Number.isFinite(Date.parse(item.sourceUpdatedAt))
    )
    .sort(
      (left, right) =>
        Date.parse(left.sourceUpdatedAt) - Date.parse(right.sourceUpdatedAt)
    );
}

function ticks(minimum: number, maximum: number, count: number) {
  return Array.from(
    { length: count },
    (_, index) => minimum + ((maximum - minimum) * index) / (count - 1)
  );
}

function coordinate(
  value: number,
  minimum: number,
  maximum: number,
  start: number,
  end: number
) {
  if (minimum === maximum) return (start + end) / 2;
  return start + ((value - minimum) / (maximum - minimum)) * (end - start);
}

function pathFor(points: EnvironmentChartPoint[]) {
  return points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`
    )
    .join(" ");
}

export function createEnvironmentChartModel(input: Record<
  EnvironmentRole,
  EnvironmentChartDatum[]
>): EnvironmentChartModel | null {
  const data = {
    indoor: validData(input.indoor),
    outdoor: validData(input.outdoor),
  };
  const all = [...data.indoor, ...data.outdoor];
  if (all.length === 0) return null;

  const rawMinimumValue = Math.min(...all.map((item) => item.value));
  const rawMaximumValue = Math.max(...all.map((item) => item.value));
  const valueSpan = rawMaximumValue - rawMinimumValue;
  const valuePadding = valueSpan === 0 ? 1 : Math.max(valueSpan * 0.12, 0.5);
  const minimumValue = rawMinimumValue - valuePadding;
  const maximumValue = rawMaximumValue + valuePadding;

  const times = all.map((item) => Date.parse(item.sourceUpdatedAt));
  const rawMinimumTime = Math.min(...times);
  const rawMaximumTime = Math.max(...times);
  const minimumTime =
    rawMinimumTime === rawMaximumTime
      ? rawMinimumTime - 30 * 60 * 1000
      : rawMinimumTime;
  const maximumTime =
    rawMinimumTime === rawMaximumTime
      ? rawMaximumTime + 30 * 60 * 1000
      : rawMaximumTime;

  const mapSeries = (values: EnvironmentChartDatum[]) => {
    const points = values.map((item) => ({
      ...item,
      x: coordinate(
        Date.parse(item.sourceUpdatedAt),
        minimumTime,
        maximumTime,
        PADDING.left,
        WIDTH - PADDING.right
      ),
      y: coordinate(
        item.value,
        minimumValue,
        maximumValue,
        HEIGHT - PADDING.bottom,
        PADDING.top
      ),
    }));
    return { points, path: pathFor(points) };
  };

  return {
    width: WIDTH,
    height: HEIGHT,
    minimumValue,
    maximumValue,
    minimumTime,
    maximumTime,
    valueTicks: ticks(minimumValue, maximumValue, 4).map((value) => ({
      value,
      y: coordinate(
        value,
        minimumValue,
        maximumValue,
        HEIGHT - PADDING.bottom,
        PADDING.top
      ),
    })),
    timeTicks: ticks(minimumTime, maximumTime, 4).map((value) => ({
      value,
      x: coordinate(
        value,
        minimumTime,
        maximumTime,
        PADDING.left,
        WIDTH - PADDING.right
      ),
    })),
    series: {
      indoor: mapSeries(data.indoor),
      outdoor: mapSeries(data.outdoor),
    },
  };
}

export function createModularEnvironmentChartModel(
  input: ModularEnvironmentChartSeriesInput[],
  timeDomain?: EnvironmentChartTimeDomain
): ModularEnvironmentChartModel | null {
  const data = input.map((series, styleIndex) => ({
    ...series,
    styleIndex,
    data: validData(series.data),
  }));
  const all = data.flatMap((series) => series.data);
  if (all.length === 0) return null;
  const rawMinimumValue = Math.min(...all.map((item) => item.value));
  const rawMaximumValue = Math.max(...all.map((item) => item.value));
  const span = rawMaximumValue - rawMinimumValue;
  const padding = span === 0 ? 1 : Math.max(span * 0.12, 0.5);
  const minimumValue = rawMinimumValue - padding;
  const maximumValue = rawMaximumValue + padding;
  const times = all.map((item) => Date.parse(item.sourceUpdatedAt));
  const rawMinimumTime = Math.min(...times);
  const rawMaximumTime = Math.max(...times);
  const hasExplicitTimeDomain = timeDomain
    && Number.isFinite(timeDomain.minimumTime)
    && Number.isFinite(timeDomain.maximumTime)
    && timeDomain.minimumTime < timeDomain.maximumTime;
  const minimumTime = hasExplicitTimeDomain
    ? timeDomain.minimumTime
    : rawMinimumTime === rawMaximumTime ? rawMinimumTime - 30 * 60_000 : rawMinimumTime;
  const maximumTime = hasExplicitTimeDomain
    ? timeDomain.maximumTime
    : rawMinimumTime === rawMaximumTime ? rawMaximumTime + 30 * 60_000 : rawMaximumTime;
  const series = data.map((item) => {
    const points = item.data.map((datum) => ({
      ...datum,
      x: coordinate(Date.parse(datum.sourceUpdatedAt), minimumTime, maximumTime, PADDING.left, WIDTH - PADDING.right),
      y: coordinate(datum.value, minimumValue, maximumValue, HEIGHT - PADDING.bottom, PADDING.top),
    }));
    return { id: item.id, label: item.label, styleIndex: item.styleIndex, points, path: pathFor(points) };
  });
  return {
    width: WIDTH, height: HEIGHT, minimumValue, maximumValue, minimumTime, maximumTime,
    valueTicks: ticks(minimumValue, maximumValue, 4).map((value) => ({ value, y: coordinate(value, minimumValue, maximumValue, HEIGHT - PADDING.bottom, PADDING.top) })),
    timeTicks: ticks(minimumTime, maximumTime, 4).map((value) => ({ value, x: coordinate(value, minimumTime, maximumTime, PADDING.left, WIDTH - PADDING.right) })),
    series,
  };
}
