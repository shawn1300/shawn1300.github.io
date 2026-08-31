import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const projectFile = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("status route is isolated from the blog shell and private to robots", () => {
  const layout = projectFile("app/[locale]/(status)/status/layout.tsx");
  assert.match(layout, /ThemeProvider/);
  assert.match(layout, /index:\s*false/);
  assert.match(layout, /follow:\s*false/);
  for (const shell of ["Header", "Footer", "MusicProvider", "BackToTop"]) {
    assert.doesNotMatch(layout, new RegExp(shell));
  }
});

test("status page server-renders a snapshot and refreshes the safe same-origin endpoint", () => {
  const page = projectFile("app/[locale]/(status)/status/page.tsx");
  const dashboard = projectFile("app/[locale]/(status)/status/status-dashboard.tsx");
  const route = projectFile("app/api/status/route.ts");

  assert.match(page, /getStatusSnapshot/);
  assert.match(page, /dynamic\s*=\s*["']force-dynamic["']/);
  assert.match(dashboard, /fetch\(["']\/api\/status["']/);
  assert.match(dashboard, /15_000/);
  assert.match(dashboard, /ThemeToggle/);
  assert.match(dashboard, /LanguageSwitcher/);
  assert.match(route, /s-maxage=10/);
});

test("all locales provide the complete Status namespace", () => {
  const required = [
    "metadataTitle",
    "title",
    "subtitle",
    "onlineServers",
    "aggregateTraffic",
    "serverSummary",
    "online",
    "offline",
    "cpu",
    "memory",
    "disk",
    "uptime",
    "requestFailed",
  ];

  for (const locale of ["zh-CN", "en", "ja"]) {
    const messages = JSON.parse(projectFile("messages/" + locale + ".json"));
    for (const key of required) {
      assert.equal(typeof messages.Status?.[key], "string", locale + " is missing Status." + key);
    }
  }
});

test("future node configuration is documented without encouraging secret reuse", () => {
  const documentation = projectFile("docs/status-monitoring.md");
  assert.match(documentation, /以后新增一台机器/);
  assert.match(documentation, /KOMARI_NODES/);
  assert.match(documentation, /重新部署/);
  assert.match(documentation, /不要.*Agent Token/);
});
