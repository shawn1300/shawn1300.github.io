# Burn After Reading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal** — Give the site owner a way to create one-time text links that recipients can open without signing in.

**Architecture** — The browser encrypts and decrypts with AES-GCM. The app verifies the site's owner for creation and retrieves ciphertext using an atomic Postgres delete for reading.

**Tech stack** — Next.js App Router, React, next-intl, Web Crypto, Supabase PostgREST and Postgres.

## 1. Define and verify the message protocol

- [x] Add `tests/burn-protocol.test.ts` covering multilingual text, exact UTF-8 size limits, ciphertext integrity, credential format and malformed links.
- [x] Run `npx tsx --test tests/burn-protocol.test.ts`. Expect missing modules until the protocol exists.
- [x] Add `lib/burn/protocol.ts` and `lib/burn/crypto.ts`. Use `v1.<token>.<key>` in the URL fragment, a 32-byte random token and AES key, a 12-byte IV and SHA-256 for the token digest. Cap plaintext at 16 KiB. Accept the expiry choices `1h`, `24h` and `7d`.
- [x] Rerun the focused tests and expect all assertions to pass.

## 2. Store, claim and remove messages

- [x] Generate the `burn_messages` migration with the Supabase CLI. Key the private records by digest and index expiry. Grant only the necessary operations to the service role, include RLS and explicitly revoke public function privileges. Use `DELETE ... WHERE token_digest = p_token_digest AND expires_at > statement_timestamp() RETURNING ...` for the single-claim operation.
- [x] Add `lib/burn/owner.ts`, `lib/burn/http.ts`, the POST routes in `app/api/burn/` and the GET route in `app/api/cron/burn-cleanup/route.ts`. Authenticate and match the configured owner before parsing create requests. Bound request bytes, validate the stored payload and respond with no-store. Match the existing Cron authorization protocol.
- [x] Verify the migration with isolated Postgres, including concurrent claims, expired rows, cleanup and grants. Exercise the endpoints using a local fixture and confirm GET cannot claim a message.

## 3. Add localized creation and reading pages

- [x] Add `app/[locale]/(blog)/admin/burn/page.tsx` and its creation form. Reuse the admin layout, show the expiry selector, offer copy and keep the form usable after an error.
- [x] Add `app/[locale]/(burn)/burn/page.tsx` and its reader. Render the confirmation before calling the API. Read the URL fragment in the browser and show the decrypted result as plain text. Add no-index and no-referrer metadata.
- [x] Add the admin sidebar entry and message catalogs for zh-CN, en and ja. Add owner configuration to `.env.example`, daily cleanup to `vercel.json` and setup details to the README.
- [x] Run `npm test`, `npx tsc --noEmit` and targeted ESLint. Build the app and check the recipient flow in a browser, including mobile layout and locale redirects.

全量测试 110 项通过，状态页现有的 `Status.title` 文案断言失败。新增测试、TypeScript、改动文件的 ESLint、生产构建和本地端到端验证均通过。
