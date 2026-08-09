import assert from "node:assert/strict";
import test from "node:test";

import { createEnvironmentHistoryHandlerV2, createEnvironmentLatestHandlerV2, createEnvironmentLocationsHandlerV2 } from "../lib/environment/v2/public-handler";

test("v2 public routes validate slugs, ranges and cache bounds", async () => {
  const locations = await createEnvironmentLocationsHandlerV2({ list: async () => [] })();
  assert.equal(locations.status, 200);
  assert.match(locations.headers.get("cache-control") ?? "", /s-maxage=60/);

  const latest = createEnvironmentLatestHandlerV2({ latest: async () => null });
  const invalid = await latest(new Request("https://example.test"), { params: Promise.resolve({ slug: "Bad Slug" }) });
  assert.equal(invalid.status, 400);
  const missing = await latest(new Request("https://example.test"), { params: Promise.resolve({ slug: "missing" }) });
  assert.equal(missing.status, 404);

  const history = createEnvironmentHistoryHandlerV2({ history: async () => null });
  const duplicate = await history(new Request("https://example.test?range=24h&range=7d"), { params: Promise.resolve({ slug: "home" }) });
  assert.equal(duplicate.status, 400);
});
