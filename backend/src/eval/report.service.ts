import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { EvalReport } from './eval.service.js';

const CATEGORY_COLORS: Record<string, string> = {
  exact: '#4f86c6',
  semantic: '#7bc47f',
  filtering: '#f7a35c',
  aggregation: '#9b59b6',
  noisy: '#e74c3c',
};

const VERDICT_COLORS = {
  relevant: '#27ae60',
  marginal: '#f39c12',
  not_relevant: '#e74c3c',
};

@Injectable()
export class ReportService implements OnModuleInit {
  private readonly logger = new Logger(ReportService.name);
  private lastReport: EvalReport | null = null;
  private chartJsSource = '';

  onModuleInit() {
    try {
      const chartPath = join(
        process.cwd(),
        'node_modules/chart.js/dist/chart.umd.min.js',
      );
      this.chartJsSource = readFileSync(chartPath, 'utf-8');
      this.logger.log('Chart.js loaded from node_modules');
    } catch {
      this.logger.warn(
        'Could not load chart.js — report charts will not render',
      );
    }
  }

  store(report: EvalReport): void {
    this.lastReport = report;
  }

  getHtml(): string {
    if (!this.lastReport) {
      return this.emptyPage();
    }
    return this.buildHtml(this.lastReport);
  }

  private emptyPage(): string {
    return `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Eval Report</title>
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f5f5f5;}
.msg{text-align:center;color:#555;}</style></head>
<body><div class="msg">
<h2>No evaluation has been run yet.</h2>
<p>POST /api/v1/eval/run to generate one.</p>
</div></body></html>`;
  }

  private buildHtml(r: EvalReport): string {
    const categories = [
      'exact',
      'semantic',
      'filtering',
      'aggregation',
      'noisy',
    ];
    const ks = [1, 3, 5, 10];
    const queries = r.per_query;

    // Precision@K by category (from per-query metrics_by_k)
    const precisionByCatDatasets = ks.map((k, ki) => ({
      label: `K=${k}`,
      data: categories.map((c) => {
        const qCat = queries.filter((q) => q.category === c);
        if (qCat.length === 0) return 0;
        return (
          Math.round(
            (qCat.reduce((s, q) => s + q.metrics_by_k[k].precision_at_k, 0) /
              qCat.length) *
              1000,
          ) / 1000
        );
      }),
      backgroundColor: `rgba(79,134,198,${0.3 + ki * 0.18})`,
    }));

    // MRR by category
    const mrrByCatDatasets = ks.map((k, ki) => ({
      label: `K=${k}`,
      data: categories.map((c) => {
        const qCat = queries.filter((q) => q.category === c);
        if (qCat.length === 0) return 0;
        return (
          Math.round(
            (qCat.reduce((s, q) => s + q.metrics_by_k[k].mrr, 0) /
              qCat.length) *
              1000,
          ) / 1000
        );
      }),
      backgroundColor: `rgba(123,196,127,${0.3 + ki * 0.18})`,
    }));

    const queryLabels = queries.map((q) => `${q.queryId} (${q.category})`);
    const mrrColors = queries.map((q) => CATEGORY_COLORS[q.category] ?? '#999');

    const coverageLabels = queries.map((q) => q.queryId);
    const relevantCounts = queries.map((q) => q.verdict_counts.relevant);
    const marginalCounts = queries.map((q) => q.verdict_counts.marginal);
    const notRelevantCounts = queries.map((q) => q.verdict_counts.not_relevant);

    const agg = r.aggregate;
    const judgeLabel = r.judge === 'local' ? 'Llama 3.1 8B (local)' : 'Gemini';

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>RAG Eval Report — ${r.run_at}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f0f2f5; margin: 0; padding: 24px; color: #222; }
  h1 { font-size: 1.4rem; margin: 0 0 4px; }
  .subtitle { color: #666; font-size: 0.85rem; margin-bottom: 20px; }
  .stat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; margin-bottom: 28px; }
  .stat { background: #fff; border-radius: 8px; padding: 14px 16px; box-shadow: 0 1px 4px rgba(0,0,0,.08); text-align: center; }
  .stat .val { font-size: 1.8rem; font-weight: 700; color: #4f86c6; }
  .stat .lbl { font-size: 0.75rem; color: #888; margin-top: 2px; }
  .charts { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
  .chart-card { background: #fff; border-radius: 8px; padding: 20px; box-shadow: 0 1px 4px rgba(0,0,0,.08); }
  .chart-card h2 { font-size: 0.95rem; margin: 0 0 14px; color: #444; }
  .chart-full { grid-column: 1 / -1; }
  canvas { max-height: 320px; }
  .legend { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
  .legend-item { display: flex; align-items: center; gap: 5px; font-size: 0.78rem; color: #555; }
  .legend-dot { width: 12px; height: 12px; border-radius: 2px; flex-shrink: 0; }
  @media (max-width: 700px) { .charts { grid-template-columns: 1fr; } .chart-full { grid-column: 1; } }
</style>
</head>
<body>
<h1>RAG Evaluation Report</h1>
<div class="subtitle">Run: ${r.run_at} &nbsp;|&nbsp; Judge: ${judgeLabel} &nbsp;|&nbsp; Threshold: ${r.similarity_threshold} &nbsp;|&nbsp; K: ${r.top_k}</div>

<div class="stat-grid">
  <div class="stat"><div class="val">${(agg.precision_at_k * 100).toFixed(1)}%</div><div class="lbl">Precision@${r.top_k}</div></div>
  <div class="stat"><div class="val">${agg.mrr.toFixed(3)}</div><div class="lbl">MRR</div></div>
  <div class="stat"><div class="val">${agg.ndcg.toFixed(3)}</div><div class="lbl">NDCG</div></div>
  <div class="stat"><div class="val">${agg.queries_with_results}/${agg.query_count}</div><div class="lbl">Queries with results</div></div>
  <div class="stat"><div class="val">${agg.queries_with_zero_relevant}</div><div class="lbl">Zero relevant</div></div>
  <div class="stat"><div class="val">${r.marginal_count}</div><div class="lbl">Marginal verdicts</div></div>
</div>

<div class="charts">
  <div class="chart-card">
    <h2>Precision@K by Category</h2>
    <canvas id="precisionChart"></canvas>
  </div>
  <div class="chart-card">
    <h2>MRR@K by Category</h2>
    <canvas id="mrrCatChart"></canvas>
  </div>
  <div class="chart-card">
    <h2>MRR per Query</h2>
    <canvas id="mrrChart"></canvas>
  </div>
  <div class="chart-card">
    <h2>NDCG per Query</h2>
    <canvas id="ndcgChart"></canvas>
  </div>
  <div class="chart-card chart-full">
    <h2>Judge Verdicts per Query (relevant / marginal / not relevant)</h2>
    <canvas id="coverageChart"></canvas>
    <div class="legend">
      <div class="legend-item"><div class="legend-dot" style="background:${VERDICT_COLORS.relevant}"></div>Relevant</div>
      <div class="legend-item"><div class="legend-dot" style="background:${VERDICT_COLORS.marginal}"></div>Marginal</div>
      <div class="legend-item"><div class="legend-dot" style="background:${VERDICT_COLORS.not_relevant}"></div>Not relevant</div>
    </div>
  </div>
</div>

<div class="legend" style="margin-bottom:16px">
  ${categories.map((c) => `<div class="legend-item"><div class="legend-dot" style="background:${CATEGORY_COLORS[c]}"></div>${c}</div>`).join('')}
</div>

<script>${this.chartJsSource}</script>
<script>
// Precision@K by category
new Chart(document.getElementById('precisionChart'), {
  type: 'bar',
  data: {
    labels: ${JSON.stringify(categories)},
    datasets: ${JSON.stringify(precisionByCatDatasets)},
  },
  options: {
    responsive: true,
    plugins: { legend: { position: 'top' } },
    scales: { y: { min: 0, max: 1, title: { display: true, text: 'Precision' } } },
  },
});

// MRR@K by category
new Chart(document.getElementById('mrrCatChart'), {
  type: 'bar',
  data: {
    labels: ${JSON.stringify(categories)},
    datasets: ${JSON.stringify(mrrByCatDatasets)},
  },
  options: {
    responsive: true,
    plugins: { legend: { position: 'top' } },
    scales: { y: { min: 0, max: 1, title: { display: true, text: 'MRR' } } },
  },
});

// MRR per query (horizontal bar)
new Chart(document.getElementById('mrrChart'), {
  type: 'bar',
  data: {
    labels: ${JSON.stringify(queryLabels)},
    datasets: [{ label: 'MRR', data: ${JSON.stringify(queries.map((q) => q.mrr))}, backgroundColor: ${JSON.stringify(mrrColors)} }],
  },
  options: {
    indexAxis: 'y',
    responsive: true,
    plugins: { legend: { display: false } },
    scales: { x: { min: 0, max: 1 } },
  },
});

// NDCG per query (horizontal bar)
new Chart(document.getElementById('ndcgChart'), {
  type: 'bar',
  data: {
    labels: ${JSON.stringify(queryLabels)},
    datasets: [{ label: 'NDCG', data: ${JSON.stringify(queries.map((q) => q.ndcg))}, backgroundColor: ${JSON.stringify(mrrColors)} }],
  },
  options: {
    indexAxis: 'y',
    responsive: true,
    plugins: { legend: { display: false } },
    scales: { x: { min: 0, max: 1 } },
  },
});

// Judge verdicts stacked bar
new Chart(document.getElementById('coverageChart'), {
  type: 'bar',
  data: {
    labels: ${JSON.stringify(coverageLabels)},
    datasets: [
      { label: 'Relevant', data: ${JSON.stringify(relevantCounts)}, backgroundColor: '${VERDICT_COLORS.relevant}' },
      { label: 'Marginal', data: ${JSON.stringify(marginalCounts)}, backgroundColor: '${VERDICT_COLORS.marginal}' },
      { label: 'Not relevant', data: ${JSON.stringify(notRelevantCounts)}, backgroundColor: '${VERDICT_COLORS.not_relevant}' },
    ],
  },
  options: {
    responsive: true,
    plugins: { legend: { display: false } },
    scales: { x: { stacked: true }, y: { stacked: true } },
  },
});
</script>
</body>
</html>`;
  }
}
