import { normalizeJobType } from './normalize-job-type.js';
import { JobType } from '../../llm/job-type.enum.js';

describe('normalizeJobType', () => {
  it.each([
    ['full_time', JobType.FULL_TIME],
    ['Full-time', JobType.FULL_TIME],
    ['FULLTIME', JobType.FULL_TIME],
    ['Permanent', JobType.FULL_TIME],
    ['full time', JobType.FULL_TIME],
  ])('maps "%s" → FULL_TIME', (input, expected) => {
    expect(normalizeJobType(input)).toBe(expected);
  });

  it.each([
    ['part_time', JobType.PART_TIME],
    ['Part-time', JobType.PART_TIME],
    ['part time', JobType.PART_TIME],
  ])('maps "%s" → PART_TIME', (input, expected) => {
    expect(normalizeJobType(input)).toBe(expected);
  });

  it.each([
    ['contract', JobType.CONTRACT],
    ['Contractor', JobType.CONTRACT],
    ['contract-to-hire', JobType.CONTRACT],
    ['contract to hire', JobType.CONTRACT],
  ])('maps "%s" → CONTRACT', (input, expected) => {
    expect(normalizeJobType(input)).toBe(expected);
  });

  it.each([
    ['intern', JobType.INTERNSHIP],
    ['Internship', JobType.INTERNSHIP],
  ])('maps "%s" → INTERNSHIP', (input, expected) => {
    expect(normalizeJobType(input)).toBe(expected);
  });

  it.each([
    ['freelance', JobType.FREELANCE],
    ['Freelancer', JobType.FREELANCE],
  ])('maps "%s" → FREELANCE', (input, expected) => {
    expect(normalizeJobType(input)).toBe(expected);
  });

  it.each([['remote'], ['unknown'], ['temporary'], ['']])(
    'returns null for "%s"',
    (input) => {
      expect(normalizeJobType(input)).toBeNull();
    },
  );

  it('returns null for undefined', () => {
    expect(normalizeJobType(undefined)).toBeNull();
  });

  it('returns null for null', () => {
    expect(normalizeJobType(null)).toBeNull();
  });
});
