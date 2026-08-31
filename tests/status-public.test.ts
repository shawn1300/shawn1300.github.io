import assert from "node:assert/strict";
import test from "node:test";

import { parseStatusConfig } from "../lib/status/config";
import { getStatusSnapshot } from "../lib/status/komari";

const ONLINE_ID = "11111111-1111-4111-8111-111111111111";
const FAILED_ID = "22222222-2222-4222-8222-222222222222";
const NOW = Date.parse("2026-08-31T12:00:30.000Z");

test("status snapshot selects the newest point, calculates usage, and isolates node failures", async () => {
  const config = parseStatusConfig({
    KOMARI_BASE_URL: "https://monitor.example.com",
    KOMARI_API_KEY: "dashboard-secret",
    KOMARI_NODES: JSON.stringify([
      { id: ONLINE_ID, name: "Oracle Phoenix", flag: "🇺🇸", location: "Phoenix" },
      { id: FAILED_ID, name: "Oracle Tokyo", flag: "🇯🇵", location: "Tokyo" },
    ]),
  });
  let authorization: string | null = null;
  const mockFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    authorization = new Headers(init?.headers).get("authorization");
    if (String(input).includes(FAILED_ID)) throw new Error("upstream token detail must stay private");
    return Response.json({
      status: "success",
      message: "",
      data: [
        {
          cpu: { usage: 70 },
          ram: { used: 80, total: 100 },
          disk: { used: 90, total: 100 },
          network: { up: 1, down: 2, totalUp: 3, totalDown: 4 },
          uptime: 100,
          process: 10,
          updated_at: "2026-08-31T11:59:00.000Z",
        },
        {
          cpu: { usage: 12.5 },
          ram: { used: 50, total: 100 },
          disk: { used: 25, total: 100 },
          network: { up: 1024, down: 2048, totalUp: 4096, totalDown: 8192 },
          uptime: 86461,
          process: 42,
          updated_at: "2026-08-31T12:00:20.000Z",
        },
      ],
    });
  }) as typeof fetch;

  const result = await getStatusSnapshot({ config, fetchImpl: mockFetch, now: NOW });

  assert.equal(result.summary.total, 2);
  assert.equal(result.summary.online, 1);
  assert.equal(result.summary.regions, 2);
  assert.equal(result.summary.networkUp, 1024);
  assert.equal(result.degraded, true);
  assert.equal(result.nodes[0].name, "Oracle Phoenix");
  assert.equal(result.nodes[0].cpuPercent, 12.5);
  assert.equal(result.nodes[0].memory.percent, 50);
  assert.equal(result.nodes[0].disk.percent, 25);
  assert.equal(result.nodes[0].online, true);
  assert.equal(result.nodes[1].online, false);
  assert.equal(authorization, "Bearer dashboard-secret");

  const publicJson = JSON.stringify(result).toLowerCase();
  for (const forbidden of ["uuid", ONLINE_ID, FAILED_ID, "agent-secret", "dashboard-secret", "token", "ipv4", "ipv6"]) {
    assert.equal(publicJson.includes(forbidden.toLowerCase()), false);
  }
});

test("a valid but stale Komari point is displayed as offline", async () => {
  const config = parseStatusConfig({
    KOMARI_BASE_URL: "https://monitor.example.com",
    KOMARI_NODES: JSON.stringify([{ id: ONLINE_ID, name: "Old node" }]),
  });
  const mockFetch = (async () => Response.json({
    status: "success",
    data: [{ cpu: { usage: 1 }, updated_at: "2026-08-31T11:55:00.000Z" }],
  })) as typeof fetch;

  const result = await getStatusSnapshot({ config, fetchImpl: mockFetch, now: NOW });
  assert.equal(result.degraded, false);
  assert.equal(result.nodes[0].online, false);
  assert.equal(result.nodes[0].cpuPercent, 1);
});
