"""Human check of RAGAS faithfulness on a sample of generated answers.

Usage (standard library only):
    python3 evaluation/analysis/ragas_review.py make <generate run dir> [--per-category 5] [--seed 42]
    python3 evaluation/analysis/ragas_review.py compare <generate run dir> --labels <labels.csv> \
        --judge <ragas-<judge>.csv> [--judge <ragas-<other judge>.csv> ...]

make samples answered queries (stratified by category, fixed seed), splits each
answer deterministically into units (one per line or bullet, and one per
sentence within it) and writes ragas-review.html, a self-contained page that
shows the retrieved contexts next to the units. The reviewer marks each unit as
S (supported by the contexts), N (not supported: contradicted or absent) or -
(not a checkable claim). The page never shows a judge's score; it keeps the
progress in the browser and exports ragas-review-labels.csv. Which queries were
sampled goes to ragas-review-key.json.

compare computes the human faithfulness of each answer, S / (S + N), and its
agreement with each judge's faithfulness on the same answers.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import random
import re
import statistics
from pathlib import Path

PAGE = "ragas-review.html"
KEY = "ragas-review-key.json"
SENTENCE = re.compile(r"(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡])")
BULLET = re.compile(r"^\s*(?:[*\-•]+|\d+\.)\s+")


def units(answer: str) -> list[str]:
    out = []
    for line in answer.splitlines():
        text = BULLET.sub("", line).replace("**", "").strip()
        if text:
            out.extend(s.strip() for s in SENTENCE.split(text) if s.strip())
    return out


def load_answers(run_dir: Path) -> list[dict]:
    rows = [json.loads(l) for l in (run_dir / "answers.jsonl").read_text().splitlines() if l.strip()]
    return [r for r in rows if r.get("answer")]


def make(args: argparse.Namespace) -> None:
    rows = load_answers(args.run_dir)
    rng = random.Random(args.seed)
    sample = []
    for category in sorted({r["category"] for r in rows}):
        pool = sorted((r for r in rows if r["category"] == category), key=lambda r: r["queryId"])
        sample.extend(rng.sample(pool, min(args.per_category, len(pool))))
    rng.shuffle(sample)
    items = [
        {"queryId": r["queryId"], "question": r["question"], "contexts": r["contexts"], "units": units(r["answer"])}
        for r in sample
    ]
    html = TEMPLATE.replace("__DATA__", json.dumps(items, ensure_ascii=False).replace("</", "<\\/"))
    html = html.replace("__STORE__", f"ragas-review-{args.seed}-{args.per_category}")
    (args.run_dir / PAGE).write_text(html, encoding="utf-8")
    (args.run_dir / KEY).write_text(
        json.dumps(
            {"seed": args.seed, "per_category": args.per_category, "queryIds": [i["queryId"] for i in items]},
            indent=2,
        )
    )
    n_units = sum(len(i["units"]) for i in items)
    print(f"{len(items)} answers, {n_units} units → {args.run_dir / PAGE}")


def read_judge(path: Path) -> dict[str, float]:
    with path.open(newline="") as fh:
        return {r["queryId"]: float(r["faithfulness"]) for r in csv.DictReader(fh) if r["faithfulness"] not in ("", "nan")}


def pearson(x: list[float], y: list[float]) -> float:
    try:
        return statistics.correlation(x, y)
    except statistics.StatisticsError:
        return math.nan


def compare(args: argparse.Namespace) -> None:
    key = json.loads((args.run_dir / KEY).read_text())
    counts: dict[str, dict[str, int]] = {q: {"S": 0, "N": 0, "-": 0} for q in key["queryIds"]}
    unsupported: list[dict] = []
    unlabeled: list[str] = []
    with args.labels.open(newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            if row["label"] in ("S", "N", "-"):
                counts[row["queryId"]][row["label"]] += 1
            else:
                unlabeled.append(f"{row['queryId']}#{row['unit_index']}")
            if row["label"] == "N":
                unsupported.append({"queryId": row["queryId"], "unit": row["unit"]})
    missing = [q for q, c in counts.items() if sum(c.values()) == 0]
    if missing or unlabeled:
        raise SystemExit(f"Unlabeled: {len(missing)} answers {missing}, {len(unlabeled)} units {unlabeled[:10]}")
    human = {q: c["S"] / (c["S"] + c["N"]) for q, c in counts.items() if c["S"] + c["N"]}
    report = {
        "n_answers": len(human),
        "units": {k: sum(c[k] for c in counts.values()) for k in ("S", "N", "-")},
        "answers_with_unsupported": sum(1 for c in counts.values() if c["N"]),
        "human_mean": statistics.mean(human.values()),
        "human": human,
        "unsupported": unsupported,
        "judges": {},
    }
    for path in args.judge:
        judge = read_judge(path)
        ids = [q for q in human if q in judge]
        h, j = [human[q] for q in ids], [judge[q] for q in ids]
        report["judges"][path.stem] = {
            "n": len(ids),
            "judge_mean": statistics.mean(j),
            "human_mean": statistics.mean(h),
            "mean_abs_diff": statistics.mean(abs(a - b) for a, b in zip(h, j)),
            "pearson": pearson(h, j),
            "per_answer": {q: {"human": human[q], "judge": judge[q]} for q in ids},
        }
    out = args.run_dir / "ragas-review-report.json"
    out.write_text(json.dumps(report, indent=2, ensure_ascii=False))
    print(f"{report['n_answers']} answers; units S/N/-: {report['units']}; "
          f"{report['answers_with_unsupported']} answers with an unsupported unit; human mean {report['human_mean']:.3f}")
    for name, r in report["judges"].items():
        print(f"{name}: judge {r['judge_mean']:.3f} vs human {r['human_mean']:.3f}, "
              f"mean |diff| {r['mean_abs_diff']:.3f}, pearson {r['pearson']:.3f} (n={r['n']})")
    print(f"Written to {out}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)
    p_make = sub.add_parser("make")
    p_make.add_argument("run_dir", type=Path)
    p_make.add_argument("--per-category", type=int, default=5)
    p_make.add_argument("--seed", type=int, default=42)
    p_cmp = sub.add_parser("compare")
    p_cmp.add_argument("run_dir", type=Path)
    p_cmp.add_argument("--labels", type=Path, required=True)
    p_cmp.add_argument("--judge", type=Path, action="append", required=True)
    args = parser.parse_args()
    make(args) if args.cmd == "make" else compare(args)


TEMPLATE = r"""<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Verificación de fidelidad</title>
<style>
  :root { --bg:#fafafa; --fg:#1d1d1f; --muted:#6b6b70; --panel:#fff; --line:#e2e2e6;
          --s:#1f8a4c; --n:#c0392b; --x:#7a7a80; --focus:#2f6fed; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#161618; --fg:#ececf0; --muted:#9a9aa2; --panel:#1f1f22; --line:#33333a;
            --s:#3fbf74; --n:#ef6b5b; --x:#9a9aa2; --focus:#6f9bff; }
  }
  * { box-sizing:border-box; }
  body { margin:0; font:15px/1.5 system-ui, sans-serif; background:var(--bg); color:var(--fg); }
  header { display:flex; flex-wrap:wrap; gap:12px; align-items:center; padding:10px 16px;
           border-bottom:1px solid var(--line); background:var(--panel); position:sticky; top:0; z-index:2; }
  header h1 { font-size:16px; margin:0 12px 0 0; }
  header .grow { flex:1; }
  button { font:inherit; border:1px solid var(--line); background:var(--panel); color:var(--fg);
           border-radius:6px; padding:4px 10px; cursor:pointer; }
  button:hover { border-color:var(--focus); }
  main { display:grid; grid-template-columns:1fr 1fr; gap:0; height:calc(100vh - 54px); }
  @media (max-width: 900px) { main { grid-template-columns:1fr; height:auto; } }
  section { overflow:auto; padding:16px; }
  #ctx { border-right:1px solid var(--line); }
  .q { font-size:18px; font-weight:600; margin:0 0 4px; }
  .meta { color:var(--muted); font-size:13px; margin-bottom:12px; }
  .job { white-space:pre-wrap; background:var(--panel); border:1px solid var(--line); border-radius:8px;
         padding:10px 12px; margin-bottom:12px; font-size:13.5px; }
  .unit { display:grid; grid-template-columns:auto 1fr; gap:10px; align-items:start; padding:8px;
          border:1px solid var(--line); border-radius:8px; margin-bottom:8px; background:var(--panel); }
  .unit.cur { outline:2px solid var(--focus); }
  .unit .btns { display:flex; gap:4px; }
  .unit button { width:30px; padding:2px 0; }
  .unit[data-l="S"] button.S { background:var(--s); color:#fff; border-color:var(--s); }
  .unit[data-l="N"] button.N { background:var(--n); color:#fff; border-color:var(--n); }
  .unit[data-l="-"] button.X { background:var(--x); color:#fff; border-color:var(--x); }
  .help { color:var(--muted); font-size:13px; margin:0 0 12px; }
  textarea { width:100%; min-height:60px; font:inherit; background:var(--panel); color:var(--fg);
             border:1px solid var(--line); border-radius:8px; padding:6px; }
  mark { background:#f3d36b; color:#000; }
</style>
</head>
<body>
<header>
  <h1>Verificación de fidelidad</h1>
  <button id="prev">← Anterior</button>
  <span id="pos"></span>
  <button id="next">Siguiente →</button>
  <span class="grow"></span>
  <span id="progress"></span>
  <button id="import">Cargar CSV</button>
  <input id="file" type="file" accept=".csv" hidden>
  <button id="export">Descargar CSV</button>
</header>
<main>
  <section id="ctx"></section>
  <section id="ans">
    <p class="help">Para cada unidad de la respuesta: <b>S</b> sostenida por el contexto de la izquierda ·
      <b>N</b> no sostenida (lo contradice o no aparece) · <b>–</b> no es una afirmación verificable
      (introducción, cierre, cortesía). Teclado: <b>s</b> / <b>n</b> / <b>x</b> marcan la unidad actual y avanzan;
      <b>j</b>/<b>k</b> mueven la unidad; <b>←</b>/<b>→</b> cambian de respuesta. Haz clic en una unidad
      para resaltar sus cifras en el contexto.</p>
    <div id="units"></div>
    <p class="help">Nota sobre esta respuesta (opcional):</p>
    <textarea id="note"></textarea>
  </section>
</main>
<script>
const DATA = __DATA__;
const STORE = "__STORE__";
let state = { i: 0, labels: {}, notes: {} };
try { const s = JSON.parse(localStorage.getItem(STORE)); if (s) state = Object.assign(state, s); } catch (e) {}
let cur = 0;
const save = () => { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) {} };
const key = (i, u) => DATA[i].queryId + "#" + u;

function highlight(text) {
  const ctx = document.getElementById("ctx");
  ctx.querySelectorAll(".job").forEach((el, k) => { el.textContent = DATA[state.i].contexts[k]; });
  const tokens = (text.match(/[\d][\d.,]*[kK+%]?|[A-Z][\w&.-]{2,}/g) || []).filter(t => t.length > 1);
  if (!tokens.length) return;
  const esc = tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp("(" + esc.join("|") + ")", "g");
  ctx.querySelectorAll(".job").forEach(el => {
    const parts = el.textContent.split(re);
    el.textContent = "";
    parts.forEach((p, k) => {
      if (k % 2) { const m = document.createElement("mark"); m.textContent = p; el.appendChild(m); }
      else el.appendChild(document.createTextNode(p));
    });
  });
}

function render() {
  const item = DATA[state.i];
  const ctx = document.getElementById("ctx");
  ctx.textContent = "";
  const q = document.createElement("p"); q.className = "q"; q.textContent = item.question; ctx.appendChild(q);
  const m = document.createElement("p"); m.className = "meta";
  m.textContent = item.queryId + " · " + item.contexts.length + " ofertas recuperadas (contexto que recibió el generador)";
  ctx.appendChild(m);
  item.contexts.forEach(c => { const d = document.createElement("div"); d.className = "job"; d.textContent = c; ctx.appendChild(d); });
  const box = document.getElementById("units");
  box.textContent = "";
  item.units.forEach((u, k) => {
    const row = document.createElement("div"); row.className = "unit" + (k === cur ? " cur" : "");
    row.dataset.l = state.labels[key(state.i, k)] || "";
    const btns = document.createElement("div"); btns.className = "btns";
    [["S", "S"], ["N", "N"], ["X", "–"]].forEach(([cls, txt]) => {
      const b = document.createElement("button"); b.className = cls; b.textContent = txt;
      b.onclick = ev => { ev.stopPropagation(); setLabel(k, cls === "X" ? "-" : cls); };
      btns.appendChild(b);
    });
    const t = document.createElement("div"); t.textContent = u;
    row.appendChild(btns); row.appendChild(t);
    row.onclick = () => { cur = k; render(); highlight(u); };
    box.appendChild(row);
  });
  document.getElementById("note").value = state.notes[item.queryId] || "";
  document.getElementById("pos").textContent = "Respuesta " + (state.i + 1) + " de " + DATA.length;
  const total = DATA.reduce((a, d) => a + d.units.length, 0);
  const done = Object.keys(state.labels).length;
  const pending = DATA.map((d, i) => d.units.some((_, k) => !state.labels[key(i, k)]) ? i + 1 : null).filter(x => x);
  document.getElementById("progress").textContent = done + " / " + total + " unidades" +
    (pending.length ? " · faltan respuestas " + pending.join(", ") : " · completo");
}

function setLabel(k, l) {
  state.labels[key(state.i, k)] = l; save();
  cur = Math.min(k + 1, DATA[state.i].units.length - 1); render();
  document.querySelector(".unit.cur")?.scrollIntoView({ block: "nearest" });
}
function go(d) { state.i = Math.max(0, Math.min(DATA.length - 1, state.i + d)); cur = 0; save(); render();
  document.getElementById("ctx").scrollTop = 0; document.getElementById("ans").scrollTop = 0; }

document.getElementById("prev").onclick = () => go(-1);
document.getElementById("next").onclick = () => go(1);
document.getElementById("note").oninput = e => { state.notes[DATA[state.i].queryId] = e.target.value; save(); };
document.addEventListener("keydown", e => {
  if (e.target.tagName === "TEXTAREA") return;
  if (e.key === "s") setLabel(cur, "S");
  else if (e.key === "n") setLabel(cur, "N");
  else if (e.key === "x") setLabel(cur, "-");
  else if (e.key === "j") { cur = Math.min(cur + 1, DATA[state.i].units.length - 1); render(); }
  else if (e.key === "k") { cur = Math.max(cur - 1, 0); render(); }
  else if (e.key === "ArrowRight") go(1);
  else if (e.key === "ArrowLeft") go(-1);
});
document.getElementById("export").onclick = () => {
  const q = s => '"' + String(s).replace(/"/g, '""') + '"';
  const lines = ["queryId,unit_index,unit,label,note"];
  DATA.forEach((d, i) => d.units.forEach((u, k) =>
    lines.push([q(d.queryId), k, q(u), q(state.labels[key(i, k)] || ""), q(k === 0 ? (state.notes[d.queryId] || "") : "")].join(","))));
  const blob = new Blob([lines.join("\n") + "\n"], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = "ragas-review-labels.csv"; a.click();
};
function parseCsv(text) {
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n") { row.push(f); rows.push(row); row = []; f = ""; }
    else if (c !== "\r") f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}
document.getElementById("import").onclick = () => document.getElementById("file").click();
document.getElementById("file").onchange = async e => {
  const file = e.target.files[0]; if (!file) return;
  const rows = parseCsv(await file.text()).slice(1);
  let n = 0;
  rows.forEach(([qid, k, unit, label, note]) => {
    const i = DATA.findIndex(d => d.queryId === qid);
    if (i < 0 || DATA[i].units[+k] !== unit) return;
    if (label) { state.labels[key(i, +k)] = label; n++; }
    if (note) state.notes[qid] = note;
  });
  save(); render(); alert(n + " etiquetas cargadas");
};
render();
</script>
</body>
</html>
"""

if __name__ == "__main__":
    main()
