export class BurnRequestError extends Error {
  constructor(readonly status: number) {
    super("Invalid burn request");
  }
}

export function burnJson(body: Record<string, unknown>, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function burnFailure(operation: string, error: unknown) {
  if (error instanceof BurnRequestError) {
    return burnJson({ code: "INVALID_REQUEST" }, error.status);
  }

  console.error(`Burn message ${operation} failed`);
  return burnJson({ code: "SERVICE_UNAVAILABLE" }, 503);
}

export async function readBurnJson(request: Request, maxBytes: number): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") throw new BurnRequestError(415);
  if (!request.body) throw new BurnRequestError(400);
  if (Number(request.headers.get("content-length")) > maxBytes) throw new BurnRequestError(413);

  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let text = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;

      if (size > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new BurnRequestError(413);
      }

      text += decoder.decode(value, { stream: true });
    }

    const body: unknown = JSON.parse(text + decoder.decode());
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new BurnRequestError(400);
    }

    return body as Record<string, unknown>;
  } catch (error) {
    throw error instanceof BurnRequestError ? error : new BurnRequestError(400);
  } finally {
    reader.releaseLock();
  }
}
