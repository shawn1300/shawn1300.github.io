import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createEnvironmentChartModel } from "../lib/environment/chart";

const projectFile = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("all locales provide the complete Environment message namespace", () => {
  const required = [
    "metadataTitle",
    "title",
    "indoor",
    "outdoor",
    "temperature",
    "humidity",
    "battery",
    "fresh",
    "delayed",
    "unavailable",
    "range24h",
    "range7d",
    "temperatureTrend",
    "humidityTrend",
    "requestFailed",
  ];

  for (const locale of ["zh-CN", "en", "ja"]) {
    const messages = JSON.parse(projectFile(`messages/${locale}.json`));
    assert.ok(messages.Environment, `${locale} is missing Environment`);
    for (const key of required) {
      assert.equal(
        typeof messages.Environment[key],
        "string",
        `${locale} is missing Environment.${key}`
      );
    }
  }
});

test("environment route is isolated from the blog shell and private to robots", () => {
  const layout = projectFile(
    "app/[locale]/(environment)/environment/layout.tsx"
  );
  assert.match(layout, /ThemeProvider/);
  assert.match(layout, /index:\s*false/);
  assert.match(layout, /follow:\s*false/);
  for (const blogShell of [
    "Header",
    "Footer",
    "MusicProvider",
    "BackToTop",
  ]) {
    assert.doesNotMatch(layout, new RegExp(blogShell));
  }

  const sitemap = projectFile("app/sitemap.ts");
  assert.doesNotMatch(sitemap, /["'`]\/environment["'`]/);
});

test("environment page server-renders a real snapshot and the client refreshes safely", () => {
  const page = projectFile(
    "app/[locale]/(environment)/environment/page.tsx"
  );
  const dashboard = projectFile(
    "app/[locale]/(environment)/environment/environment-dashboard.tsx"
  );

  assert.match(page, /createEnvironmentPublicService/);
  assert.match(page, /dynamic\s*=\s*["']force-dynamic["']/);
  assert.match(dashboard, /\/api\/environment\/latest\?location=home/);
  assert.match(dashboard, /\/api\/environment\/history\?location=home&range=/);
  assert.match(dashboard, /60_000/);
  assert.match(dashboard, /ThemeToggle/);
  assert.match(dashboard, /LanguageSwitcher/);
});

test("dashboard keeps chart labels outside the stretched SVG and preserves the last history while switching ranges", () => {
  const dashboard = projectFile(
    "app/[locale]/(environment)/environment/environment-dashboard.tsx"
  );
  const css = projectFile(
    "app/[locale]/(environment)/environment/environment.module.css"
  );

  // preserveAspectRatio="none" 会非均匀拉伸 viewBox 内的文字，
  // 标签必须是 SVG 外的 HTML 元素（百分比定位对齐）
  assert.doesNotMatch(dashboard, /<text/);
  assert.match(dashboard, /aria-hidden="true"/);
  assert.match(dashboard, /valueLabels/);
  assert.match(dashboard, /timeLabels/);
  assert.match(css, /\.chartStage \{/);
  assert.match(css, /pointer-events: none/);

  // 切换范围期间保留上一次快照，禁止按 range 判断把图表清成空态
  assert.doesNotMatch(dashboard, /history\?\.range === range/);

  // 温度轴单位与读数区一致
  assert.match(dashboard, /unit="°C"/);
});

test("chart model shares a padded domain and distinguishes both series", () => {
  const model = createEnvironmentChartModel({
    indoor: [
      { sourceUpdatedAt: "2026-08-04T15:00:00.000Z", value: 25 },
      { sourceUpdatedAt: "2026-08-04T16:00:00.000Z", value: 27 },
    ],
    outdoor: [
      { sourceUpdatedAt: "2026-08-04T15:00:00.000Z", value: 20 },
      { sourceUpdatedAt: "2026-08-04T16:00:00.000Z", value: 22 },
    ],
  });

  assert.ok(model);
  assert.ok(model.minimumValue < 20);
  assert.ok(model.maximumValue > 27);
  assert.match(model.series.indoor.path, /^M /);
  assert.match(model.series.outdoor.path, /^M /);
  assert.notEqual(model.series.indoor.path, model.series.outdoor.path);
  assert.equal(model.valueTicks.length, 4);
  assert.equal(model.timeTicks.length, 4);
});

test("chart model is empty without valid real points and centers one reading", () => {
  assert.equal(
    createEnvironmentChartModel({ indoor: [], outdoor: [] }),
    null
  );

  const one = createEnvironmentChartModel({
    indoor: [
      { sourceUpdatedAt: "2026-08-04T15:00:00.000Z", value: 25 },
    ],
    outdoor: [],
  });
  assert.ok(one);
  assert.equal(one.series.indoor.points[0].x, 418);
  assert.equal(Number.isFinite(one.series.indoor.points[0].y), true);
});
