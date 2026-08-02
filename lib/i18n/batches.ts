export interface BatchableTranslationItem {
  text: string;
}

export function buildTranslationBatches<T extends BatchableTranslationItem>(
  items: T[],
  maxCharacters: number,
  maxItems: number
): T[][] {
  const batches: T[][] = [];
  let current: T[] = [];
  let currentCharacters = 0;

  for (const item of items) {
    const exceedsCharacters = currentCharacters + item.text.length > maxCharacters;
    const exceedsItems = current.length >= maxItems;
    if (current.length && (exceedsCharacters || exceedsItems)) {
      batches.push(current);
      current = [];
      currentCharacters = 0;
    }
    current.push(item);
    currentCharacters += item.text.length;
  }
  if (current.length) batches.push(current);

  return batches;
}
