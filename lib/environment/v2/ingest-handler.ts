import {
  type AuthenticatedEnvironmentSourceV2,
  bearerTokenDigest,
} from "@/lib/environment/v2/auth";
import {
  EnvironmentIngestValidationErrorV2,
  parseEnvironmentIngestPayloadV2,
} from "@/lib/environment/v2/ingest";
import { EnvironmentStoreErrorV2 } from "@/lib/environment/v2/store";
import type {
  EnvironmentIngestDeviceResultV2,
  ParsedEnvironmentIngestV2,
} from "@/types/environment-v2";

const MAX_BODY_BYTES = 32 * 1024;

class PayloadTooLargeErrorV2 extends Error {}

export interface EnvironmentIngestHandlerDependenciesV2 {
  authenticate(digest: string): Promise<AuthenticatedEnvironmentSourceV2 | null>;
  now?: () => Date;
  store(
    source: AuthenticatedEnvironmentSourceV2,
    payload: ParsedEnvironmentIngestV2,
    receivedAt: Date
  ): Promise<EnvironmentIngestDeviceResultV2[]>;
  log?: (event: {
    source: string | null;
    code: string;
    validDeviceCount: number;
    resultCount: number;
    durationMs: number;
  }) => void;
}

function json(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

async function readBody(request: Request) {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new PayloadTooLargeErrorV2();
  }
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new PayloadTooLargeErrorV2();
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

export function createEnvironmentIngestHandlerV2(
  dependencies: EnvironmentIngestHandlerDependenciesV2
) {
  return async (request: Request): Promise<Response> => {
    const started = Date.now();
    let source: AuthenticatedEnvironmentSourceV2 | null = null;
    const log = (code: string, validDeviceCount = 0, resultCount = 0) =>
      dependencies.log?.({
        source: source?.auditRef ?? null,
        code,
        validDeviceCount,
        resultCount,
        durationMs: Date.now() - started,
      });

    const digest = bearerTokenDigest(request.headers.get("authorization"));
    if (!digest) {
      log("UNAUTHORIZED");
      return json({ success: false, code: "UNAUTHORIZED" }, 401);
    }
    try {
      source = await dependencies.authenticate(digest);
    } catch {
      log("AUTH_UNAVAILABLE");
      return json({ success: false, code: "INGEST_UNAVAILABLE" }, 503);
    }
    if (!source) {
      log("UNAUTHORIZED");
      return json({ success: false, code: "UNAUTHORIZED" }, 401);
    }
    if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
      log("UNSUPPORTED_MEDIA_TYPE");
      return json({ success: false, code: "UNSUPPORTED_MEDIA_TYPE" }, 415);
    }

    let text: string;
    try {
      text = await readBody(request);
    } catch (error) {
      const code = error instanceof PayloadTooLargeErrorV2 ? "PAYLOAD_TOO_LARGE" : "INVALID_JSON";
      log(code);
      return json({ success: false, code }, code === "PAYLOAD_TOO_LARGE" ? 413 : 400);
    }
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      log("INVALID_JSON");
      return json({ success: false, code: "INVALID_JSON" }, 400);
    }
    const receivedAt = dependencies.now?.() ?? new Date();
    let payload: ParsedEnvironmentIngestV2;
    try {
      payload = parseEnvironmentIngestPayloadV2(raw, receivedAt);
    } catch (error) {
      const code = error instanceof EnvironmentIngestValidationErrorV2 ? error.code : "INVALID_PAYLOAD";
      log(code);
      return json({ success: false, code }, 422);
    }
    try {
      const results = await dependencies.store(source, payload, receivedAt);
      log("OK", payload.readings.length, results.length);
      return json({ success: true, results }, 200);
    } catch (error) {
      if (error instanceof EnvironmentStoreErrorV2 && error.code === "SOURCE_MAPPING_INVALID") {
        log("SOURCE_MAPPING_INVALID", payload.readings.length);
        return json({ success: false, code: "SOURCE_MAPPING_INVALID" }, 422);
      }
      log("STORAGE_UNAVAILABLE", payload.readings.length);
      return json({ success: false, code: "STORAGE_UNAVAILABLE" }, 503);
    }
  };
}
