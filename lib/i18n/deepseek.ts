import type { TranslationLocale } from "@/types";

export interface TranslationItem {
  id: string;
  text: string;
}

export interface DeepSeekTranslationOptions {
  onRateLimit?: () => void;
  onTimeout?: () => void;
  deadline?: number;
}

export class DeepSeekDeadlineError extends Error {
  constructor(readonly translated = new Map<string, string>()) {
    super("DeepSeek request skipped because the translation deadline is near");
    this.name = "DeepSeekDeadlineError";
  }
}

export class DeepSeekPartialError extends Error {
  constructor(
    message: string,
    readonly translated: Map<string, string>
  ) {
    super(message);
    this.name = "DeepSeekPartialError";
  }
}

const targetNames: Record<TranslationLocale, string> = {
  en: "natural English",
  ja: "natural Japanese",
};

type ProtectedText = {
  text: string;
  placeholders: string[];
};

type BatchAttempt = {
  translated: Map<string, string>;
  unresolved: Map<string, string>;
};

class DeepSeekResponseError extends Error {}

class DeepSeekTimeoutError extends DeepSeekResponseError {
  constructor() {
    super("DeepSeek request timed out after 45 seconds");
    this.name = "DeepSeekTimeoutError";
  }
}

class DeepSeekHttpError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "DeepSeekHttpError";
  }
}

function protectMarkdown(text: string): ProtectedText {
  const placeholders: string[] = [];
  const protect = (value: string) => {
    const token = `⟦PROTECTED_${placeholders.length}⟧`;
    placeholders.push(value);
    return token;
  };

  let result = text;
  result = result.replace(/`+[^`\n]+`+/g, protect);
  result = result.replace(/(?<=\]\()[^\s)]+(?=\))/g, protect);
  result = result.replace(/https?:\/\/[^\s<>)]+/g, protect);
  result = result.replace(/<\/?[A-Za-z][^>]*>/g, protect);

  return { text: result, placeholders };
}

function restoreAndValidate(value: string, protectedText: ProtectedText): string {
  let restored = value;
  protectedText.placeholders.forEach((original, index) => {
    const token = `⟦PROTECTED_${index}⟧`;
    const matches = restored.split(token).length - 1;
    if (matches !== 1) {
      throw new Error(`DeepSeek changed protected Markdown token ${token}`);
    }
    restored = restored.replace(token, original);
  });
  if (/⟦PROTECTED_\d+⟧/.test(restored)) {
    throw new Error("DeepSeek returned an unknown protected Markdown token");
  }
  return restored;
}

function parseJsonContent(content: string): unknown {
  const trimmed = content.trim();
  const unfenced = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
    : trimmed;
  return JSON.parse(unfenced);
}

function retryable(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

async function wait(milliseconds: number) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function requestBatch(
  locale: TranslationLocale,
  items: TranslationItem[],
  options: DeepSeekTranslationOptions
): Promise<BatchAttempt> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const model = process.env.DEEPSEEK_TRANSLATION_MODEL;
  const baseUrl = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(
    /\/$/,
    ""
  );
  if (!apiKey || !model) {
    throw new Error("DeepSeek translation environment variables are not configured");
  }

  const protectedById = new Map(
    items.map((item) => [item.id, protectMarkdown(item.text)])
  );
  const requestItems = items.map((item) => ({
    id: item.id,
    text: protectedById.get(item.id)!.text,
  }));
  const systemPrompt = [
    `Translate every item from Simplified Chinese into ${targetNames[locale]}.`,
    "Return JSON only: {\"translations\":[{\"id\":\"unchanged id\",\"text\":\"translation\"}]}",
    "Keep each id exactly unchanged and return every item exactly once.",
    "Preserve Markdown syntax, whitespace intent, placeholders such as ⟦PROTECTED_0⟧, and factual meaning.",
    "Do not translate code identifiers, URLs, file paths, product names, or add explanations.",
  ].join(" ");

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const remainingTime = options.deadline
      ? options.deadline - Date.now() - 5_000
      : 45_000;
    if (remainingTime <= 1_000) throw new DeepSeekDeadlineError();
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      Math.min(45_000, remainingTime)
    );
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature: 0.1,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: JSON.stringify({ items: requestItems }) },
          ],
        }),
        signal: controller.signal,
        cache: "no-store",
      });

      if (!response.ok) {
        const summary = (await response.text()).slice(0, 500);
        const error = new DeepSeekHttpError(
          response.status,
          `DeepSeek HTTP ${response.status}: ${summary}`
        );
        if (response.status === 429) options.onRateLimit?.();
        if (retryable(response.status) && attempt < 2) {
          lastError = error;
          await wait(attempt === 0 ? 750 : 2_000);
          continue;
        }
        throw error;
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = payload.choices?.[0]?.message?.content;
      if (!content) throw new DeepSeekResponseError("DeepSeek returned an empty response");

      let parsed: { translations?: Array<{ id?: unknown; text?: unknown }> };
      try {
        parsed = parseJsonContent(content) as typeof parsed;
      } catch (error) {
        throw new DeepSeekResponseError(
          `DeepSeek returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      if (!Array.isArray(parsed.translations)) {
        throw new DeepSeekResponseError(
          "DeepSeek response does not contain translations array"
        );
      }

      const expectedIds = new Set(items.map((item) => item.id));
      const candidates = new Map<string, string>();
      const unresolved = new Map<string, string>();
      for (const entry of parsed.translations) {
        if (typeof entry.id !== "string" || typeof entry.text !== "string") {
          continue;
        }
        if (!expectedIds.has(entry.id)) continue;
        if (candidates.has(entry.id) || unresolved.has(entry.id)) {
          candidates.delete(entry.id);
          unresolved.set(entry.id, `DeepSeek returned duplicate id: ${entry.id}`);
          continue;
        }
        try {
          const value = restoreAndValidate(entry.text, protectedById.get(entry.id)!);
          if (!value.trim()) {
            unresolved.set(entry.id, `DeepSeek returned empty text for ${entry.id}`);
          } else {
            candidates.set(entry.id, value);
          }
        } catch (error) {
          unresolved.set(
            entry.id,
            error instanceof Error ? error.message : String(error)
          );
        }
      }

      for (const id of expectedIds) {
        if (!candidates.has(id) && !unresolved.has(id)) {
          unresolved.set(id, `DeepSeek did not return requested id: ${id}`);
        }
      }
      return { translated: candidates, unresolved };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (lastError.name === "AbortError") {
        options.onTimeout?.();
        throw new DeepSeekTimeoutError();
      }
      const isNetworkFailure = lastError instanceof TypeError;
      if (attempt < 2 && isNetworkFailure) {
        await wait(attempt === 0 ? 750 : 2_000);
        continue;
      }
      throw lastError;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError ?? new Error("DeepSeek translation failed");
}

async function resolveItems(
  locale: TranslationLocale,
  items: TranslationItem[],
  options: DeepSeekTranslationOptions,
  singleAttempt = 0
): Promise<Map<string, string>> {
  let attempt: BatchAttempt;
  try {
    attempt = await requestBatch(locale, items, options);
  } catch (error) {
    if (error instanceof DeepSeekResponseError && items.length > 1) {
      const middle = Math.ceil(items.length / 2);
      const translated = new Map<string, string>();
      const errors: string[] = [];
      for (const part of [items.slice(0, middle), items.slice(middle)]) {
        try {
          const result = await resolveItems(locale, part, options);
          result.forEach((value, id) => translated.set(id, value));
        } catch (partError) {
          if (partError instanceof DeepSeekDeadlineError) {
            partError.translated.forEach((value, id) => translated.set(id, value));
            throw new DeepSeekDeadlineError(translated);
          }
          if (partError instanceof DeepSeekPartialError) {
            partError.translated.forEach((value, id) => translated.set(id, value));
          }
          errors.push(partError instanceof Error ? partError.message : String(partError));
        }
      }
      if (errors.length) throw new DeepSeekPartialError(errors.join("; "), translated);
      return translated;
    }
    if (error instanceof DeepSeekResponseError && singleAttempt < 1) {
      return resolveItems(locale, items, options, singleAttempt + 1);
    }
    throw error;
  }

  if (!attempt.unresolved.size) return attempt.translated;
  const unresolvedItems = items.filter((item) => attempt.unresolved.has(item.id));
  if (unresolvedItems.length === 1 && singleAttempt >= 1) {
    const reason = attempt.unresolved.get(unresolvedItems[0].id);
    throw new DeepSeekPartialError(
      reason || `DeepSeek could not translate ${unresolvedItems[0].id}`,
      attempt.translated
    );
  }

  const parts =
    unresolvedItems.length === 1
      ? [unresolvedItems]
      : [
          unresolvedItems.slice(0, Math.ceil(unresolvedItems.length / 2)),
          unresolvedItems.slice(Math.ceil(unresolvedItems.length / 2)),
        ];
  const errors: string[] = [];
  for (const part of parts) {
    try {
      const recovered = await resolveItems(
        locale,
        part,
        options,
        unresolvedItems.length === 1 ? singleAttempt + 1 : 0
      );
      recovered.forEach((value, id) => attempt.translated.set(id, value));
    } catch (error) {
      if (error instanceof DeepSeekDeadlineError) {
        error.translated.forEach((value, id) => attempt.translated.set(id, value));
        throw new DeepSeekDeadlineError(attempt.translated);
      }
      if (error instanceof DeepSeekPartialError) {
        error.translated.forEach((value, id) => attempt.translated.set(id, value));
      }
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (errors.length) {
    throw new DeepSeekPartialError(errors.join("; "), attempt.translated);
  }
  return attempt.translated;
}

export async function translateItems(
  locale: TranslationLocale,
  items: TranslationItem[],
  options: DeepSeekTranslationOptions = {}
): Promise<Map<string, string>> {
  if (!items.length) return new Map();
  const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item.id)) throw new Error(`Duplicate translation request id: ${item.id}`);
    ids.add(item.id);
  }
  return resolveItems(locale, items, options);
}
