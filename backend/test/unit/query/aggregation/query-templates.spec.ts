import { QUERY_TEMPLATES } from '../../../../src/query/aggregation/query-templates.js';

describe('remote job templates', () => {
  it.each(['count_remote', 'list_remote_jobs'] as const)(
    '%s uses the isRemote column, not only the location text',
    (key) => {
      expect(QUERY_TEMPLATES[key]).toContain('"isRemote"');
      expect(QUERY_TEMPLATES[key]).toContain("location ILIKE '%remote%'");
    },
  );
});
