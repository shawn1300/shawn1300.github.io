import type { TranslationLocale } from "@/types";

export interface TranslationItem {
  id: string;
  text: string;
}

const targetNames: Record<TranslationLocale, string> = {
  en: "natural English",
  ja: "natural Japanese",
};

type ProtectedText = {
  text: string;
  placeholders: string[];
};

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

export async function translateItems(
  locale: TranslationLocale,
  items: TranslationItem[]
): Promise<Map<string, string>> {
  if (!items.length) return new Map();

  const apiKey = process.env.DEEPSEEK_API_KEY;
  const model = process.env.DEEPSEEK_TRANSLATION_MODEL;
  const baseUrl = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com")
    .replace(/\/$/, "");
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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);
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
        const error = new Error(`DeepSeek HTTP ${response.status}: ${summary}`);
        if (retryable(response.status) && attempt < 2) {
          lastError = error;
          await wait(attempt === 0 ? 500 : 1_500);
          continue;
        }
        throw error;
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = payload.choices?.[0]?.message?.content;
      if (!content) throw new Error("DeepSeek returned an empty response");
      const parsed = parseJsonContent(content) as {
        translations?: Array<{ id?: unknown; text?: unknown }>;
      };
      if (!Array.isArray(parsed.translations)) {
        throw new Error("DeepSeek response does not contain translations array");
      }

      const expectedIds = new Set(items.map((item) => item.id));
      const translated = new Map<string, string>();
      for (const entry of parsed.translations) {
        if (typeof entry.id !== "string" || typeof entry.text !== "string") {
          throw new Error("DeepSeek returned an invalid translation item");
        }
        if (!expectedIds.has(entry.id) || translated.has(entry.id)) {
          throw new Error(`DeepSeek returned an unexpected or duplicate id: ${entry.id}`);
        }
        const value = restoreAndValidate(
          entry.text,
          protectedById.get(entry.id)!
        );
        if (!value.trim()) throw new Error(`DeepSeek returned empty text for ${entry.id}`);
        translated.set(entry.id, value);
      }

      if (translated.size !== expectedIds.size) {
        throw new Error("DeepSeek did not return every requested translation item");
      }
      return translated;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const isNetworkFailure =
        lastError.name === "AbortError" || lastError instanceof TypeError;
      if (attempt < 2 && isNetworkFailure) {
        await wait(attempt === 0 ? 500 : 1_500);
        continue;
      }
      throw lastError;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError ?? new Error("DeepSeek translation failed");
}
