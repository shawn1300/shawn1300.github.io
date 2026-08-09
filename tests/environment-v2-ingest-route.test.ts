import assert from "node:assert/strict";
import test from "node:test";

import { createEnvironmentIngestHandlerV2 } from "../lib/environment/v2/ingest-handler";

const token = "test-source-token-with-more-than-32-characters";
const body = JSON.stringify({
  schemaVersion: 2,
  sentAt: "2026-08-09T01:09:00.000Z",
  readings: [{
    device: "garden-air",
    sourceUpdatedAt: "2026-08-09T01:08:00.000Z",
    metrics: { temperatureC: 21.5 },
  }],
});

function request(value = body, suppliedToken = token, contentType = "application/json") {
  return new Request("https://example.test/api/environment/v2/ingest", {
    method: "POST",
    headers: { authorization: `Bearer ${suppliedToken}`, "content-type": contentType },
    body: value,
  });
}

function handler(options: { authenticated?: boolean; fail?: boolean } = {}) {
  return createEnvironmentIngestHandlerV2({
    now: () => new Date("2026-08-09T01:10:00.000Z"),
    async authenticate() {
      return options.authenticated ? { id: "source-id", auditRef: "audit-ref" } : null;
    },
    async store() {
      if (options.fail) throw new Error("secret database error");
      return [{ device: "garden-air", metrics: [{ metric: "temperatureC", status: "stored" }] }];
    },
  });
}

test("v2 route authenticates before media type and JSON parsing", async () => {
  const response = await handler()(request("private malformed body", "wrong", "text/plain"));
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { success: false, code: "UNAUTHORIZED" });
});

test("v2 route accepts JSON and returns only fixed metric results", async () => {
  const response = await handler({ authenticated: true })(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), {
    success: true,
    results: [{ device: "garden-air", metrics: [{ metric: "temperatureC", status: "stored" }] }],
  });
});

test("v2 route bounds bodies and redacts repository failures", async () => {
  const large = await handler({ authenticated: true })(request("x".repeat(32 * 1024 + 1)));
  assert.equal(large.status, 413);
  const failed = await handler({ authenticated: true, fail: true })(request());
  assert.equal(failed.status, 503);
  assert.deepEqual(await failed.json(), { success: false, code: "STORAGE_UNAVAILABLE" });
});
