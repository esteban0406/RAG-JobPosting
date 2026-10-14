export type SqlRow = Record<string, unknown>;
export type SqlValue = string | number | boolean | null;

export interface RowComparison {
  goldRows: number;
  coveredRows: number;
  // Share of reference rows found in the system's result (1 if the reference
  // is empty).
  coverage: number;
  // Every reference row is covered.
  exact: boolean;
}

// Raw SQL results mix bigint counts, Prisma decimals and dates; normalize them
// so the same value compares equal whichever query produced it.
export function normalizeValue(value: unknown): SqlValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (
    typeof value === 'object' &&
    typeof (value as { toNumber?: unknown }).toNumber === 'function'
  ) {
    return (value as { toNumber(): number }).toNumber();
  }
  return typeof value === 'string' ? value : JSON.stringify(value);
}

export function normalizeRow(row: SqlRow): Record<string, SqlValue> {
  return Object.fromEntries(
    Object.entries(row).map(([k, v]) => [k, normalizeValue(v)]),
  );
}

function valueCounts(row: SqlRow): Map<string, number> {
  const counts = new Map<string, number>();
  for (const v of Object.values(row)) {
    const key = JSON.stringify(normalizeValue(v));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

// A system row covers a reference row when it contains all of the reference
// row's values, ignoring column names and extra columns: templates and
// reference queries name and select columns differently (e.g. "total" vs.
// "count", or min/max/avg where the reference only asks for min/max).
function covers(system: Map<string, number>, gold: Map<string, number>) {
  for (const [key, n] of gold) {
    if ((system.get(key) ?? 0) < n) return false;
  }
  return true;
}

// Compares the rows the system obtained against the reference query's rows.
// Extra system rows are not penalized: templates often return a longer top-k
// than the reference.
export function compareRows(system: SqlRow[], gold: SqlRow[]): RowComparison {
  const systemCounts = system.map(valueCounts);
  const coveredRows = gold.filter((row) => {
    const goldCounts = valueCounts(row);
    return systemCounts.some((s) => covers(s, goldCounts));
  }).length;
  return {
    goldRows: gold.length,
    coveredRows,
    coverage: gold.length === 0 ? 1 : coveredRows / gold.length,
    exact: coveredRows === gold.length,
  };
}
