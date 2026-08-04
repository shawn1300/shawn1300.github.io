import assert from "node:assert/strict";
import test from "node:test";

import { createEnvironmentIngestHandler } from "../lib/environment/handler";
import type { ParsedEnvironmentIngest } from "../types/environment";

const expectedToken = "test-ingest-token";
const fixedNow = new Date("2026-08-04T15:07:00.000Z");

function validPayload() {
  return {
    schemaVersion: 1,
    sentAt: "2026-08-04T15:06:59.000Z",
    readings: [
      {
        role: "indoor",
        temperatureC: 26.3,
        humidityPercent: 37.5,
        batteryPercent: 100,
        sourceUpdatedAt: "2026-08-04T15:06:30.000Z",
      },
      {
        role: "outdoor",
        temperatureC: 24.8,
        humidityPercent: 52.1,
        batteryPercent: null,
        sourceUpdatedAt: "2026-08-04T15:06:28.000Z",
      },
    ],
  };
}

function request(
  body: string,
  options: {
    token?: string;
    contentType?: string;
    contentLength?: string;
  } = {}
) {
  const headers = new Headers();
  headers.set("authorization", `Bearer ${options.token ?? expectedToken}`);
  headers.set("content-type", options.contentType ?? "application/json");
  if (options.contentLength) headers.set("content-length", options.contentLength);
  return new Request("https://example.test/api/environment/ingest", {
    method: "POST",
    headers,
    body,
  });
}

function handler(options: {
  token?: string;
  failStore?: boolean;
  captured?: ParsedEnvironmentIngest[];
} = {}) {
  return createEnvironmentIngestHandler({
    getExpectedToken: () => options.token,
    now: () => fixedNow,
    async store(payload) {
      options.captured?.push(payload);
      if (options.failStore) throw new Error("raw database failure secret");
      return [
        { role: "indoor", status: "stored" },
        { role: "outdoor", status: "duplicate" },
      ];
    },
    log: () => undefined,
  });
}

test("ingest route fails closed when its server secret is absent", async () => {
  const response = await handler()(request(JSON.stringify(validPayload())));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    success: false,
    code: "INGEST_NOT_CONFIGURED",
  });
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("ingest route authenticates before parsing any request payload", async () => {
  const secretBody = "raw-body-that-must-not-appear";
  const response = await handler({ token: expectedToken })(
    request(secretBody, { token: "wrong-token" })
  );
  assert.equal(response.status, 401);
  assert.equal((await response.text()).includes(secretBody), false);
});

test("ingest route accepts only JSON", async () => {
  const response = await handler({ token: expectedToken })(
    request(JSON.stringify(validPayload()), { contentType: "text/plain" })
  );
  assert.equal(response.status, 415);
});

test("ingest route rejects declared and streamed bodies over 16 KiB", async () => {
  const declared = await handler({ token: expectedToken })(
    request("{}", { contentLength: String(16 * 1024 + 1) })
  );
  assert.equal(declared.status, 413);

  const streamed = await handler({ token: expectedToken })(
    request(JSON.stringify({ value: "x".repeat(16 * 1024) }))
  );
  assert.equal(streamed.status, 413);
});

test("ingest route distinguishes malformed JSON from invalid readings", async () => {
  const malformed = await handler({ token: expectedToken })(request("{"));
  assert.equal(malformed.status, 400);

  const invalid = await handler({ token: expectedToken })(
    request(
      JSON.stringify({
        ...validPayload(),
        readings: [{ ...validPayload().readings[0], temperatureC: null }],
      })
    )
  );
  assert.equal(invalid.status, 422);
  assert.deepEqual(await invalid.json(), {
    success: false,
    code: "NO_VALID_READINGS",
  });
});

test("ingest route stores a validated payload and returns only fixed role results", async () => {
  const captured: ParsedEnvironmentIngest[] = [];
  const response = await handler({ token: expectedToken, captured })(
    request(JSON.stringify(validPayload()), {
      contentType: "application/json; charset=utf-8",
    })
  );

  assert.equal(response.status, 200);
  assert.equal(captured.length, 1);
  assert.deepEqual(await response.json(), {
    success: true,
    results: [
      { role: "indoor", status: "stored" },
      { role: "outdoor", status: "duplicate" },
    ],
  });
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("ingest route hides database errors and request secrets", async () => {
  const rawSecret = "request-secret-that-must-not-leak";
  const response = await handler({ token: expectedToken, failStore: true })(
    request(JSON.stringify({ ...validPayload(), rawSecret }))
  );
  assert.equal(response.status, 503);
  const text = await response.text();
  assert.equal(text.includes(rawSecret), false);
  assert.equal(text.includes("raw database failure secret"), false);
  assert.deepEqual(JSON.parse(text), {
    success: false,
    code: "STORAGE_UNAVAILABLE",
  });
});

