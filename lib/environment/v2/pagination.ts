const DEFAULT_PAGE_SIZE = 1_000;
const DEFAULT_MAXIMUM_ROWS = 25_000;

export async function readEnvironmentHistoryPagesV2<Row>(
  readPage: (from: number, to: number) => Promise<Row[]>,
  pageSize = DEFAULT_PAGE_SIZE,
  maximumRows = DEFAULT_MAXIMUM_ROWS
) {
  const rows: Row[] = [];
  while (rows.length < maximumRows) {
    const size = Math.min(pageSize, maximumRows - rows.length);
    const page = await readPage(rows.length, rows.length + size - 1);
    rows.push(...page.slice(0, size));
    if (page.length < size) break;
  }
  return rows;
}
