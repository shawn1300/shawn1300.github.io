interface StatusEnvironment {
  [key: string]: string | undefined;
  KOMARI_BASE_URL?: string;
  KOMARI_NODES?: string;
}

export interface StatusNodeConfig {
  id: string;
  name: string;
  flag: string | null;
  location: string | null;
  provider: string | null;
  os: string | null;
  arch: string | null;
}

export interface StatusConfig {
  baseUrl: string;
  nodes: StatusNodeConfig[];
}

export class StatusConfigError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "StatusConfigError";
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SECRET_FIELDS = new Set(["token", "agenttoken", "apikey", "secret"]);

function optionalText(value: unknown, maximumLength: number) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new StatusConfigError("STATUS_NODES_INVALID");
  const text = value.trim();
  if (!text || text.length > maximumLength) throw new StatusConfigError("STATUS_NODES_INVALID");
  return text;
}

function parseNode(value: unknown): StatusNodeConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new StatusConfigError("STATUS_NODES_INVALID");
  }

  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((field) => SECRET_FIELDS.has(field.toLowerCase()))) {
    throw new StatusConfigError("STATUS_NODES_CONTAINS_SECRET");
  }

  const id = optionalText(input.id, 64);
  const name = optionalText(input.name, 80);
  if (!id || !UUID_PATTERN.test(id) || !name) {
    throw new StatusConfigError("STATUS_NODES_INVALID");
  }

  return {
    id,
    name,
    flag: optionalText(input.flag, 16),
    location: optionalText(input.location, 80),
    provider: optionalText(input.provider, 80),
    os: optionalText(input.os, 120),
    arch: optionalText(input.arch, 40),
  };
}

export function parseStatusConfig(environment: StatusEnvironment): StatusConfig {
  if (!environment.KOMARI_BASE_URL || !environment.KOMARI_NODES) {
    throw new StatusConfigError("STATUS_NOT_CONFIGURED");
  }

  let url: URL;
  try {
    url = new URL(environment.KOMARI_BASE_URL);
  } catch {
    throw new StatusConfigError("STATUS_BASE_URL_INVALID");
  }
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.username ||
    url.password
  ) {
    throw new StatusConfigError("STATUS_BASE_URL_INVALID");
  }

  let rawNodes: unknown;
  try {
    rawNodes = JSON.parse(environment.KOMARI_NODES);
  } catch {
    throw new StatusConfigError("STATUS_NODES_INVALID");
  }
  if (!Array.isArray(rawNodes) || rawNodes.length === 0 || rawNodes.length > 50) {
    throw new StatusConfigError("STATUS_NODES_INVALID");
  }

  const nodes = rawNodes.map(parseNode);
  if (new Set(nodes.map((node) => node.id)).size !== nodes.length) {
    throw new StatusConfigError("STATUS_NODES_DUPLICATED");
  }

  return {
    baseUrl: url.toString().replace(/\/$/, ""),
    nodes,
  };
}

export function getStatusConfig() {
  return parseStatusConfig(process.env);
}
