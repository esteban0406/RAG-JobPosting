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

  let min = input.min != null ? Math.round(input.min * multiplier) : undefined;
  let max = input.max != null ? Math.round(input.max * multiplier) : undefined;

  if (!min) min = undefined;
  if (!max) max = undefined;

  if (min == null && max == null) return {};

  return { minSalary: min ?? max, maxSalary: max ?? min };
}

function parseAmount(s: string): number {
  const cleaned = s.replace(/,/g, '');
  const n = parseFloat(cleaned);
  return /k$/i.test(cleaned) ? n * 1000 : n;
}

const HOURLY_PATTERN = /per\s*hour|\/\s*hour|\/\s*hr\b|hourly/i;
const MONTHLY_PATTERN = /per\s*month|\/\s*month|monthly/i;
const WEEKLY_PATTERN = /per\s*week|\/\s*week|weekly/i;

// Minimum plausible annual salary — filters out garbage like payment dates ("15th and 30th")
const MIN_ANNUAL_SALARY = 1_000;

function parseRawString(raw: string): NormalizedSalary {
  if (!raw) return {};

  let multiplier = 1;
  if (HOURLY_PATTERN.test(raw)) multiplier = 2080;
  else if (MONTHLY_PATTERN.test(raw)) multiplier = 12;
  else if (WEEKLY_PATTERN.test(raw)) multiplier = 52;

  // Match numbers like $60k, $60,000, 60000, 60.5k
  const numPattern = /\$?([\d,]+\.?\d*k?)/gi;
  const matches = [...raw.matchAll(numPattern)]
    .map((m) => parseAmount(m[1]))
    .map((n) => Math.round(n * multiplier))
    .filter((n) => n >= MIN_ANNUAL_SALARY);

  if (matches.length === 0) return {};

  const min = matches[0];
  const max = matches.length >= 2 ? matches[1] : matches[0];

  return { minSalary: min, maxSalary: max };
}
