// A7 (final round, 26-nov): do the RAGAS metrics see A4? For the queries with an expected filter whose text is
// the same in the Iteration 1 and final runs (the 18 of E2), the constraint compliance of each answer's sources
// (top 5) next to its four RAGAS scores (GPT-6 Sol): mean for low (< 0.5) and high compliance, and Pearson r.
// Needs backend/dist (pnpm build) and a jobs dump, as e2_context_compliance.mjs:
//   docker exec job-posting-db psql -U postgres -d jobpostings_eval -At -c "SELECT json_agg(json_build_object('id',id,'jobType',\"jobType\",'isRemote',\"isRemote\",'minSalary',\"minSalary\",'maxSalary',\"maxSalary\")) FROM \"Job\"" > jobs.json
//   node evaluation/analysis/a4_context_metrics.mjs jobs.json
import { readFileSync } from 'fs';
const root = '/home/esteban/codigo/RAG-JobPosting';
const { matchesFilter } = await import(`${root}/backend/dist/src/retrieval/job-filter.js`);
const jobs = new Map(JSON.parse(readFileSync(process.argv[2], 'utf8')).map((j) => [j.id, j]));
const load = (f) => readFileSync(f, 'utf8').split('\n').filter((l) => l.trim() && !l.startsWith('//')).map((l) => JSON.parse(l));
const RUNS = ['2026-10-14T00-59-39-717ba41-dirty-generate-full', '2026-10-14T20-15-22-de8c6d4-dirty-generate-test-full'];
const finalQ = new Map(load(`${root}/evaluation/runs/${RUNS[1]}/queries.jsonl`).map((q) => [q.id, q]));
const iter1Q = new Map(load(`${root}/evaluation/runs/${RUNS[0]}/queries.jsonl`).map((q) => [q.id, q]));
const common = new Map([...finalQ].filter(([id, q]) => iter1Q.get(id)?.text === q.text && q.expectedFilters && Object.keys(q.expectedFilters).length).map(([id, q]) => [id, q.expectedFilters]));
const M = ['faithfulness', 'answer_relevancy', 'context_relevance', 'context_precision'];
const mean = (v) => v.length ? v.reduce((x, y) => x + y, 0) / v.length : NaN;
for (const run of RUNS) {
  const lines = readFileSync(`${root}/evaluation/runs/${run}/ragas-gpt-6-sol_reasoning_none_temperature_0.csv`, 'utf8').trim().split('\n');
  const head = lines[0].split(',');
  const rag = new Map(lines.slice(1).map((l) => { const c = l.split(','); return [c[0], Object.fromEntries(M.map((m) => [m, Number(c[head.indexOf(m)])]))]; }));
  const rows = [];
  for (const a of load(`${root}/evaluation/runs/${run}/answers.jsonl`)) {
    const f = common.get(a.queryId);
    if (!f || !a.sources?.length || !rag.has(a.queryId)) continue;
    const top = a.sources.slice(0, 5);
    rows.push({ id: a.queryId, c5: top.filter((id) => jobs.has(id) && matchesFilter(jobs.get(id), f)).length / top.length, ...rag.get(a.queryId) });
  }
  const low = rows.filter((r) => r.c5 < 0.5), high = rows.filter((r) => r.c5 >= 0.5);
  console.log(`\n${run.slice(0, 19)}: n=${rows.length}, C@5 mean ${mean(rows.map((r) => r.c5)).toFixed(3)}; low (<0.5) n=${low.length}, high n=${high.length}`);
  for (const m of M) {
    const x = rows.map((r) => r.c5), y = rows.map((r) => r[m]);
    const mx = mean(x), my = mean(y);
    const cov = mean(x.map((v, i) => (v - mx) * (y[i] - my)));
    const sd = (v, m0) => Math.sqrt(mean(v.map((t) => (t - m0) ** 2)));
    const r = cov / (sd(x, mx) * sd(y, my));
    console.log(`  ${m.padEnd(18)} all ${mean(y).toFixed(3)}  low ${mean(low.map((q) => q[m])).toFixed(3)}  high ${mean(high.map((q) => q[m])).toFixed(3)}  r(C@5) ${r.toFixed(2)}`);
  }
}
