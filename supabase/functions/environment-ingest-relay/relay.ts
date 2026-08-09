const MAX_BODY_BYTES = 32 * 1024;
const MIN_TOKEN_LENGTH = 32;
const MAX_TOKEN_LENGTH = 256;

class BodyTooLargeError extends Error {}
class BodyReadError extends Error {}

export interface EnvironmentIngestRelayLogEvent {
  code: string;
  upstreamStatus: number | null;
  durationMs: number;
  bodyBytes: number;
}

export interface EnvironmentIngestRelayOptions {
  upstreamUrl: string;
  upstreamTimeoutMs: number;
  fetchImpl?: typeof fetch;
  log?: (event: EnvironmentIngestRelayLogEvent) => void;
}

function json(
  code: string,
  status: number,
  headers: Record<string, string> = {}
) {
  return new Response(JSON.stringify({ success: false, code }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

function bearerToken(authorization: string | null) {
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length);
  if (
    token.length < MIN_TOKEN_LENGTH ||
    token.length > MAX_TOKEN_LENGTH ||
    /\s/.test(token)
  ) {
    return null;
  }
  return token;
}

function isJson(contentType: string | null) {
  return (
    contentType?.split(";", 1)[0].trim().toLowerCase() ===
    "application/json"
  );
}

function declaredBodyLength(value: string | null) {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

async function readBoundedBody(
  body: ReadableStream<Uint8Array> | null,
  declaredLength: string | null
) {
  const declared = declaredBodyLength(declaredLength);
  if (declared !== null && declared > MAX_BODY_BYTES) {
    throw new BodyTooLargeError();
  }
  if (!body) return new ArrayBuffer(0);

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new BodyTooLargeError();
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof BodyTooLargeError) throw error;
    throw new BodyReadError();
  }

  const buffer = new ArrayBuffer(size);
  const output = new Uint8Array(buffer);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return buffer;
}

export function createEnvironmentIngestRelay(
  options: EnvironmentIngestRelayOptions
) {
  const fetchImpl = options.fetchImpl ?? fetch;

  return async (request: Request): Promise<Response> => {
    const startedAt = Date.now();
    const emit = (
      code: string,
      bodyBytes = 0,
      upstreamStatus: number | null = null
    ) =>
      options.log?.({
        code,
        upstreamStatus,
        durationMs: Date.now() - startedAt,
        bodyBytes,
      });

    if (request.method !== "POST") {
      emit("METHOD_NOT_ALLOWED");
      return json("METHOD_NOT_ALLOWED", 405, { allow: "POST" });
    }

    const authorization = request.headers.get("authorization");
    if (!bearerToken(authorization)) {
      emit("UNAUTHORIZED");
      return json("UNAUTHORIZED", 401);
    }

    if (!isJson(request.headers.get("content-type"))) {
      emit("UNSUPPORTED_MEDIA_TYPE");
      return json("UNSUPPORTED_MEDIA_TYPE", 415);
    }

    let requestBody: ArrayBuffer;
    try {
      requestBody = await readBoundedBody(
        request.body,
        request.headers.get("content-length")
      );
    } catch (error) {
      const tooLarge = error instanceof BodyTooLargeError;
      const code = tooLarge ? "PAYLOAD_TOO_LARGE" : "INVALID_BODY";
      emit(code);
      return json(code, tooLarge ? 413 : 400);
    }

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      options.upstreamTimeoutMs
    );
    try {
      const upstream = await fetchImpl(options.upstreamUrl, {
        method: "POST",
        headers: {
          authorization: authorization!,
          "content-type": "application/json",
        },
        body: requestBody,
        signal: controller.signal,
      });

      if (!isJson(upstream.headers.get("content-type"))) {
        await upstream.body?.cancel().catch(() => undefined);
        emit("UPSTREAM_INVALID_RESPONSE", requestBody.byteLength, upstream.status);
        return json("INGEST_RELAY_UNAVAILABLE", 503);
      }

      let responseBody: ArrayBuffer;
      try {
        responseBody = await readBoundedBody(
          upstream.body,
          upstream.headers.get("content-length")
        );
        JSON.parse(new TextDecoder().decode(responseBody));
      } catch {
        emit("UPSTREAM_INVALID_RESPONSE", requestBody.byteLength, upstream.status);
        return json("INGEST_RELAY_UNAVAILABLE", 503);
      }

      emit("UPSTREAM_RESPONSE", requestBody.byteLength, upstream.status);
      return new Response(responseBody, {
        status: upstream.status,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
        },
      });
    } catch {
      emit("UPSTREAM_UNAVAILABLE", requestBody.byteLength);
      return json("INGEST_RELAY_UNAVAILABLE", 503);
    } finally {
      clearTimeout(timeout);
    }
  };
}
