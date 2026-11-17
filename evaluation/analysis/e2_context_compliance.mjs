// E2 (decisiones-revision-borrador1.md): constraint compliance of the jobs each answer was generated from
// (its sources, top 5) next to its RAGAS faithfulness, for Iteration 1 and 2. Constraints come from the final
// dataset for queries whose text did not change. Needs backend/dist (pnpm build) and a jobs dump:
//   docker exec job-posting-db psql -U postgres -d jobpostings_eval -At -c "SELECT json_agg(json_build_object('id',id,'jobType',\"jobType\",'isRemote',\"isRemote\",'minSalary',\"minSalary\",'maxSalary',\"maxSalary\")) FROM \"Job\"" > jobs.json
//   node evaluation/analysis/e2_context_compliance.mjs jobs.json
import { readFileSync } from 'fs';
const root = '/home/esteban/codigo/RAG-JobPosting';
const { matchesFilter } = await import(`${root}/backend/dist/src/retrieval/job-filter.js`);
const jobs = new Map(JSON.parse(readFileSync(process.argv[2], 'utf8')).map((j) => [j.id, j]));
const load = (f) => readFileSync(f, 'utf8').split('\n').filter((l) => l.trim() && !l.startsWith('//')).map((l) => JSON.parse(l));
const finalQ = new Map(load(`${root}/evaluation/runs/2026-10-14T20-15-22-de8c6d4-dirty-generate-test-full/queries.jsonl`).map((q) => [q.id, q]));
for (const run of ['2026-10-14T00-59-39-717ba41-dirty-generate-full', '2026-10-14T20-15-22-de8c6d4-dirty-generate-test-full']) {
  const queries = new Map(load(`${root}/evaluation/runs/${run}/queries.jsonl`).map((q) => [q.id, q]));
  const faith = new Map(readFileSync(`${root}/evaluation/runs/${run}/ragas-gpt-6-sol_reasoning_none_temperature_0.csv`, 'utf8').split('\n').slice(1).filter(Boolean).map((l) => { const c = l.split(','); return [c[0], Number(c[3])]; }));
  const rows = [];
  for (const a of load(`${root}/evaluation/runs/${run}/answers.jsonl`)) {
    const fq = finalQ.get(a.queryId); const f = fq && fq.text === queries.get(a.queryId)?.text ? fq.expectedFilters : undefined;
    if (!f || !Object.keys(f).length || !a.sources?.length) continue;
    const top = a.sources.slice(0, 5);
    rows.push({ id: a.queryId, c5: top.filter((id) => jobs.has(id) && matchesFilter(jobs.get(id), f)).length / top.length, faith: faith.get(a.queryId) });
  }
  const mean = (v) => v.reduce((x, y) => x + y, 0) / v.length;
  const low = rows.filter((r) => r.c5 < 0.5);
  console.log(rows.map((r) => `${r.id}:${r.c5.toFixed(1)}/${r.faith.toFixed(2)}`).join(' '));
  console.log(run.slice(0, 40), 'constrained answers', rows.length, 'C@5 of context', mean(rows.map((r) => r.c5)).toFixed(3),
    '| faithfulness', mean(rows.map((r) => r.faith)).toFixed(3), '| context C@5<0.5:', low.length, 'faith', low.length ? mean(low.map((r) => r.faith)).toFixed(3) : '-');
}
