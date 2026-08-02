import { contentHash } from "./hash";

export type MarkdownBlockKind = "text" | "code" | "whitespace" | "structure";

export interface MarkdownBlock {
  id: string;
  hash: string;
  kind: MarkdownBlockKind;
  source: string;
  translatable: boolean;
}

export interface StoredTranslatedBlock extends MarkdownBlock {
  translation: string;
}

const fencedCodeStart = /^\s*(```|~~~)/;
const structureOnly = /^(?:\s*[-*_]{3,}\s*|\s*<[^>]+>\s*|\s*!?\[[^\]]*\]\([^)]*\)\s*)$/;

function makeBlocks(parts: Array<Omit<MarkdownBlock, "id" | "hash">>): MarkdownBlock[] {
  const occurrences = new Map<string, number>();
  return parts.map((part) => {
    const hash = contentHash(part.source);
    const occurrence = occurrences.get(hash) ?? 0;
    occurrences.set(hash, occurrence + 1);
    return { ...part, hash, id: `${hash}:${occurrence}` };
  });
}

/**
 * Deterministically splits Markdown without discarding a single character.
 * Text separated by blank lines forms a translation unit; fenced code and
 * whitespace are kept as protected units.
 */
export function splitMarkdown(markdown: string): MarkdownBlock[] {
  if (!markdown) return [];

  const lines = markdown.match(/.*(?:\r?\n|$)/g)?.filter(Boolean) ?? [];
  const parts: Array<Omit<MarkdownBlock, "id" | "hash">> = [];
  let textBuffer = "";
  let codeBuffer = "";
  let fence: string | null = null;

  const flushText = () => {
    if (!textBuffer) return;
    const trimmed = textBuffer.trim();
    const isWhitespace = trimmed.length === 0;
    const isStructure = !isWhitespace && structureOnly.test(trimmed);
    parts.push({
      source: textBuffer,
      kind: isWhitespace ? "whitespace" : isStructure ? "structure" : "text",
      translatable: !isWhitespace && !isStructure,
    });
    textBuffer = "";
  };

  const flushCode = () => {
    if (!codeBuffer) return;
    parts.push({ source: codeBuffer, kind: "code", translatable: false });
    codeBuffer = "";
  };

  for (const line of lines) {
    if (fence) {
      codeBuffer += line;
      if (new RegExp(`^\\s*${fence}`).test(line)) {
        fence = null;
        flushCode();
      }
      continue;
    }

    const fenceMatch = line.match(fencedCodeStart);
    if (fenceMatch) {
      flushText();
      fence = fenceMatch[1];
      codeBuffer = line;
      continue;
    }

    if (/^\s*(?:\r?\n)?$/.test(line)) {
      flushText();
      textBuffer = line;
      flushText();
      continue;
    }

    textBuffer += line;
  }

  flushText();
  flushCode();
  return makeBlocks(parts);
}

export function reusableTranslations(
  blocks: MarkdownBlock[],
  previous: StoredTranslatedBlock[]
): Map<string, string> {
  const byHash = new Map<string, string[]>();
  for (const block of previous) {
    if (!block.translatable || !block.translation) continue;
    const values = byHash.get(block.hash) ?? [];
    values.push(block.translation);
    byHash.set(block.hash, values);
  }

  const result = new Map<string, string>();
  const used = new Map<string, number>();
  for (const block of blocks) {
    const options = byHash.get(block.hash);
    if (!options?.length) continue;
    const index = used.get(block.hash) ?? 0;
    result.set(block.id, options[Math.min(index, options.length - 1)]);
    used.set(block.hash, index + 1);
  }
  return result;
}

export function rebuildMarkdown(
  blocks: MarkdownBlock[],
  translated: ReadonlyMap<string, string>
): string {
  return blocks
    .map((block) => {
      if (!block.translatable) return block.source;
      const value = translated.get(block.id);
      if (value === undefined) {
        throw new Error(`Missing translation for Markdown block ${block.id}`);
      }
      const trailing = block.source.match(/\s*$/)?.[0] ?? "";
      return `${value.trimEnd()}${trailing}`;
    })
    .join("");
}
