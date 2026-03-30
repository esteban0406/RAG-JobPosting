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
}

export const QUERIES: QueryDefinition[] = [
  // A. Exact / keyword — easy baseline
  {
    id: 'q1',
    category: 'exact',
    query: 'Senior Software Developer',
    expected_keywords: [],
    keyword_groups: [
      ['senior'],
      ['software developer', 'software engineer'],
    ],
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
    keyword_groups: [
      ['python'],
      ['backend', 'back-end', 'server', 'api'],
    ],
    min_relevant: 2,
  },

  // B. Semantic — tests embedding quality
  {
    id: 'q4',
    category: 'semantic',
    query: 'entry level developer jobs',
    expected_keywords: ['junior', 'entry level', 'graduate', 'trainee'],
    min_relevant: 2,
  },
  {
    id: 'q5',
    category: 'semantic',
    query: 'jobs for React developers',
    expected_keywords: ['react', 'reactjs', 'react.js'],
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
    keyword_groups: [
      ['remote'],
      ['developer', 'engineer', 'software'],
    ],
    min_relevant: 3,
  },
  {
    id: 'q8',
    category: 'filtering',
    query: 'jobs in Berlin',
    expected_keywords: ['berlin'],
    min_relevant: 2,
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
    // OR only — the point is breadth across different languages
    expected_keywords: ['javascript', 'python', 'java', 'typescript', 'golang', 'rust', 'c#', 'ruby'],
    min_relevant: 5,
  },
  {
    id: 'q11',
    category: 'aggregation',
    query: 'what roles are most in demand',
    expected_keywords: [],
    keyword_groups: [
      ['developer', 'engineer', 'architect', 'devops', 'data scientist'],
      ['senior', 'lead', 'principal', 'staff'],
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
      ['senior', 'mid', 'lead', 'full stack', 'fullstack'],
    ],
    min_relevant: 3,
  },
  {
    id: 'q13',
    category: 'noisy',
    query: 'coding jobs for beginners',
    expected_keywords: ['junior', 'entry level', 'beginner', 'trainee', 'apprentice'],
    min_relevant: 2,
  },
];
