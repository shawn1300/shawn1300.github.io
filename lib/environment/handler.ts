import {
  EnvironmentIngestValidationError,
  bearerTokenMatches,
  parseEnvironmentIngestPayload,
} from "@/lib/environment/ingest";
import type {
  EnvironmentIngestRoleResult,
  ParsedEnvironmentIngest,
} from "@/types/environment";

const MAX_BODY_BYTES = 16 * 1024;

class PayloadTooLargeError extends Error {}

export interface EnvironmentIngestHandlerDependencies {
  getExpectedToken(): string | undefined;
  now?: () => Date;
  store(
    payload: ParsedEnvironmentIngest,
    receivedAt: Date
  ): Promise<EnvironmentIngestRoleResult[]>;
  log?: (event: {
    code: string;
    validRoleCount: number;
    durationMs: number;
  }) => void;
}

function jsonResponse(
  body: Record<string, unknown>,
  status: number
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

async function readLimitedBody(request: Request): Promise<string> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new PayloadTooLargeError();
  }
  if (!request.body) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new PayloadTooLargeError();
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

function mediaType(contentType: string | null): string {
  return contentType?.split(";", 1)[0].trim().toLowerCase() ?? "";
}

export function createEnvironmentIngestHandler(
  dependencies: EnvironmentIngestHandlerDependencies
) {
  return async function environmentIngest(request: Request): Promise<Response> {
    const startedAt = Date.now();
    const log = (
      code: string,
      validRoleCount = 0
    ): void =>
      dependencies.log?.({
        code,
        validRoleCount,
        durationMs: Date.now() - startedAt,
      });

    const expectedToken = dependencies.getExpectedToken();
    if (!expectedToken) {
      log("INGEST_NOT_CONFIGURED");
      return jsonResponse(
        { success: false, code: "INGEST_NOT_CONFIGURED" },
        503
      );
    }
    if (
      !bearerTokenMatches(request.headers.get("authorization"), expectedToken)
    ) {
      log("UNAUTHORIZED");
      return jsonResponse({ success: false, code: "UNAUTHORIZED" }, 401);
    }
    if (mediaType(request.headers.get("content-type")) !== "application/json") {
      log("UNSUPPORTED_MEDIA_TYPE");
      return jsonResponse(
        { success: false, code: "UNSUPPORTED_MEDIA_TYPE" },
        415
      );
    }

    let text: string;
    try {
      text = await readLimitedBody(request);
    } catch (error) {
      if (error instanceof PayloadTooLargeError) {
        log("PAYLOAD_TOO_LARGE");
        return jsonResponse(
          { success: false, code: "PAYLOAD_TOO_LARGE" },
          413
        );
      }
      log("BODY_READ_FAILED");
      return jsonResponse({ success: false, code: "INVALID_JSON" }, 400);
    }

    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      log("INVALID_JSON");
      return jsonResponse({ success: false, code: "INVALID_JSON" }, 400);
    }

    const receivedAt = dependencies.now?.() ?? new Date();
    let payload: ParsedEnvironmentIngest;
    try {
      payload = parseEnvironmentIngestPayload(raw, receivedAt);
    } catch (error) {
      const code =
        error instanceof EnvironmentIngestValidationError
          ? error.code
          : "INVALID_PAYLOAD";
      log(code);
      return jsonResponse({ success: false, code }, 422);
    }

    try {
      const results = await dependencies.store(payload, receivedAt);
      log("OK", payload.readings.length);
      return jsonResponse({ success: true, results }, 200);
    } catch {
      log("STORAGE_UNAVAILABLE", payload.readings.length);
      return jsonResponse(
        { success: false, code: "STORAGE_UNAVAILABLE" },
        503
      );
    }
  };
}

