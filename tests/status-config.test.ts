import assert from "node:assert/strict";
import test from "node:test";

import { parseStatusConfig, StatusConfigError } from "../lib/status/config";

const NODE_ID = "11111111-1111-4111-8111-111111111111";

test("status config accepts public display metadata and normalizes the base URL", () => {
  const config = parseStatusConfig({
    KOMARI_BASE_URL: "https://monitor.example.com/",
    KOMARI_NODES: JSON.stringify([
      {
        id: NODE_ID,
        name: "Oracle Phoenix",
        flag: "🇺🇸",
        location: "Phoenix",
        provider: "Oracle Cloud",
        os: "Ubuntu",
        arch: "amd64",
      },
    ]),
  });

  assert.equal(config.baseUrl, "https://monitor.example.com");
  assert.equal(config.nodes[0].name, "Oracle Phoenix");
  assert.equal(config.nodes[0].location, "Phoenix");
});

test("status config rejects malformed, duplicate, and secret-bearing nodes", () => {
  for (const nodes of [
    "not-json",
    "[]",
    JSON.stringify([{ id: "not-a-uuid", name: "Broken" }]),
    JSON.stringify([{ id: NODE_ID, name: "A" }, { id: NODE_ID, name: "B" }]),
    JSON.stringify([{ id: NODE_ID, name: "Unsafe", token: "agent-secret" }]),
    JSON.stringify([{ id: NODE_ID, name: "Unsafe", ApiKey: "admin-secret" }]),
  ]) {
    assert.throws(
      () => parseStatusConfig({ KOMARI_BASE_URL: "https://monitor.example.com", KOMARI_NODES: nodes }),
      StatusConfigError
    );
  }
});

test("status config requires both server-side environment variables", () => {
  assert.throws(() => parseStatusConfig({}), (error: unknown) => {
    return error instanceof StatusConfigError && error.code === "STATUS_NOT_CONFIGURED";
  });
});
