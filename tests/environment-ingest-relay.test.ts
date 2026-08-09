import assert from "node:assert/strict";
import test from "node:test";

import {
  createEnvironmentIngestRelay,
  type EnvironmentIngestRelayLogEvent,
} from "../supabase/functions/environment-ingest-relay/relay.ts";

const upstreamUrl = "https://fixed.example.test/api/environment/v2/ingest";
const token = "unit-test-device-token-with-more-than-32-characters";
const body = JSON.stringify({ secretSensorValue: 23.4 });

function request(options: {
  method?: string;
  authorization?: string | null;
  contentType?: string | null;
  body?: BodyInit | null;
  headers?: Record<string, string>;
} = {}) {
  const headers = new Headers(options.headers);
  if (options.authorization !== null) {
    headers.set(
      "authorization",
      options.authorization ?? `Bearer ${token}`
    );
  }
  if (options.contentType !== null) {
    headers.set("content-type", options.contentType ?? "application/json");
  }
  return new Request("https://relay.example.test/untrusted-path", {
    method: options.method ?? "POST",
    headers,
    body: options.body === undefined ? body : options.body,
  });
}

function handler(
  fetchImpl: typeof fetch,
  logs: EnvironmentIngestRelayLogEvent[] = [],
  upstreamTimeoutMs = 100
) {
  return createEnvironmentIngestRelay({
    upstreamUrl,
    upstreamTimeoutMs,
    fetchImpl,
    log(event) {
      logs.push(event);
    },
  });
}

const unreachableFetch: typeof fetch = async () => {
  throw new Error("fetch must not be called");
};

test("relay rejects invalid outer requests before fetching upstream", async () => {
  const relay = handler(unreachableFetch);

  const method = await relay(request({ method: "GET", body: null }));
  assert.equal(method.status, 405);
  assert.equal(method.headers.get("allow"), "POST");

  const missingToken = await relay(
    request({ authorization: null, contentType: "text/plain", body: "bad" })
  );
  assert.equal(missingToken.status, 401);
  assert.deepEqual(await missingToken.json(), {
    success: false,
    code: "UNAUTHORIZED",
  });

  const shortToken = await relay(request({ authorization: "Bearer short" }));
  assert.equal(shortToken.status, 401);

  const mediaType = await relay(request({ contentType: "text/plain" }));
  assert.equal(mediaType.status, 415);

  const jsonWithCharset = await handler(async () =>
    Response.json({ success: true })
  )(request({ contentType: "application/json; charset=utf-8" }));
  assert.equal(jsonWithCharset.status, 200);

  const declaredLarge = await relay(
    request({ headers: { "content-length": String(32 * 1024 + 1) } })
  );
  assert.equal(declaredLarge.status, 413);

  const streamedLarge = await relay(
    request({ body: "x".repeat(32 * 1024 + 1) })
  );
  assert.equal(streamedLarge.status, 413);
});

test("relay uses the fixed target and forwards only allowlisted request data", async () => {
  let capturedUrl = "";
  let capturedHeaders = new Headers();
  let capturedBody = "";
  const logs: EnvironmentIngestRelayLogEvent[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedHeaders = new Headers(init?.headers);
    capturedBody = new TextDecoder().decode(init?.body as ArrayBuffer);
    return new Response(
      JSON.stringify({ success: false, code: "INVALID_SCHEMA_VERSION" }),
      {
        status: 422,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "set-cookie": "private=1",
          server: "private-upstream",
        },
      }
    );
  };

  const response = await handler(fetchImpl, logs)(
    request({
      headers: {
        apikey: "must-not-forward",
        cookie: "must-not-forward",
        "x-upstream-url": "https://attacker.test",
      },
    })
  );

  assert.equal(capturedUrl, upstreamUrl);
  assert.deepEqual([...capturedHeaders.keys()].sort(), [
    "authorization",
    "content-type",
  ]);
  assert.equal(capturedHeaders.get("authorization"), `Bearer ${token}`);
  assert.equal(capturedHeaders.get("content-type"), "application/json");
  assert.equal(capturedBody, body);
  assert.equal(response.status, 422);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(response.headers.get("server"), null);
  assert.deepEqual(await response.json(), {
    success: false,
    code: "INVALID_SCHEMA_VERSION",
  });

  const serializedLogs = JSON.stringify(logs);
  assert.equal(serializedLogs.includes(token), false);
  assert.equal(serializedLogs.includes("secretSensorValue"), false);
  assert.deepEqual(logs, [
    {
      code: "UPSTREAM_RESPONSE",
      upstreamStatus: 422,
      durationMs: logs[0].durationMs,
      bodyBytes: new TextEncoder().encode(body).byteLength,
    },
  ]);
});

test("relay collapses upstream network and response failures", async () => {
  const network = await handler(async () => {
    throw new Error("private network detail");
  })(request());
  assert.equal(network.status, 503);
  assert.deepEqual(await network.json(), {
    success: false,
    code: "INGEST_RELAY_UNAVAILABLE",
  });

  const nonJson = await handler(async () =>
    new Response("private html", {
      status: 502,
      headers: { "content-type": "text/html" },
    })
  )(request());
  assert.equal(nonJson.status, 503);

  const malformedJson = await handler(async () =>
    new Response("not-json", {
      status: 502,
      headers: { "content-type": "application/json" },
    })
  )(request());
  assert.equal(malformedJson.status, 503);

  const oversized = await handler(async () =>
    new Response(JSON.stringify({ value: "x".repeat(32 * 1024) }), {
      status: 503,
      headers: { "content-type": "application/json" },
    })
  )(request());
  assert.equal(oversized.status, 503);
});

test("relay aborts an upstream request after its bounded timeout", async () => {
  const waitingFetch: typeof fetch = async (_input, init) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () =>
        reject(new DOMException("aborted", "AbortError"))
      );
    });

  const response = await handler(waitingFetch, [], 5)(request());
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    success: false,
    code: "INGEST_RELAY_UNAVAILABLE",
  });
});
