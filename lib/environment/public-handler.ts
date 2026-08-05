import type {
  EnvironmentHistoryRange,
  EnvironmentHistoryResponse,
  EnvironmentLatestResponse,
} from "@/types/environment";

const PUBLIC_LOCATION = "home";
const HISTORY_RANGES = new Set<EnvironmentHistoryRange>(["24h", "7d"]);

interface PublicHandlerLogEvent {
  code: string;
  durationMs: number;
}

interface LatestHandlerDependencies {
  getLatest(location: string): Promise<EnvironmentLatestResponse | null>;
  log?: (event: PublicHandlerLogEvent) => void;
}

interface HistoryHandlerDependencies {
  getHistory(
    location: string,
    range: EnvironmentHistoryRange
  ): Promise<EnvironmentHistoryResponse | null>;
  log?: (event: PublicHandlerLogEvent) => void;
}

function jsonResponse(
  body: unknown,
  status: number,
  cacheControl = "no-store"
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": cacheControl,
    },
  });
}

function errorResponse(
  code: "INVALID_REQUEST" | "LOCATION_NOT_FOUND" | "SERVICE_UNAVAILABLE",
  status: number
) {
  return jsonResponse({ success: false, code }, status);
}

function singleParameter(searchParams: URLSearchParams, name: string) {
  const values = searchParams.getAll(name);
  return values.length === 1 && values[0] ? values[0] : null;
}

function requestedLocation(searchParams: URLSearchParams) {
  return singleParameter(searchParams, "location");
}

function createLogger(
  startedAt: number,
  log: ((event: PublicHandlerLogEvent) => void) | undefined
) {
  return (code: string) =>
    log?.({ code, durationMs: Date.now() - startedAt });
}

export function createEnvironmentLatestHandler(
  dependencies: LatestHandlerDependencies
) {
  return async function environmentLatest(request: Request): Promise<Response> {
    const record = createLogger(Date.now(), dependencies.log);
    const location = requestedLocation(new URL(request.url).searchParams);
    if (!location) {
      record("INVALID_REQUEST");
      return errorResponse("INVALID_REQUEST", 400);
    }
    if (location !== PUBLIC_LOCATION) {
      record("LOCATION_NOT_FOUND");
      return errorResponse("LOCATION_NOT_FOUND", 404);
    }

    try {
      const result = await dependencies.getLatest(location);
      if (!result) {
        record("LOCATION_NOT_FOUND");
        return errorResponse("LOCATION_NOT_FOUND", 404);
      }
      record("OK");
      return jsonResponse(
        result,
        200,
        "public, max-age=0, s-maxage=60, stale-while-revalidate=60"
      );
    } catch {
      record("SERVICE_UNAVAILABLE");
      return errorResponse("SERVICE_UNAVAILABLE", 503);
    }
  };
}

export function createEnvironmentHistoryHandler(
  dependencies: HistoryHandlerDependencies
) {
  return async function environmentHistory(request: Request): Promise<Response> {
    const record = createLogger(Date.now(), dependencies.log);
    const searchParams = new URL(request.url).searchParams;
    const location = requestedLocation(searchParams);
    const range = singleParameter(searchParams, "range");

    if (!location || !range || !HISTORY_RANGES.has(range as EnvironmentHistoryRange)) {
      record("INVALID_REQUEST");
      return errorResponse("INVALID_REQUEST", 400);
    }
    if (location !== PUBLIC_LOCATION) {
      record("LOCATION_NOT_FOUND");
      return errorResponse("LOCATION_NOT_FOUND", 404);
    }

    try {
      const result = await dependencies.getHistory(
        location,
        range as EnvironmentHistoryRange
      );
      if (!result) {
        record("LOCATION_NOT_FOUND");
        return errorResponse("LOCATION_NOT_FOUND", 404);
      }
      record("OK");
      return jsonResponse(
        result,
        200,
        "public, max-age=0, s-maxage=300, stale-while-revalidate=300"
      );
    } catch {
      record("SERVICE_UNAVAILABLE");
      return errorResponse("SERVICE_UNAVAILABLE", 503);
    }
  };
}

