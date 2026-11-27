import assert from "node:assert/strict";
import test from "node:test";

import { decryptBurnMessage, encryptBurnMessage, hashBurnToken } from "../lib/burn/crypto";
import { MAX_MESSAGE_BYTES, parseBurnFragment, readBurnCiphertext } from "../lib/burn/protocol";

test("encrypts multilingual text and preserves the original whitespace", async () => {
  const plaintext = "\uFEFF  你好\n日本語 🔥\n ";
  const { envelope, fragment } = await encryptBurnMessage(plaintext);
  const link = parseBurnFragment(fragment);
  assert.ok(link);
  assert.equal(await hashBurnToken(link.token), envelope.tokenDigest);
  assert.equal(await decryptBurnMessage(envelope, link.key), plaintext);
  assert.equal(JSON.stringify(envelope).includes(plaintext), false);
  assert.equal(JSON.stringify(envelope).includes(link.key), false);
  assert.equal(JSON.stringify(envelope).includes(link.token), false);
});

test("authenticates ciphertext and rejects altered messages", async () => {
  const { envelope, fragment } = await encryptBurnMessage("secret");
  const link = parseBurnFragment(fragment);
  assert.ok(link);
  const prefix = envelope.ciphertext[0] === "A" ? "B" : "A";
  const ciphertext = prefix + envelope.ciphertext.slice(1);
  await assert.rejects(decryptBurnMessage({ ...envelope, ciphertext }, link.key));
});

test("enforces the 16 KiB UTF-8 limit before encryption", async () => {
  const plaintext = "🔥".repeat(MAX_MESSAGE_BYTES / 4);
  const { envelope } = await encryptBurnMessage(plaintext);
  assert.ok(readBurnCiphertext(envelope));
  await assert.rejects(encryptBurnMessage(plaintext + "a"), RangeError);
  await assert.rejects(encryptBurnMessage(" \t\n "), RangeError);
});

test("rejects malformed link fragments and encrypted envelopes", async () => {
  const { envelope, fragment } = await encryptBurnMessage("note");
  assert.ok(parseBurnFragment(fragment));
  assert.equal(parseBurnFragment(fragment.replace("#v1.", "#v2.")), null);
  assert.equal(parseBurnFragment(fragment.slice(0, -1)), null);
  assert.equal(parseBurnFragment(fragment + ".extra"), null);
  assert.equal(parseBurnFragment(fragment.slice(0, -1) + "B"), null);
  assert.equal(readBurnCiphertext({ ...envelope, ciphertext: "A".repeat(22) }), null);
  assert.equal(readBurnCiphertext({ ...envelope, iv: "bad" }), null);
});
