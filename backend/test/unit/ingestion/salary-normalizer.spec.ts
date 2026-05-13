import { normalizeSalary } from '../../../src/ingestion/salary-normalizer.js';

describe('normalizeSalary', () => {
  describe('structured input with period multipliers', () => {
    it('multiplies hourly rate by 2080', () => {
      const result = normalizeSalary({ min: 30, max: 40, period: 'hourly' });
      expect(result.minSalary).toBe(30 * 2080);
      expect(result.maxSalary).toBe(40 * 2080);
    });

    it('multiplies monthly rate by 12', () => {
      const result = normalizeSalary({ min: 5000, max: 7000, period: 'monthly' });
      expect(result.minSalary).toBe(60000);
      expect(result.maxSalary).toBe(84000);
    });

    it('multiplies weekly rate by 52', () => {
      const result = normalizeSalary({ min: 1000, period: 'weekly' });
      expect(result.minSalary).toBe(52000);
      expect(result.maxSalary).toBe(52000);
    });

    it('passes annual salary through unchanged', () => {
      const result = normalizeSalary({ min: 80000, max: 120000, period: 'yearly' });
      expect(result.minSalary).toBe(80000);
      expect(result.maxSalary).toBe(120000);
    });

    it('treats unknown period as multiplier 1', () => {
      const result = normalizeSalary({ min: 90000, max: 110000, period: 'biweekly' });
      expect(result.minSalary).toBe(90000);
      expect(result.maxSalary).toBe(110000);
    });

    it('returns {} when both min and max are null', () => {
      const result = normalizeSalary({ min: null, max: null });
      expect(result).toEqual({});
    });

    it('uses max as both min and max when only max is provided', () => {
      const result = normalizeSalary({ max: 100000, period: 'yearly' });
      expect(result.minSalary).toBe(100000);
      expect(result.maxSalary).toBe(100000);
    });

    it('uses min as both min and max when only min is provided', () => {
      const result = normalizeSalary({ min: 80000, period: 'yearly' });
      expect(result.minSalary).toBe(80000);
      expect(result.maxSalary).toBe(80000);
    });
  });

  describe('raw string parsing', () => {
    it('parses "$60k–$80k" range as annual', () => {
      const result = normalizeSalary({ raw: '$60k–$80k' });
      expect(result.minSalary).toBe(60000);
      expect(result.maxSalary).toBe(80000);
    });

    it('parses "$60,000–$80,000" with commas', () => {
      const result = normalizeSalary({ raw: '$60,000–$80,000' });
      expect(result.minSalary).toBe(60000);
      expect(result.maxSalary).toBe(80000);
    });

    it('annualises hourly raw string', () => {
      const result = normalizeSalary({ raw: '$30/hour' });
      expect(result.minSalary).toBe(30 * 2080);
      expect(result.maxSalary).toBe(30 * 2080);
    });

    it('annualises "per hour" variant', () => {
      const result = normalizeSalary({ raw: '25 per hour' });
      expect(result.minSalary).toBe(25 * 2080);
    });

    it('annualises monthly raw string', () => {
      const result = normalizeSalary({ raw: '$5,000 per month' });
      expect(result.minSalary).toBe(60000);
    });

    it('annualises weekly raw string', () => {
      const result = normalizeSalary({ raw: '$1,000 per week' });
      expect(result.minSalary).toBe(52000);
    });

    it('returns {} for raw string with no plausible salary numbers', () => {
      const result = normalizeSalary({ raw: 'paid on the 15th and 30th' });
      expect(result).toEqual({});
    });

    it('returns {} for empty raw string', () => {
      const result = normalizeSalary({ raw: '' });
      expect(result).toEqual({});
    });
  });

  describe('edge cases', () => {
    it('returns {} when input has no fields set', () => {
      const result = normalizeSalary({});
      expect(result).toEqual({});
    });

    it('returns {} when raw is null', () => {
      const result = normalizeSalary({ raw: null });
      expect(result).toEqual({});
    });
  });
});
