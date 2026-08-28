import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SearchQueryDto } from '../../../src/query/dto/search-query.dto.js';

async function validateDto(payload: Record<string, unknown>) {
  const dto = plainToInstance(SearchQueryDto, payload);
  return validate(dto);
}

describe('SearchQueryDto history validation', () => {
  it('accepts a well-formed history array', async () => {
    const errors = await validateDto({
      query: 'find software engineers',
      history: [
        { role: 'user', content: 'recommend me jobs' },
        { role: 'assistant', content: 'Here are some jobs.' },
      ],
    });

    expect(errors).toHaveLength(0);
  });

  it('accepts a missing history field', async () => {
    const errors = await validateDto({ query: 'find software engineers' });

    expect(errors).toHaveLength(0);
  });

  it('rejects more than 12 history entries', async () => {
    const history = Array.from({ length: 13 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `message ${i}`,
    }));

    const errors = await validateDto({
      query: 'find software engineers',
      history,
    });

    expect(errors.some((e) => e.property === 'history')).toBe(true);
  });

  it('rejects a history entry with content over 2000 characters', async () => {
    const errors = await validateDto({
      query: 'find software engineers',
      history: [{ role: 'user', content: 'a'.repeat(2001) }],
    });

    expect(errors.some((e) => e.property === 'history')).toBe(true);
  });

  it('rejects a history entry with an invalid role', async () => {
    const errors = await validateDto({
      query: 'find software engineers',
      history: [{ role: 'system', content: 'not allowed from the client' }],
    });

    expect(errors.some((e) => e.property === 'history')).toBe(true);
  });
});
