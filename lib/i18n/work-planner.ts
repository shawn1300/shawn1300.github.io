export interface TranslationWorkCandidate<T> {
  work: T;
  isCurrent: boolean;
  status?: string;
}

export interface TranslationWorkPlan<T> {
  work: T[];
  scannedCount: number;
  reusedCount: number;
}

export function planTranslationWork<T>(
  candidates: TranslationWorkCandidate<T>[]
): TranslationWorkPlan<T> {
  const pending: T[] = [];
  const failed: T[] = [];
  let reusedCount = 0;

  for (const candidate of candidates) {
    if (candidate.isCurrent) {
      reusedCount += 1;
      continue;
    }
    (candidate.status === "failed" ? failed : pending).push(candidate.work);
  }

  return {
    work: [...pending, ...failed],
    scannedCount: candidates.length,
    reusedCount,
  };
}
