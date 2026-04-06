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
  // A. Healthcare
  {
    id: 'q1',
    category: 'exact',
    query: 'Registered Nurse jobs',
    expected_keywords: [],
    keyword_groups: [['registered nurse', 'rn']],
    min_relevant: 20,
  },
  {
    id: 'q2',
    category: 'semantic',
    query: 'mental health therapy positions',
    expected_keywords: [],
    keyword_groups: [
      [
        'mental health',
        'therapy',
        'counseling',
        'behavioral health',
        'psychiatric',
      ],
    ],
    min_relevant: 15,
  },
  {
    id: 'q3',
    category: 'filtering',
    query: 'healthcare jobs in Colorado',
    expected_keywords: [],
    keyword_groups: [
      [
        'nurse',
        'therapist',
        'medical',
        'clinical',
        'physician',
        'paramedic',
        'health',
      ],
      [
        'colorado',
        'denver',
        'aurora',
        'fort collins',
        'boulder',
        'loveland',
        'lakewood',
      ],
    ],
    min_relevant: 5,
  },
  {
    id: 'q4',
    category: 'aggregation',
    query: 'what medical and clinical roles are available',
    expected_keywords: [
      'nurse',
      'physician',
      'therapist',
      'paramedic',
      'dentist',
      'surgeon',
      'pharmacist',
      'clinical',
      'radiologist',
    ],
    min_relevant: 10,
    max_relevant: 40,
  },
  {
    id: 'q5',
    category: 'noisy',
    query: 'jobs helping sick people get better',
    expected_keywords: [],
    keyword_groups: [
      [
        'nurse',
        'therapist',
        'medical',
        'patient',
        'clinical',
        'health',
        'hospital',
        'care',
      ],
    ],
    min_relevant: 15,
  },

  // B. Transportation / Delivery
  {
    id: 'q6',
    category: 'exact',
    query: 'CDL A Truck Driver',
    expected_keywords: [],
    keyword_groups: [
      ['cdl', 'cdl-a', 'cdl a'],
      ['driver', 'driving', 'truck'],
    ],
    min_relevant: 10,
  },
  {
    id: 'q7',
    category: 'semantic',
    query: 'commercial vehicle and freight jobs',
    expected_keywords: [],
    keyword_groups: [
      [
        'commercial',
        'freight',
        'logistics',
        'truck',
        'transport',
        'cargo',
        'cdl',
        'regional',
      ],
    ],
    min_relevant: 5,
  },
  {
    id: 'q8',
    category: 'filtering',
    query: 'delivery driver jobs in Texas',
    expected_keywords: [],
    keyword_groups: [
      ['driver', 'delivery', 'cdl', 'shopper', 'courier'],
      [
        'texas',
        'san antonio',
        'houston',
        'dallas',
        'austin',
        'bexar',
        'travis',
        'guadalupe',
      ],
    ],
    min_relevant: 3,
  },
  {
    id: 'q9',
    category: 'aggregation',
    query: 'types of driving and delivery jobs',
    expected_keywords: [
      'driver',
      'cdl',
      'delivery',
      'instacart',
      'shopper',
      'regional',
      'courier',
      'trucking',
    ],
    min_relevant: 10,
    max_relevant: 40,
  },
  {
    id: 'q10',
    category: 'noisy',
    query: 'jobs that involve driving around',
    expected_keywords: [],
    keyword_groups: [
      ['driver', 'driving', 'cdl', 'delivery', 'transport', 'shopper'],
    ],
    min_relevant: 10,
  },

  // C. Youth Care / Social Services
  {
    id: 'q11',
    category: 'exact',
    query: 'Houseparents residential care',
    expected_keywords: [],
    keyword_groups: [['houseparents', 'house parents']],
    min_relevant: 10,
  },
  {
    id: 'q12',
    category: 'semantic',
    query: 'residential youth care positions',
    expected_keywords: [],
    keyword_groups: [
      [
        'youth',
        'residential',
        'caregiver',
        'youth development',
        'youth specialist',
      ],
    ],
    min_relevant: 8,
  },
  {
    id: 'q13',
    category: 'filtering',
    query: 'youth care jobs requiring relocation',
    expected_keywords: [],
    keyword_groups: [
      ['youth', 'houseparent', 'house parent', 'residential'],
      ['relocation', 'relocate'],
    ],
    min_relevant: 8,
  },
  {
    id: 'q14',
    category: 'aggregation',
    query: 'types of youth and social service roles',
    expected_keywords: [
      'houseparent',
      'youth development',
      'residential',
      'caregiver',
      'specialist',
      'counselor',
      'mentor',
    ],
    min_relevant: 8,
    max_relevant: 30,
  },
  {
    id: 'q15',
    category: 'noisy',
    query: 'jobs working with kids in a group home',
    expected_keywords: [],
    keyword_groups: [
      [
        'youth',
        'children',
        'kids',
        'residential',
        'houseparent',
        'house parent',
        'caregiver',
      ],
    ],
    min_relevant: 8,
  },
];
