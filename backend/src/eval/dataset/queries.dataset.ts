export type QueryCategory =
  | 'exact'
  | 'semantic'
  | 'filtering'
  | 'aggregation'
  | 'noisy';

export interface QueryDefinition {
  id: string;
  category: QueryCategory;
  query: string;
  /**
   * OR logic: job matches if ANY keyword appears in title + description.
   * Used when the concept is singular (e.g. "angular").
   */
  expected_keywords: string[];
  /**
   * AND logic between groups, OR within each group.
   * Job must match at least one keyword from EVERY group.
   * Use this to avoid over-broad label sets (e.g. "python" AND "backend").
   * When provided, takes precedence over expected_keywords.
   */
  keyword_groups?: string[][];
  /** Warn if auto-labeler finds fewer relevant jobs than this */
  min_relevant: number;
  /**
   * Cap the labeled set at this many jobs (sorted by match score, title > description).
   * Prevents recall@K from becoming trivially low when many jobs match a broad query.
   * Defaults to 20 when not set.
   */
  max_relevant?: number;
}

export const QUERIES: QueryDefinition[] = [
  // A. Exact / keyword — easy baseline
  {
    id: 'q1',
    category: 'exact',
    query: 'Senior Software Developer',
    expected_keywords: [],
    keyword_groups: [['senior'], ['software developer', 'software engineer']],
    min_relevant: 3,
  },
  {
    id: 'q2',
    category: 'exact',
    query: 'Frontend Angular jobs',
    expected_keywords: [],
    keyword_groups: [
      ['angular'],
      ['frontend', 'front-end', 'ui developer', 'web developer'],
    ],
    min_relevant: 2,
  },
  {
    id: 'q3',
    category: 'exact',
    query: 'Python backend jobs',
    expected_keywords: [],
    keyword_groups: [['python'], ['backend', 'back-end', 'server', 'api']],
    min_relevant: 2,
  },

  // B. Semantic — tests embedding quality
  {
    id: 'q4',
    category: 'semantic',
    query: 'entry level developer jobs',
    expected_keywords: [],
    keyword_groups: [
      ['junior', 'entry level', 'graduate', 'trainee'],
      ['developer', 'engineer', 'programmer'],
    ],
    min_relevant: 2,
  },
  {
    id: 'q5',
    category: 'semantic',
    query: 'jobs for React developers',
    expected_keywords: [],
    keyword_groups: [
      ['react', 'reactjs', 'react.js'],
      ['developer', 'engineer', 'frontend', 'front-end'],
    ],
    min_relevant: 2,
  },
  {
    id: 'q6',
    category: 'semantic',
    query: 'backend roles using Java',
    expected_keywords: [],
    keyword_groups: [
      ['java', 'spring boot', 'spring framework'],
      ['backend', 'back-end', 'server', 'microservice'],
    ],
    min_relevant: 2,
  },

  // C. Filtering — location/type signals
  {
    id: 'q7',
    category: 'filtering',
    query: 'remote software jobs',
    expected_keywords: [],
    keyword_groups: [['remote'], ['developer', 'engineer', 'software']],
    min_relevant: 3,
    max_relevant: 300,
  },
  {
    id: 'q8',
    category: 'filtering',
    query: 'jobs in Berlin',
    expected_keywords: ['berlin'],
    min_relevant: 2,
    max_relevant: 300,
  },
  {
    id: 'q9',
    category: 'filtering',
    query: 'internships in tech',
    expected_keywords: [],
    keyword_groups: [
      ['intern', 'internship'],
      ['software', 'tech', 'developer', 'engineer', 'data', 'it'],
    ],
    min_relevant: 2,
  },

  // D. Aggregation — hard, tests diversity of retrieval
  {
    id: 'q10',
    category: 'aggregation',
    query: 'most common programming language',
    // OR only — the point is breadth across different languages; raise cap so
    // recall isn't crushed by a large denominator on a legitimately broad query
    expected_keywords: [
      'javascript',
      'python',
      'java',
      'typescript',
      'golang',
      'rust',
      'c#',
      'ruby',
    ],
    min_relevant: 5,
    max_relevant: 40,
  },
  {
    id: 'q11',
    category: 'aggregation',
    query: 'what roles are most in demand',
    expected_keywords: [],
    keyword_groups: [
      ['developer', 'engineer', 'architect', 'devops', 'data scientist'],
      ['senior', 'lead', 'principal', 'staff'],
      ['javascript', 'python', 'java', 'react', 'cloud', 'aws', 'kubernetes'],
    ],
    min_relevant: 5,
  },

  // E. Noisy / vague — realistic user queries
  {
    id: 'q12',
    category: 'noisy',
    query: 'good dev jobs',
    expected_keywords: [],
    keyword_groups: [
      ['developer', 'engineer'],
      ['senior', 'mid-level', 'lead', 'full stack', 'fullstack'],
    ],
    min_relevant: 3,
  },
  {
    id: 'q13',
    category: 'noisy',
    query: 'coding jobs for beginners',
    expected_keywords: [],
    keyword_groups: [
      ['junior', 'entry level', 'beginner', 'trainee', 'apprentice'],
      ['developer', 'engineer', 'programmer'],
    ],
    min_relevant: 2,
  },

  // F. Marketing & Communications
  {
    id: 'q14',
    category: 'exact',
    query: 'Digital Marketing Manager',
    expected_keywords: [
      'digital marketing manager',
      'online marketing manager',
      'head of marketing',
      'marketing director',
      'marketing leiter',
    ],
    min_relevant: 3,
  },
  {
    id: 'q15',
    category: 'exact',
    query: 'Copywriter or Content Writer jobs',
    expected_keywords: ['copywriter', 'content writer', 'texter', 'redakteur'],
    min_relevant: 2,
  },
  {
    id: 'q16',
    category: 'semantic',
    query: 'social media marketing jobs',
    expected_keywords: [],
    keyword_groups: [
      ['social media', 'instagram', 'facebook', 'linkedin', 'tiktok'],
      [
        'social media manager',
        'social media specialist',
        'community manager',
        'content creator',
      ],
    ],
    min_relevant: 3,
  },
  {
    id: 'q17',
    category: 'filtering',
    query: 'remote marketing jobs',
    expected_keywords: [],
    keyword_groups: [
      ['marketing', 'content', 'seo', 'brand'],
      ['remote', 'homeoffice', 'home office'],
    ],
    min_relevant: 2,
    max_relevant: 300,
  },
  {
    id: 'q18',
    category: 'noisy',
    query: 'jobs promoting products online',
    expected_keywords: [],
    keyword_groups: [
      ['marketing', 'brand', 'campaign', 'advertising'],
      ['online', 'digital', 'social media', 'content'],
    ],
    min_relevant: 3,
    max_relevant: 40,
  },

  // G. Customer Support & Administration
  {
    id: 'q19',
    category: 'exact',
    query: 'Customer Service Representative',
    expected_keywords: [],
    keyword_groups: [
      [
        'customer service',
        'customer support',
        'kundenservice',
        'kundenbetreuer',
      ],
      ['agent', 'representative', 'specialist'],
    ],
    min_relevant: 2,
  },
  {
    id: 'q20',
    category: 'exact',
    query: 'Office Administration jobs',
    expected_keywords: [
      'büroassistenz',
      'office manager',
      'office assistant',
      'sachbearbeiter',
      'verwaltungsassistent',
    ],
    min_relevant: 2,
  },
  {
    id: 'q21',
    category: 'semantic',
    query: 'IT helpdesk or technical support roles',
    expected_keywords: [],
    keyword_groups: [
      ['it support', 'helpdesk', 'help desk', 'first level', 'service desk'],
      ['techniker', 'specialist', 'engineer', 'mitarbeiter'],
    ],
    min_relevant: 2,
  },
  {
    id: 'q22',
    category: 'filtering',
    query: 'customer support jobs in Berlin',
    expected_keywords: [],
    keyword_groups: [
      [
        'customer support',
        'customer service',
        'kundenservice',
        'kundenbetreuer',
      ],
      ['berlin'],
    ],
    min_relevant: 1,
  },
];
