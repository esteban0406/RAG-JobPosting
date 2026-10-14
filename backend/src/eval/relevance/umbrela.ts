import type { Job } from '../../../generated/prisma/client.js';

// Bump whenever the prompt or the job card changes: cached judgments are keyed
// by this version, so old verdicts are never mixed with new ones.
// v2 (14-oct-2026): explicit salary, remote, job-type and location conditions
// are hard; a posting that misses one is at most category 1.
export const PROMPT_VERSION = 'umbrela-jobs-v2';

const DESCRIPTION_CHARS = 1500;

export type JudgedJob = Pick<
  Job,
  | 'id'
  | 'title'
  | 'company'
  | 'location'
  | 'jobType'
  | 'isRemote'
  | 'minSalary'
  | 'maxSalary'
  | 'skills'
  | 'summary'
  | 'description'
  | 'contentHash'
>;

// Structured view of a posting, so the judge sees the same fields a job
// seeker would scan.
export function jobCard(job: JudgedJob): string {
  const salary =
    job.minSalary || job.maxSalary
      ? `${job.minSalary ?? '?'} - ${job.maxSalary ?? '?'} USD/year`
      : 'not stated';
  return [
    `Title: ${job.title}`,
    `Company: ${job.company}`,
    `Location: ${job.location ?? 'not stated'}`,
    `Job type: ${job.jobType ?? 'not stated'}`,
    `Remote: ${job.isRemote ? 'yes' : 'not stated'}`,
    `Salary: ${salary}`,
    `Skills: ${job.skills.length ? job.skills.join(', ') : 'not stated'}`,
    `Summary: ${job.summary ?? 'not available'}`,
    `Description: ${job.description.slice(0, DESCRIPTION_CHARS)}`,
  ].join('\n');
}

// UMBRELA (Upadhyay et al., 2024) relevance prompt, adapted from passages to
// job postings: graded 0-3 with the TREC Deep Learning scale.
export function umbrelaPrompt(infoNeed: string, card: string): string {
  return `Given a job seeker's search need and a job posting, you must provide a score on an integer scale of 0 to 3 with the following meanings:
0 = represents that the posting has nothing to do with the search need,
1 = represents that the posting seems related to the search need but does not satisfy it,
2 = represents that the posting satisfies the main part of the search need, but a secondary requirement (such as seniority or a skill) is missing, unclear, or contradicted,
3 = represents that the posting is dedicated to the search need and satisfies all of it.
Important Instruction: Assign category 1 if the posting is somewhat related to the need but not completely, category 2 if the posting matches the core of the need but not every stated condition, and category 3 if the posting fully matches every stated condition (role, skills, seniority, salary, location or contract type when mentioned). If none of the above satisfies give it category 0.
Hard conditions: if the search need states a salary threshold, remote work, a job or contract type, or a location, the posting must state that attribute and meet it. A posting that contradicts any of these conditions, or does not state the attribute, can receive at most category 1, however well it matches the rest. Seniority and skills are not hard conditions: a posting that misses them can still receive category 2.

Search need: ${infoNeed}

Job posting:
${card}

Split this problem into steps:
Consider the underlying intent of the search.
Measure how well the posting matches a likely intent of the search need (M).
Measure how trustworthy the posting is (T).
Consider the aspects above and the relative importance of each, and decide on a final score (O). Final score must be an integer value only.
Do not provide any code in result. Provide the final score in the format of: ##final score: score without providing any reasoning.`;
}

export function parseGrade(raw: string): number | null {
  const match =
    raw.match(/##\s*final score:\s*([0-3])/i) ?? raw.match(/\b([0-3])\s*$/);
  return match ? Number(match[1]) : null;
}
