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
import difflib
import hashlib
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
# A period after these words does not end a sentence ("Sr. Software Engineer", "EE. UU.").
ABBREVIATIONS = {"Sr", "Sra", "Jr", "Dr", "Dra", "Mr", "Mrs", "Ms", "St", "Inc", "Ltd", "Co", "Corp",
                 "vs", "etc", "approx", "aprox", "EE", "e.g", "i.e", "U.S", "p.ej"}


def sentences(text: str) -> list[str]:
    out: list[str] = []
    for piece in (s.strip() for s in SENTENCE.split(text)):
        if not piece:
            continue
        last = out[-1].split()[-1].lstrip("(\"'¿¡").rstrip(".") if out else ""
        if last in ABBREVIATIONS:
            out[-1] += " " + piece
        else:
            out.append(piece)
    return out


def units(answer: str) -> list[str]:
    out = []
    for line in answer.splitlines():
        text = BULLET.sub("", line.replace("**", "")).strip()
        if text:
            out.extend(sentences(text))
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
    digest = hashlib.sha1(json.dumps([i["units"] for i in items], ensure_ascii=False).encode()).hexdigest()[:8]
    store = f"ragas-review-{args.seed}-{args.per_category}-{digest}"
    html = TEMPLATE.replace("__DATA__", json.dumps(items, ensure_ascii=False).replace("</", "<\\/"))
    html = html.replace("__STORE__", store)
    html = html.replace("__MIGRATE__", json.dumps(migration(args.run_dir / PAGE, items, store)))
    (args.run_dir / PAGE).write_text(html, encoding="utf-8")
    (args.run_dir / KEY).write_text(
        json.dumps(
            {"seed": args.seed, "per_category": args.per_category, "queryIds": [i["queryId"] for i in items]},
            indent=2,
        )
    )
    n_units = sum(len(i["units"]) for i in items)
    print(f"{len(items)} answers, {n_units} units → {args.run_dir / PAGE}")


def migration(old_page: Path, items: list[dict], store: str) -> dict | None:
    """Map the unit indices of the page being replaced to the new ones, so that the labels
    the reviewer already saved in the browser survive a change in how answers are split.
    Units whose text changed are dropped and must be labeled again."""
    if not old_page.exists():
        return None
    text = old_page.read_text(encoding="utf-8")
    data = re.search(r"^const DATA = (.*);$", text, re.M)
    old_store = re.search(r'^const STORE = "(.*)";$', text, re.M)
    if not data or not old_store or old_store.group(1) == store:
        return None
    old = {i["queryId"]: i["units"] for i in json.loads(data.group(1))}
    index = {}
    for item in items:
        before = old.get(item["queryId"], [])
        matcher = difflib.SequenceMatcher(a=before, b=item["units"], autojunk=False)
        index[item["queryId"]] = {
            str(b.a + k): b.b + k for b in matcher.get_matching_blocks() for k in range(b.size)
        }
    return {"from": old_store.group(1), "index": index}


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
  #guide { position:fixed; inset:0; background:rgba(0,0,0,.55); z-index:10; display:none; overflow:auto; padding:24px 16px; }
  #guide.open { display:block; }
  #guide .card { max-width:860px; margin:0 auto; background:var(--panel); border:1px solid var(--line);
                 border-radius:12px; padding:20px 24px; }
  #guide h2 { font-size:21px; margin:0 0 8px; }
  #guide h3 { font-size:17px; margin:24px 0 6px; }
  #guide .close { position:sticky; top:0; float:right; }
  #guide .toc { color:var(--muted); font-size:14px; }
  #guide a { color:var(--focus); }
  #guide table { border-collapse:collapse; width:100%; margin:6px 0; }
  #guide th, #guide td { border-top:1px solid var(--line); padding:5px 8px; text-align:left; vertical-align:top; font-size:14px; }
  #guide th { background:var(--bg); }
  #guide li { margin-bottom:6px; }
  #guide .job { font-size:13px; }
  .tag { display:inline-block; min-width:24px; text-align:center; border-radius:4px; color:#fff; font-weight:600; padding:0 6px; }
  .tag.S { background:var(--s); } .tag.N { background:var(--n); } .tag.X { background:var(--x); }
  #guide-btn { border-color:var(--focus); font-weight:600; }
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
  <button id="guide-btn">Guía</button>
</header>
<div id="guide" role="dialog" aria-label="Guía">
<div class="card">
<button class="close" id="guide-close">Cerrar guía ✕</button>
<h2>Guía para revisar las respuestas</h2>
<p class="toc"><a href="#g-que">Qué vas a hacer</a> · <a href="#g-opciones">S, N y –</a> ·
  <a href="#g-ejemplo">Ejemplo completo</a> · <a href="#g-reglas">Casos dudosos</a> ·
  <a href="#g-glosario">Glosario</a> · <a href="#g-pagina">Cómo usar la página y entregar</a></p>

<h3 id="g-que">1. Qué vas a hacer</h3>
<p>Una persona buscó empleo escribiendo una consulta corta (arriba a la izquierda, después de
  <b>Consulta:</b>). Un buscador encontró algunas ofertas de empleo (los recuadros de la izquierda) y un
  asistente de inteligencia artificial escribió una respuesta usando <b>solo</b> esas ofertas (la columna de la derecha).</p>
<p>La respuesta está partida en trozos, uno por fila. Para cada fila tienes que decidir una sola cosa:
  <b>¿lo que dice esa fila aparece en las ofertas de la izquierda?</b></p>
<p>Es un trabajo de comparar textos, como el de quien verifica datos antes de publicar una noticia. <b>No necesitas
  saber de programación ni de inteligencia artificial</b>, ni entender para qué sirve cada tecnología que se menciona:
  basta con comprobar que el dato está a la izquierda. Tampoco tienes que opinar si la respuesta es buena, útil o si
  las ofertas le sirven a quien buscó.</p>
<p>No hay respuestas "esperadas": marca lo que veas. Tus marcas no se comparan con las de nadie mientras trabajas.</p>

<h3 id="g-opciones">2. Las tres opciones</h3>
<table>
<tr><td><span class="tag S">S</span></td><td><b>Sí está respaldado.</b> Todo lo que dice la fila aparece en las ofertas de la
  izquierda, aunque esté con otras palabras, en otro idioma o con las cifras escritas de otra forma.</td></tr>
<tr><td><span class="tag N">N</span></td><td><b>No está respaldado.</b> La fila dice algo que las ofertas contradicen
  (otra cifra, otro país, otra empresa) o algo que las ofertas no mencionan.</td></tr>
<tr><td><span class="tag X">–</span></td><td><b>No afirma nada que se pueda comprobar.</b> Saludos, introducciones
  ("Aquí tienes las ofertas…", "Based on the job postings provided…"), cierres ("Espero que te sirva", "Let me know…")
  y títulos vacíos ("Requisitos:", "Key Responsibilities:").</td></tr>
</table>

<h3 id="g-ejemplo">3. Ejemplo completo (inventado)</h3>
<p>Supón que a la izquierda está esta única oferta:</p>
<div class="job">Job: Data Analyst at Acme Corp | Location: USA | Type: full_time | Salary: $70,000–$90,000 | Similarity: 0.81
[identity]: Data Analyst at Acme Corp. in USA. full_time, remote.
[requirements]: Requirements for Data Analyst at Acme Corp: 3+ years of experience with SQL and Excel. Experience with Tableau.
[benefits]: Benefits at Acme Corp: Health insurance. 20 days of paid vacation.</div>
<p>Y la respuesta tiene estas filas:</p>
<table>
<tr><th>Fila de la respuesta</th><th>Marca</th><th>Por qué</th></tr>
<tr><td>Aquí tienes una oferta que coincide con tu búsqueda:</td><td><span class="tag X">–</span></td><td>Es una introducción.</td></tr>
<tr><td>Data Analyst at Acme Corp</td><td><span class="tag S">S</span></td><td>Existe una oferta con ese cargo en esa empresa.</td></tr>
<tr><td>Modalidad: remoto, tiempo completo.</td><td><span class="tag S">S</span></td><td>La oferta dice "full_time, remote".</td></tr>
<tr><td>Salario: $70k–$90k.</td><td><span class="tag S">S</span></td><td>Mismas cifras: "k" significa mil.</td></tr>
<tr><td>Requisitos clave:</td><td><span class="tag X">–</span></td><td>Título vacío: no dice nada por sí solo.</td></tr>
<tr><td>3 o más años con SQL, Excel y Python.</td><td><span class="tag N">N</span></td><td>Python no aparece en la oferta. Basta una parte que no esté.</td></tr>
<tr><td>Beneficios: seguro médico y 30 días de vacaciones.</td><td><span class="tag N">N</span></td><td>La oferta dice 20 días, no 30.</td></tr>
<tr><td>Ubicación: Canadá.</td><td><span class="tag N">N</span></td><td>La oferta dice USA (Estados Unidos).</td></tr>
<tr><td>Salary: Not specified.</td><td><span class="tag N">N</span></td><td>Sí lo especifica: $70,000–$90,000.</td></tr>
<tr><td>Es una excelente empresa para crecer profesionalmente.</td><td><span class="tag N">N</span></td><td>La oferta no dice nada de eso, aunque suene razonable.</td></tr>
<tr><td>¡Mucho éxito en tu búsqueda!</td><td><span class="tag X">–</span></td><td>Es un cierre.</td></tr>
</table>

<h3 id="g-reglas">4. Casos dudosos</h3>
<ol>
<li><b>Toda la fila tiene que estar respaldada.</b> Si la fila dice varias cosas (por ejemplo, cinco habilidades) y
  una sola no aparece o es distinta, márcala <b>N</b>. Si quieres, anota en la nota de abajo qué parte faltaba.</li>
<li><b>Busca en todas las ofertas de la izquierda</b> y en todas sus partes (encabezado, requisitos, responsabilidades,
  beneficios). Pero el dato tiene que corresponder a la oferta de la que habla la fila: si la respuesta le atribuye a
  la empresa A un salario que en realidad es de la empresa B, es <b>N</b>.</li>
<li><b>Otras palabras u otro idioma cuentan como lo mismo</b> si significan lo mismo: "remote" = "remoto",
  "5+ years" = "5 o más años", "$150k" = "$150,000". Mira el glosario.</li>
<li><b>No uses lo que sabes por tu cuenta.</b> Si la fila dice algo que es cierto en el mundo pero no aparece en las
  ofertas, es <b>N</b>. La pregunta es solo si está en la izquierda.</li>
<li><b>"No especificado" / "Not specified"</b>: <b>S</b> si la oferta de verdad no da ese dato; <b>N</b> si sí lo da.</li>
<li><b>Nombres de empresa o cargo solos</b> (por ejemplo, una fila que solo dice el nombre de una empresa, o
  "Cargo at Empresa"): <b>S</b> si a la izquierda hay una oferta de esa empresa o con ese cargo en esa empresa.</li>
<li><b>Conclusiones o comparaciones del asistente</b> ("Por lo tanto, X es la que más se ajusta", "esta no paga más de
  150k", "ambas piden lo mismo"): <b>S</b> si los datos de la izquierda permiten afirmarlo; <b>N</b> si no.</li>
<li><b>Introducciones que hablan de la búsqueda</b> ("estas son las ofertas que coinciden con tus criterios"):
  <b>–</b>. No tienes que juzgar si las ofertas encajan con lo que se buscó.</li>
<li><b>Una fila que no entiendes</b> (por ejemplo, porque quedó cortada): márcala lo mejor que puedas y escribe una
  nota. Las notas se leen todas.</li>
<li><b>Ignora "Similarity: 0.87"</b> y números parecidos del encabezado de cada oferta: son datos internos del
  buscador, no parte de la oferta.</li>
</ol>

<h3 id="g-glosario">5. Glosario</h3>
<p><b>Las tecnologías y herramientas</b> (React, Node.js, Python, TypeScript, PostgreSQL, AWS, Kubernetes, Terraform,
  Figma, Salesforce, PyTorch…) <b>son nombres propios: no necesitas saber qué son</b>, solo comprobar que el mismo
  nombre aparece a la izquierda. Estas variantes son el mismo nombre: React = React.js = ReactJS · Node = Node.js =
  NodeJS · Postgres = PostgreSQL · JS = JavaScript · TS = TypeScript · K8s = Kubernetes · ML = machine learning =
  aprendizaje automático · AI = IA = inteligencia artificial · GCP = Google Cloud. En cambio, <b>son distintos</b>:
  Java y JavaScript; React y React Native.</p>
<table>
<tr><th colspan="2">Partes de cada oferta (izquierda)</th></tr>
<tr><td>Job: <i>cargo</i> at <i>empresa</i></td><td>Cargo y empresa ("at" = "en").</td></tr>
<tr><td>Location</td><td>Ubicación.</td></tr>
<tr><td>Type</td><td>Tipo de contrato (ver abajo).</td></tr>
<tr><td>Salary / Pay / Compensation</td><td>Salario / pago / remuneración.</td></tr>
<tr><td>[identity]</td><td>Identificación: cargo, empresa, lugar y modalidad.</td></tr>
<tr><td>[requirements]</td><td>Requisitos.</td></tr>
<tr><td>[responsibilities]</td><td>Responsabilidades o funciones. "Skills" = habilidades.</td></tr>
<tr><td>[benefits]</td><td>Beneficios.</td></tr>
<tr><th colspan="2">Modalidad y contrato</th></tr>
<tr><td>Remote</td><td>Remoto (desde casa). "Fully remote" = totalmente remoto.</td></tr>
<tr><td>Hybrid / On-site</td><td>Híbrido / presencial.</td></tr>
<tr><td>full_time, Full-time</td><td>Tiempo completo.</td></tr>
<tr><td>part_time, Part-time</td><td>Medio tiempo.</td></tr>
<tr><td>contract</td><td>Contrato por servicios o por proyecto (no es empleado de planta).</td></tr>
<tr><td>Freelance</td><td>Independiente, trabajo por encargo.</td></tr>
<tr><td>Internship / Intern</td><td>Práctica / practicante.</td></tr>
<tr><th colspan="2">Lugares</th></tr>
<tr><td>USA, US, U.S.</td><td>Estados Unidos (en español: EE. UU.).</td></tr>
<tr><td>UK / UKI</td><td>Reino Unido / Reino Unido e Irlanda.</td></tr>
<tr><td>LATAM</td><td>Latinoamérica.</td></tr>
<tr><td>EMEA</td><td>Europa, Oriente Medio y África.</td></tr>
<tr><td>Worldwide / Anywhere</td><td>Desde cualquier país.</td></tr>
<tr><th colspan="2">Dinero</th></tr>
<tr><td>$</td><td>Dólares estadounidenses (USD), salvo que diga otra moneda.</td></tr>
<tr><td>k</td><td>Mil: $150k = $150,000.</td></tr>
<tr><td>$150,000</td><td>En inglés la coma separa los miles: es 150.000 (ciento cincuenta mil).</td></tr>
<tr><td>$90,000–$160,000</td><td>Rango: entre 90.000 y 160.000.</td></tr>
<tr><td>/hour, /hr, per hour</td><td>Por hora. "per year", "annual" = al año.</td></tr>
<tr><td>Base salary</td><td>Salario fijo, sin comisiones.</td></tr>
<tr><td>OTE (On-Target Earnings)</td><td>Ingreso total si se cumplen las metas: fijo + comisiones.</td></tr>
<tr><td>Equity</td><td>Acciones de la empresa como parte del pago.</td></tr>
<tr><th colspan="2">Experiencia y nivel</th></tr>
<tr><td>5+ years</td><td>5 años o más.</td></tr>
<tr><td>Junior (Jr.) · Mid · Senior (Sr.)</td><td>Principiante · intermedio · con experiencia.</td></tr>
<tr><td>Lead · Staff · Principal</td><td>Niveles por encima de Senior (líder técnico).</td></tr>
<tr><td>Manager · Director · Head of</td><td>Jefe de equipo · director · jefe de un área.</td></tr>
<tr><th colspan="2">Cargos frecuentes</th></tr>
<tr><td>Software Engineer / Developer</td><td>Ingeniero de software / programador.</td></tr>
<tr><td>Front-end · Back-end · Full-stack</td><td>Programa lo que se ve en pantalla · lo que corre en el servidor · ambas cosas.</td></tr>
<tr><td>DevOps / Platform Engineer</td><td>Mantiene los servidores y la infraestructura donde corre el software.</td></tr>
<tr><td>Data Scientist · Data Analyst</td><td>Analiza datos para sacar conclusiones o hacer predicciones.</td></tr>
<tr><td>ML Engineer</td><td>Ingeniero de aprendizaje automático (modelos de inteligencia artificial).</td></tr>
<tr><td>Product Manager</td><td>Gerente de producto: decide qué se construye.</td></tr>
<tr><td>Product Designer · UI/UX Designer</td><td>Diseña las pantallas y la experiencia de uso de una aplicación.</td></tr>
<tr><td>Account Executive (AE)</td><td>Vendedor que consigue clientes nuevos y cierra ventas.</td></tr>
<tr><td>Account Manager</td><td>Atiende a clientes que ya compraron.</td></tr>
<tr><td>Customer Success Manager (CSM)</td><td>Se asegura de que el cliente aproveche el producto y renueve.</td></tr>
<tr><td>FP&amp;A</td><td>Planeación y análisis financiero (presupuestos y proyecciones).</td></tr>
<tr><td>Bookkeeper · Accountant</td><td>Auxiliar contable · contador.</td></tr>
<tr><th colspan="2">Términos de negocio</th></tr>
<tr><td>SaaS</td><td>Software que se usa por internet y se paga por suscripción.</td></tr>
<tr><td>B2B</td><td>Empresa que le vende a otras empresas.</td></tr>
<tr><td>Enterprise · Mid-market · SMB</td><td>Clientes grandes · medianos · pequeños.</td></tr>
<tr><td>Renewal · Churn</td><td>Renovación del contrato · clientes que cancelan.</td></tr>
<tr><td>Pipeline · Quota</td><td>Lista de ventas posibles · meta de ventas.</td></tr>
<tr><td>Stakeholders</td><td>Personas interesadas o afectadas (jefes, clientes, otras áreas).</td></tr>
</table>
<p>Si encuentras un término que no está aquí, no hace falta entenderlo: compara que la misma palabra o cifra esté a la izquierda.</p>

<h3 id="g-pagina">6. Cómo usar la página y entregar</h3>
<ul>
<li>Son 20 respuestas. Cambia de respuesta con <b>Siguiente →</b> y <b>← Anterior</b> (o las flechas del teclado).
  Arriba a la derecha ves cuántas filas llevas y qué respuestas faltan.</li>
<li>Marca con los botones <b>S</b>, <b>N</b>, <b>–</b>, o con el teclado: <b>s</b>, <b>n</b> y <b>x</b> (para –)
  marcan la fila resaltada en azul y pasan a la siguiente; <b>j</b>/<b>k</b> bajan y suben sin marcar.
  Puedes cambiar una marca cuando quieras haciendo clic en otro botón.</li>
<li>Al hacer clic en una fila, sus cifras y nombres se resaltan en <mark>amarillo</mark> en las ofertas. Es solo una
  ayuda: que algo se resalte no significa que la fila esté respaldada, y algo puede estar escrito de otra forma sin
  resaltarse. También puedes buscar con <b>Ctrl+F</b>.</li>
<li>Debajo de las filas hay una caja de <b>nota</b> por respuesta, opcional, para cualquier duda o comentario.</li>
<li><b>Tu avance se guarda solo</b> en este navegador y en este computador. Puedes cerrar y seguir otro día abriendo
  el mismo archivo con el mismo navegador. No uses una ventana de incógnito ni borres el historial mientras tanto.
  Para tener una copia de seguridad, usa <b>Descargar CSV</b>; con <b>Cargar CSV</b> se recupera.</li>
<li><b>Para entregar:</b> cuando arriba diga "completo", pulsa <b>Descargar CSV</b> y envía el archivo
  <code>ragas-review-labels.csv</code> que se descarga. No hace falta enviar nada más.</li>
<li>Puedes volver a abrir esta guía cuando quieras con el botón <b>Guía</b>.</li>
</ul>
<p><button id="guide-start">Entendido, empezar</button></p>
</div>
</div>

<main>
  <section id="ctx"></section>
  <section id="ans">
    <p class="q">Respuesta del asistente, por partes</p>
    <p class="help">Cada fila es un trozo de la respuesta que escribió el asistente (no es una pregunta).
      <b>S</b>: las ofertas de la izquierda lo respaldan · <b>N</b>: lo contradicen o no lo mencionan ·
      <b>–</b>: no afirma nada (introducción, cierre, título vacío). Teclado: <b>s</b> / <b>n</b> / <b>x</b> marcan
      y avanzan; <b>j</b>/<b>k</b> bajan y suben; <b>←</b>/<b>→</b> cambian de respuesta. Dudas: botón <b>Guía</b>.</p>
    <div id="units"></div>
    <p class="help">Nota sobre esta respuesta (opcional):</p>
    <textarea id="note"></textarea>
  </section>
</main>
<script>
const DATA = __DATA__;
const STORE = "__STORE__";
const MIGRATE = __MIGRATE__;
let state = { i: 0, labels: {}, notes: {} };
try { const s = JSON.parse(localStorage.getItem(STORE)); if (s) state = Object.assign(state, s); } catch (e) {}
// Labels saved by an earlier version of this page (answers split differently): keep the units
// whose text did not change; the rest stay unlabeled.
try {
  const old = MIGRATE && !localStorage.getItem(STORE) && JSON.parse(localStorage.getItem(MIGRATE.from));
  if (old) {
    let kept = 0, dropped = 0;
    Object.entries(old.labels || {}).forEach(([k, l]) => {
      const [qid, u] = [k.slice(0, k.lastIndexOf("#")), k.slice(k.lastIndexOf("#") + 1)];
      const to = (MIGRATE.index[qid] || {})[u];
      if (to === undefined) dropped++; else { state.labels[qid + "#" + to] = l; kept++; }
    });
    state.notes = old.notes || {};
    state.i = old.i || 0;
    localStorage.setItem(STORE, JSON.stringify(state));
    if (kept || dropped) setTimeout(() => alert("Página actualizada (unidades corregidas): " + kept +
      " marcas conservadas" + (dropped ? ", " + dropped + " unidades cambiaron y hay que marcarlas de nuevo" : "") + "."), 0);
  }
} catch (e) {}
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
  const q = document.createElement("p"); q.className = "q"; q.textContent = "Consulta: " + item.question; ctx.appendChild(q);
  const m = document.createElement("p"); m.className = "meta";
  m.textContent = item.queryId + " · " + item.contexts.length + " ofertas que el asistente tuvo para responder";
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
const guide = document.getElementById("guide");
const openGuide = () => { guide.classList.add("open"); guide.scrollTop = 0; };
const closeGuide = () => { guide.classList.remove("open"); state.guideSeen = true; save(); };
document.getElementById("guide-btn").onclick = openGuide;
document.getElementById("guide-close").onclick = closeGuide;
document.getElementById("guide-start").onclick = closeGuide;
guide.onclick = e => { if (e.target === guide) closeGuide(); };
document.addEventListener("keydown", e => {
  if (guide.classList.contains("open")) { if (e.key === "Escape") closeGuide(); return; }
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
    if (i < 0) return;
    const u = DATA[i].units[+k] === unit ? +k : DATA[i].units.indexOf(unit);
    if (label && u >= 0) { state.labels[key(i, u)] = label; n++; }
    if (note) state.notes[qid] = note;
  });
  save(); render(); alert(n + " etiquetas cargadas");
};
render();
if (!state.guideSeen) openGuide();
</script>
</body>
</html>
"""

if __name__ == "__main__":
    main()
