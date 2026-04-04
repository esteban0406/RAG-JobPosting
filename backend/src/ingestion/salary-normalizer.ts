export interface RawSalary {
  min?: number | null;
  max?: number | null;
  period?: string | null; // 'hourly' | 'monthly' | 'weekly' | 'yearly' | etc.
  raw?: string | null; // free-form string (e.g. Remotive API)
}

export interface NormalizedSalary {
  minSalary?: number;
  maxSalary?: number;
}

const PERIOD_MULTIPLIERS: Record<string, number> = {
  hourly: 2080, // 40h × 52w
  hour: 2080,
  monthly: 12,
  month: 12,
  weekly: 52,
  week: 52,
  yearly: 1,
  year: 1,
  annual: 1,
  annually: 1,
};

export function normalizeSalary(input: RawSalary): NormalizedSalary {
  if (input.raw != null) {
    return parseRawString(input.raw);
  }

  if (input.min == null && input.max == null) return {};

  const period = input.period?.toLowerCase() ?? '';
  const multiplier = PERIOD_MULTIPLIERS[period] ?? 1;

  const result: NormalizedSalary = {};
  if (input.min != null) result.minSalary = Math.round(input.min * multiplier);
  if (input.max != null) result.maxSalary = Math.round(input.max * multiplier);
  return result;
}

function parseAmount(s: string): number {
  const cleaned = s.replace(/,/g, '');
  const n = parseFloat(cleaned);
  return /k$/i.test(cleaned) ? n * 1000 : n;
}

function parseRawString(raw: string): NormalizedSalary {
  if (!raw) return {};

  // Match numbers like $60k, $60,000, 60000, 60.5k
  const numPattern = /\$?([\d,]+\.?\d*k?)/gi;
  const matches = [...raw.matchAll(numPattern)].map((m) => parseAmount(m[1]));

  if (matches.length === 0) return {};

  if (matches.length >= 2) {
    return {
      minSalary: Math.round(matches[0]),
      maxSalary: Math.round(matches[1]),
    };
  }

  // Single number — "up to X" means maxSalary, everything else is minSalary
  if (/up\s*to/i.test(raw)) {
    return { maxSalary: Math.round(matches[0]) };
  }
  return { minSalary: Math.round(matches[0]) };
}
