export type Verdict = 'relevant' | 'marginal' | 'not_relevant';

export interface IJudgeService {
  judge(
    query: string,
    jobTitle: string,
    jobDescription: string,
  ): Promise<Verdict>;
}
