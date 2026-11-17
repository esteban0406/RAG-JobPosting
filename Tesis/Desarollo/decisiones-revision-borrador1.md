# Decisiones de corrección del primer borrador

**Fuente:** revisión académica del 16-nov-2026 sobre `borradores/vista-previa-final.pdf` (97 págs.), guardada literal en [`revision-borrador1.md`](revision-borrador1.md). Las secciones y tablas que se citan (§6.7, Tabla 6.14…) siguen la numeración de esa vista previa.
**Decidido:** 16-nov-2026, entre el autor y Claude, hallazgo por hallazgo.
**Estado:** decisiones cerradas; ejecución pendiente. La columna «Estado» de la §4 se actualiza al avanzar.

Correspondencia entre capítulos y archivos. Los que no tienen borrador final se copian a `borradores/` antes de editarlos y se agregan a `build-preview-final.sh`.

| Capítulo (PDF) | Archivo en `Plantilla/` | Borrador final |
|---|---|---|
| Resumen y abstract | `FrontMatter/F04-Abstract.tex` | `borradores/F04-Abstract-final.tex` |
| Siglas (B4) | `FrontMatter/F05-Symbols.tex` (comentado en `main.tex`) | se crea |
| 1. Introducción | `MainMatter/Cap0/M01-Introduction.tex` | se crea |
| 2. Preliminares | `MainMatter/Cap1/M02-Chapter1.tex` | se crea |
| 3. Estado del arte | `MainMatter/Cap2/M03-Chapter2.tex` | se crea |
| 4. Metodología | `MainMatter/Cap3/M04-Chapter3.tex` | `borradores/M04-Chapter3-final.tex` |
| 5. Artefacto | `MainMatter/Cap4/M05-Chapter4.tex` | se crea |
| 6. Resultados y Discusión | `MainMatter/Cap5/M06-Chapter5.tex` | `borradores/M06-Chapter5-final.tex` |
| 7. Conclusiones | `MainMatter/Cap9/M10-Conclusiones.tex` | `borradores/M10-Conclusiones-final.tex` |
| Anexos | `BackMatter/B01-Anexos.tex` | `borradores/B01-Anexos-final.tex` |

---

## 1. Marco

- **Alcance antes del envío al director:** los cinco indispensables de la revisión (H1, H2, H3, H4, M6/M7), los experimentos baratos que corren en uno o dos días con las cachés existentes, y todos los cambios de texto, incluidos los bajos. Lo que necesita personas nuevas o varios días de cuota de Groq se declara como limitación.
- **Calendario:** envío al director el 21 o 22 de noviembre; entrega final en la última semana de noviembre (§10).
- **Presupuesto pagado:** hasta unos 3 USD. Cubre los juicios de GPT-6 Sol de los pares nuevos (E1) y RAGAS con GPT-6 Sol sobre las respuestas de la Iteración 1 (E2). Antes de cada llamada pagada, el autor revisa el crédito real en el panel de OpenAI. El gasto real se anota en `steps.md`.
- **Reglas que siguen vigentes:**
  - Ninguna decisión de configuración se toma mirando el conjunto de prueba. Los experimentos nuevos son análisis adicionales y no cambian el artefacto.
  - Toda cita nueva se verifica en arXiv o Crossref antes de entrar a `referencias.bib`.
  - Sin hipótesis, por pedido del director (19-oct).
  - El título y la pregunta no cambian. El OE4 sí se ajusta (H4) y se le avisa al director.
  - El texto nuevo va a `borradores/`. Antes de reescribir un capítulo, un esquema breve y la aprobación del autor.
  - Commits solo cuando el autor los pida, por tema.

## 2. Verificación de la revisión

Antes de decidir se comprobaron contra los borradores, el código y las corridas las afirmaciones que más pesaban:

| Afirmación | Resultado | Evidencia |
|---|---|---|
| H1: solo 5 de las 12 fallas salieron de corridas del protocolo | **Correcta.** A4, A6, A7, A8 y C2 salen de corridas. A5 («respuestas de agregación») es ambigua. El resto salió de inspección o de revisión de código. Además, A1 no se puede medir con el protocolo: la personalización está fuera del alcance (§2.6). | `M06-Chapter5-final.tex:491-513`; `M02-Chapter1.tex` (Alcance) |
| M7: 0,832 en el texto frente a 0,820 en la Tabla 5.4 | **Correcta; falta la causa.** En la etapa 1, `rr-qwen` con 30 candidatas da 0,820; en la etapa 2, la misma variante con 30 candidatas da 0,832, con las listas idénticas según steps.md. La diferencia vendría del pool o de los qrels de cada etapa. Hay que verificarlo y explicarlo en el texto. | `M05-Chapter4.tex:210, 227`; steps.md, paso 5b de la Iteración 5 |
| M7: C@5 0,41 → 0,97 en el resumen frente a 0,41 → 0,95 en la Tabla 6.14 y el §7.1 | **No es un error.** Son peldaños distintos: 0,95 es +filtros y 0,97 es la configuración completa. Basta con nombrar el peldaño en cada lugar. | steps.md, «Cifras finales» del 14-nov |
| H3: agregar BM25 + filtros es barato | **Correcta.** `Bm25IndexService.search(query, depth, filter)` ya acepta el filtro y las clasificaciones están en caché (`evaluation/classifications/`). | `backend/src/retrieval/retrieval-pipeline.service.ts:308` |
| H4: la fidelidad por peldaño es cara | **Correcta.** `eval:generate` usa la ruta de producción (`rag.buildContext`). Hacen falta unas 250 generaciones nuevas en Groq, entre 3 y 4 días de cuota gratuita, más RAGAS pagado. | `backend/src/cli/commands/eval-generate.command.ts:88` |
| H1: hace falta un contrafactual | **Hay uno barato.** La corrida de la Iteración 1 guarda 85 respuestas de antes de los filtros (A4) y de la instrucción de idioma (A6). Se les puede pasar RAGAS sin llamar a Groq. Su dataset difiere del actual en dos necesidades reemplazadas. | `evaluation/runs/2026-10-14T00-59-39-717ba41-dirty-generate-full/answers.jsonl` |

## 3. Resumen de las decisiones

- **Se reencuadra** (sin experimento): H2, M2, M3, M11, M12.
- **Se agrega evidencia con experimentos baratos:**
  - H1, con el contrafactual E2.
  - H3 y M1, con el lote E1.
  - M4, con la compuerta fuera de dominio (E3).
  - H4, con E2 y el OE4 reescrito.
- **Se declara como limitación:** H5 (sin segundo anotador), M5, M8, M9, M10, M15, M16, y las preguntas Q14 y Q16 del jurado.
- **Se reescribe o completa el texto:**
  - H6, con una búsqueda bibliográfica real (E4).
  - M6, M7 (tablas generadas con un script, E5), M13, M14 y B1–B8.

## 4. Decisiones por hallazgo

Tipo: **E** = experimento nuevo · **T** = texto · **L** = se declara como limitación o amenaza.

### Crítico y altos

| Id | Decisión | Tipo | Dónde | Estado |
|---|---|---|---|---|
| H1 | **Reencuadre más contrafactual.** Las fallas se presentan como *hallazgos de la evaluación formativa*. No se agrega una pregunta de investigación nueva (el director aprobó la pregunta única). Cambios: (1) suavizar el texto en la frase final del resumen y del abstract, el aporte 2, el «segundo vacío» del §2.1, la «Relación con JobAI» del §3.7, §6.7, §6.7.6, §6.8.5 y §7.1 (Objetivo 3); (2) dividir la columna «Detección» de la Tabla 6.14 en tres: *métrica del protocolo*, *inspección durante la preparación* y *revisión de código*; (3) mapear cada falla a uno de los siete puntos de falla de Barnett et al. (2024) o declararla *defecto de software genérico*, y quitar el contraste con Barnett que puede leerse como hombre de paja; (4) agregar el contrafactual E2 (§6). Hay que decir explícitamente que A1 (fuera del alcance) y A2/A5 (ruta de agregación, que RAGAS no evalúa) no se pueden probar con una evaluación de la respuesta final. | T + E | F04, Cap. 1, Cap. 2, Cap. 3, Cap. 6, Cap. 7 | Pendiente |
| H2 | **El artefacto es JobAI (su pipeline). El protocolo es el instrumento de rigor**, como ya dice el §4.1; se corrigen el resumen («se diseñó un protocolo…») y el Cap. 1 («el centro del trabajo es un protocolo»). Se agregan los *objetivos de la solución* (Peffers, actividad 2) como criterios comparativos que el protocolo ya medía: (a) superar a BM25 en nDCG@10 con significancia tras Holm; (b) cumplir las restricciones, medido con C@5 en las consultas que las tienen; (c) una latencia hasta el primer *token* dentro del presupuesto de M2. **Se declara que estos criterios se explicitan ahora y que no eran umbrales numéricos fijados antes de medir.** También: tabla de los siete lineamientos de Hevner et al. (2004) con la sección donde se cumple cada uno; tipo de contribución según Gregor y Hevner (2013) (cita por verificar); separar *demostración* de *evaluación* en la Tabla 4.1. | T | F04, Cap. 1, Cap. 4 (§4.1, Tabla 4.1) | Pendiente |
| H3 | **BM25 + filtros y BM25 + filtros + reordenamiento** en el lote E1. Los pares nuevos se juzgan con GPT-6 Sol y se reporta cuántos son. Se actualizan las Tablas 4.3, 6.3, 6.5 y 6.6, el §6.3.1, la respuesta a la pregunta en la Discusión, el §7.1 y el resumen. Si la ventaja frente a BM25 baja, el texto lo dice tal cual. | E + T | Cap. 4, Cap. 6, Cap. 7, F04 | Pendiente |
| H4 | **Se reescribe el OE4** para que diga lo que se mide: la calidad de la recuperación por componente, y la fidelidad de la configuración final con su cambio entre la Iteración 1 y la 2 (E2). No hay generaciones nuevas por peldaño. El cambio se avisa al director en la nota de envío (§11). | T + E | Cap. 1, Cap. 2 (§2.3.2), Cap. 6 (§6.4), Cap. 7 | Pendiente |
| H5 | **No habrá segundo anotador.** Decisión del autor: no hay nadie disponible que conozca los términos técnicos. Se declara como limitación en el §4.6, en la tabla de amenazas y en las Limitaciones de la Discusión. Se discute la literatura (citas por verificar): Voorhees (2000) sobre la variación entre evaluadores humanos y su efecto en las comparaciones entre sistemas, y Soboroff (2025) y Clarke y Dietz (2024) sobre los jueces LLM. Se refuerza lo que ya está: el κ de calibración solo sirvió para elegir el juez, y los 298 pares de validación se anotaron después, sin ver ningún juez. | L + T | Cap. 3, Cap. 4 (§4.6), Cap. 6 (§6.2, Limitaciones) | Pendiente |
| H6 | **Búsqueda bibliográfica estructurada real** (E4), registrada y descrita con honestidad como *complementaria*: la búsqueda original no se presenta como sistemática. El Cap. 3 recibe: (1) un párrafo de método al inicio (bases, cadenas, periodo, criterios); (2) una tabla de trabajos relacionados al final (dominio, corpus, líneas base, componentes evaluados, métricas, hallazgo); (3) párrafos breves, cada uno con su «Relación con JobAI», para DPR, Sentence-BERT, expansión de la consulta (RM3, doc2query, HyDE), RankGPT, MTEB/MIRACL, ARES, juicios incompletos (Buckley y Voorhees, 2004; Webber, Moffat y Zobel, 2008), JobBERT y ESCO. Una cita que no se pueda verificar no entra. | E + T | Cap. 3, `referencias.bib` | Pendiente |

### Medios

| Id | Decisión | Tipo | Dónde | Estado |
|---|---|---|---|---|
| M1 | **Ablación quitando un componente** desde la configuración completa, en el mismo lote E1: *completa sin híbrida* (densa + filtros + reordenamiento) y *completa sin filtros* (densa + híbrida + reordenamiento). La completa sin reordenamiento ya existe (peldaño +híbrida). La conclusión sobre la híbrida y la recomendación de cambiar la fusión se reescriben según el resultado. | E + T | Cap. 6 (§6.3.2, Discusión), Cap. 7 | Pendiente |
| M2 | **No vuelven las hipótesis**, por instrucción del director. El Cap. 4 declara que el análisis es comparativo y descriptivo. La Discusión retira «la expectativa con que se incorporó» o la ata a lo que dice el Cap. 3. Se agrega un **presupuesto de latencia** con literatura verificada (candidata: Arapakis et al., 2014), que además alimenta el criterio (c) de H2. | T | Cap. 4 (§4.7), Cap. 6 (§6.5, Discusión) | Pendiente |
| M3 | **El título y la pregunta no cambian.** El almacenamiento vectorial se justifica como el componente que fija el costo de la etapa de búsqueda, dentro del «a qué costo» de la pregunta; se dice explícitamente en el Cap. 2 y el Cap. 4. PE4 se presenta como resultado secundario, y la distancia del sintético al caso (KS = 0,23) queda acotada. | T | Cap. 1 (aporte 3), Cap. 2, Cap. 4, Cap. 6 (§6.6) | Pendiente |
| M4 | **Unas 15 consultas fuera de dominio**, escritas por **otra persona** (no necesita formación técnica) con una instrucción breve. Se congelan antes de correr nada y se reportan la precisión y el recall de la compuerta con el umbral ya fijado de 0,134 (E3). El umbral en el borde (0,132 frente a 0,134) se discute como limitación. | E + T + L | Cap. 6 (§6.3.6) | Pendiente |
| M5 | **No se corre la Iteración 1 real** con 15 fragmentos (fuera del lote, por decisión del autor). El texto aclara que la recuperación de la Iteración 1 se aproxima con 50 fragmentos. Para la generación sí hay una medición real de la Iteración 1: E2. | L + T | Cap. 4 (§4.1.1, Tabla 4.3), Cap. 6 | Pendiente |
| M6 | **Tabla de configuraciones** (desplegada, de referencia y evaluada) con los identificadores exactos de los modelos (ingesta, *embeddings*, reordenador, clasificador, generador, jueces) y la fecha de cada corrida. Se corrige «el generador no cambió» en el §6.5 y la mención de modelos retirados en las amenazas. Los parámetros que no se ajustaron (50 fragmentos, 5 ofertas en el contexto, efsearch = 40) se declaran con su origen. | T | Cap. 4 (§4.3, Tabla 4.5), Cap. 5 (§5.1, §5.2), Cap. 6 (§6.5) | Pendiente |
| M7 | **Las tablas de Resultados se generan con un script** (E5) desde los CSV de las corridas. Además: verificar y explicar 0,820 frente a 0,832 (§5.4.1 y Tabla 5.4), nombrar el peldaño de cada C@5, y seguir usando `check-numbers.py` para las cifras del texto. | E + T | Cap. 5, Cap. 6, F04, Cap. 7 | Pendiente |
| M8 | **Amenaza de constructo declarada.** La ganancia de los filtros viene de las 15 necesidades con restricciones, que es justamente donde actúa la regla de condiciones duras. La regla expresa la necesidad tal como se formuló, y la introducción de la regla después de la primera corrida ya está declarada (D1). C@5, que se calcula con SQL y no depende del juez, confirma el efecto: 0,41 → 0,95. No se rejuzga con relevancia solo temática. | L + T | Cap. 4 (§4.6, amenazas), Cap. 6 (§6.3.2, Discusión) | Pendiente |
| M9 | **Deja de llamarse «robustez».** En Resultados queda una frase: el juez de desarrollo da la misma dirección en la escalera (+0,050 / −0,002 / +0,077), con la advertencia de que ese juez no supera el umbral (κ = 0,508) y que por eso no es evidencia de robustez. La Discusión (§6.8.1) remite a esa frase. Cierra la decisión que estaba abierta en steps.md. | T | Cap. 6 | Pendiente |
| M10 | **La fragmentación se excluye explícitamente** del alcance (§2.6), con la razón: evaluarla exige reindexar el corpus y rehacer el agrupamiento. Se retira el apoyo en las iteraciones de abril y se suma al trabajo futuro. | L + T | Cap. 2 (§2.6), Cap. 4 (§4.1.1), Cap. 5 (§5.2), Cap. 7 | Pendiente |
| M11 | **El título no cambia.** El dominio se justifica en el §2.1 y el §4.4: el corpus viene de agregadores orientados al empleo remoto, y la modalidad es una condición dura que se evalúa. Se precisa la redacción («ofertas de agregadores orientados al empleo remoto») y se dice con claridad que el 36 % del corpus no está marcado como remoto. | T | Cap. 2 (§2.1), Cap. 4 (§4.4) | Pendiente |
| M12 | **Se recorta sin reestructurar.** La Introducción queda como panorama breve: contexto, enfoque, aportes reformulados según H1 y H2, y organización del documento, sin repetir la pregunta y los objetivos completos. El §2.6 se reduce a definiciones mínimas que remiten al Cap. 3. Se mantiene el Cap. 2 «Preliminares» que pidió el director. | T | Cap. 1, Cap. 2 (§2.6) | Pendiente |
| M13 | **Fórmulas** de nDCG, MRR, P@k, R@10 y kappa, y una subsección breve sobre el paradigma de Cranfield, en el Cap. 4 o en el Anexo A si la síntesis del Cap. 4 lo exige. | T | Cap. 4 (§4.7, Tabla 4.4) o Anexo A | Pendiente |
| M14 | **Se precisa «reproducible».** Repetir el análisis desde las cachés es *repetibilidad*. La *reproducibilidad* queda limitada porque el código es público pero el corpus no. Se ajusta en el OE2, el §4.11 y las Conclusiones. | T | Cap. 2 (OE2), Cap. 4 (§4.11), Cap. 7 | Pendiente |
| M15 | **Limitación:** las consultas en español son traducciones del autor y no consultas reales. Se conserva el argumento de la traducción perfecta (§6.3.5). | L | Cap. 4 (§4.4.1), Cap. 6 (Limitaciones) | Pendiente |
| M16 | **Se declara y pasa a trabajo futuro.** Se refuerza la amenaza de que la Iteración 2 se decidió después de ver la corrida de prueba y de que el autor redactó todas las consultas. Como contrapeso se nombra lo que sí se hizo: las reglas previas en el conjunto de desarrollo, un juez final distinto del de desarrollo, y A8 y C2 dejadas sin corregir. | L | Cap. 4 (Tabla 4.5), Cap. 6 (Limitaciones), Cap. 7 | Pendiente |

### Bajos (todos en esta ronda)

| Id | Decisión | Dónde | Estado |
|---|---|---|---|
| B1 | Punto decimal en el abstract (0.79, 1%). | F04 | Pendiente |
| B2 | Resumen más corto, con cuatro o cinco cifras clave. Antes se revisa el límite institucional de palabras. | F04 | Pendiente |
| B3 | Etiqueta del Anexo C: se completa al etiquetar la versión enviada (§10, paso 5). | Anexo C | Pendiente |
| B4 | Lista de siglas (RRF, ANN, HNSW, TTFT, PE, nDCG, MRR, DSR…) con la plantilla `FrontMatter/F05-Symbols.tex`, que hoy está comentada en `main.tex`. | FrontMatter, `main.tex` | Pendiente |
| B5 | Las dos afirmaciones del §2.4 («Muchas plataformas anuncian hoy “búsqueda con IA”…» y «Quien busca empleo pierde tiempo…»): se respaldan con una fuente verificada o se suavizan. | Cap. 2 | Pendiente |
| B6 | Marcas intermedias en el eje logarítmico de la Fig. 6.2, con `figures.py`. La Fig. 5.1 se mejora solo si sobra tiempo. | Cap. 6, `evaluation/analysis/figures.py` | Pendiente |
| B7 | Menos cifras por párrafo en el §6.5 y el §6.6.2: las cifras van a las tablas y el texto interpreta. | Cap. 6 | Pendiente |
| B8 | Verificar cada referencia del `.bib` (con prioridad en los preprints recientes, p. ej. Yashwant et al., 2026) y usar la versión publicada cuando exista. | `referencias.bib` | Pendiente |

## 5. Decisiones de procedimiento

- **Holm.** Las comparaciones nuevas de E1 forman una **familia aparte, rotulada como análisis posterior a la revisión**. Las familias fijadas antes de la corrida final (14 comparaciones frente a las líneas base y 9 de la escalera) no cambian, y sus p ajustados tampoco. Si los pares nuevos aportan relevantes que no estaban en el agrupamiento, sube el IDCG y hay que recalcular los nDCG de todos los sistemas. Se reporta cuánto cambian.
- **Consultas fuera de dominio (M4).** Las escribe otra persona, se congelan en un archivo antes de correr el pipeline y nadie mira puntajes antes de congelarlas.
- **Segundo anotador (H5).** No habrá; ver la §8.
- **Mapa del jurado.** Se incluye en este documento (§9) y se mantiene al día durante la edición.

## 6. Experimentos nuevos

| | Qué | Cómo | Costo | Salida y dónde se reporta |
|---|---|---|---|---|
| **E1** | Lote de PE1 (H3, M1): `bm25-filtered`, `bm25-filtered-rerank`, completa sin híbrida y completa sin filtros (nombres definitivos al implementar) | Sistemas nuevos en `backend/src/cli/commands/eval-retrieve.command.ts` (registro de sistemas, patrón `pipelineSystem(...)`). BM25 + filtros con `Bm25IndexService.search(query, depth, filter)`; si hace falta, una opción de candidatos solo léxicos en `RetrievalPipeline` para la variante con reordenamiento. Las otras dos salen de las opciones `hybrid`/`rerank`/`filterFor` de `PipelineSystem`. Pruebas unitarias y `pnpm build`. Se corre `eval:retrieve` con todos los sistemas y **se verifica que los anteriores reproducen las listas de** `evaluation/runs/2026-10-14T19-15-49-565eff3-retrieve-test-full`; si no, se combinan las listas viejas con las nuevas. Después: `eval:pool`, conteo de pares nuevos, aprobación del costo, `eval:judge` con GPT-6 Sol (lo viejo sale de la caché) y `metrics.py` con la familia post hoc (cambio en `evaluation/analysis/metrics.py`). | < 1 USD (≈ 0,002 USD por par) | Tablas 6.3, 6.5 y 6.6 regeneradas (E5), §6.3.1, §6.3.2, Discusión, §7.1, resumen |
| **E2** | Contrafactual de H1 y la Iteración 1 frente a la 2 (H4) | `ragas_eval.py` sobre `evaluation/runs/2026-10-14T00-59-39-717ba41-dirty-generate-full` con los mismos *flags* que la corrida final (`--judge-base-url https://api.openai.com/v1 --judge-model gpt-6-sol --reasoning-effort none --temperature 0 --max-tokens 4096 --concurrency 4`; requiere `embedding-server` en `:8000`). Se compara con la corrida final en las consultas comunes, por categoría, con foco en las restricciones (A4: ¿la fidelidad se mantiene alta aunque solo el 41 % de las cinco primeras ofertas cumpla?) y en el español (A6: ¿la relevancia de la respuesta castiga las respuestas en inglés?). | ~2 USD (estimado) | §6.4 (PE2, Iteración 1 frente a 2), §6.7 (contrafactual), Discusión, §7.1 |
| **E3** | Compuerta con consultas fuera de dominio (M4) | `evaluation/datasets/queries.test-ood.jsonl` (unas 15, de otra persona). `eval:retrieve` con la configuración completa produce `rerank-top.jsonl`; con 0,134 se calculan la precisión y el recall de «sin resultados», sumando los mejores puntajes de las consultas de prueba dentro del dominio (los 2 falsos negativos ya conocidos). Sin juez. Si alguna consulta llama al clasificador con LLM, son pocas llamadas a Groq. | 0 USD | §6.3.6 |
| **E4** | Búsqueda bibliográfica (H6, y citas de H5, M2, B5, B8) | Bases: Google Scholar, Semantic Scholar, arXiv y ACM DL. Cadenas, periodo (2019–2026), criterios de inclusión y exclusión, y resultados registrados en `Tesis/Desarollo/busqueda-bibliografica.md`. Cada cita se verifica en arXiv o Crossref antes de entrar al `.bib`. | 0 USD | Cap. 3 (método, tabla, líneas nuevas), Cap. 4, Cap. 6 |
| **E5** | Script de tablas (M7) | `evaluation/analysis/tables.py` (imagen `jobai-analysis`, coma decimal como `figures.py`) escribe un `.tex` por tabla de Resultados en `Tesis/Desarollo/borradores/tablas/`. `M06-Chapter5-final.tex` las incluye con `\input`, y `build-preview-final.sh` las copia. **Prueba de regresión:** antes de incorporar E1, las tablas generadas deben coincidir con las cifras actuales. | 0 USD | Todas las tablas de Resultados |

## 7. Cambios de texto por capítulo

| Capítulo | Hallazgos |
|---|---|
| Resumen y abstract (F04) | H1 (frase final), H2 (artefacto), H3/M1 (cifras nuevas), M7 (peldaño de cada C@5), B1, B2 |
| Siglas (F05) | B4 |
| 1. Introducción | M12 (panorama breve), H1 (aporte 2), H2 (artefacto), M3 (aporte 3) |
| 2. Preliminares | H1 (segundo vacío del §2.1), H4 (OE4), M3, M10 (alcance), M11 (§2.1), M12 (§2.6), M14 (OE2), B5 (§2.4) |
| 3. Estado del arte | H6 (método, tabla y líneas nuevas), H1 (§3.7), H5 (jueces LLM y variación humana) |
| 4. Metodología | H2 (§4.1, objetivos de la solución, Hevner, Gregor y Hevner, Tabla 4.1), H3 (Tabla 4.3), H5 (§4.6), M2 (descriptivo y presupuesto de latencia), M3, M5, M6, M8 (amenaza), M11 (§4.4), M13 (fórmulas, Cranfield), M14 (§4.11), M15, M16 (Tabla 4.5) |
| 5. Artefacto | M6 (configuraciones y parámetros), M7 (0,820 frente a 0,832), M10 (§5.2) |
| 6. Resultados | H1 (§6.7, Tabla 6.14, contrafactual), H3/M1 (Tablas 6.3, 6.5, 6.6; §6.3.1, §6.3.2), H4 (§6.4), H5 (§6.2), M4 (§6.3.6), M6 (§6.5), M7 (tablas generadas), M9, B6, B7 |
| Discusión (Cap. 6) | Respuesta a la pregunta con E1, H1 (§6.8.5), M1, M2, M8, M9 (§6.8.1), Limitaciones (H5, M4, M5, M15, M16, Q14, Q16) |
| 7. Conclusiones | H1 (Objetivo 3), H3/M1, H4 (Objetivo 4), M10 y M16 (trabajo futuro), M14 |
| Anexos | M13 (si las fórmulas van al Anexo A), B3, protocolo de E3 y E4 |

## 8. Lo que no se hace y cómo se declara

| Qué propuso la revisión | Por qué no se hace | Cómo queda en la tesis |
|---|---|---|
| Pregunta secundaria con A1, A2, A4, A5 y A6 reintroducidas (H1-a) | A1 no se ejercita en `eval:generate` (no hay usuario) y A2/A5 son de la ruta de agregación, que RAGAS no evalúa. Además agrega una pregunta que el director no aprobó. | Hallazgos formativos más el contrafactual E2 para A4 y A6 |
| Fidelidad por peldaño (H4) | Unas 250 generaciones, entre 3 y 4 días de cuota de Groq, más ~5-6 USD. | OE4 reescrito; la Iteración 1 frente a la 2 con E2 |
| Segundo anotador y κ humano–humano (H5) | No hay nadie disponible que conozca los términos técnicos. | Limitación y amenaza, más la literatura sobre la variación entre evaluadores |
| Iteración 1 real con 15 fragmentos (M5) | El autor no la incluyó en el lote. | Aclaración de la aproximación con 50 fragmentos |
| Relevancia solo temática (M8) | Rejuzgar cuesta 1-2 USD (fuera del presupuesto) y los veredictos v1 locales vienen de un juez no válido. | Amenaza de constructo y argumento con C@5 |
| Segundo juez sobre todo el agrupamiento (M9) | ~5,6 USD, fuera del presupuesto. | Observación con advertencia; no se habla de robustez |
| Ablación de la fragmentación (M10) | Reindexar, otra colección, corrida y juicio: varios días. | Exclusión explícita y trabajo futuro |
| Corrida confirmatoria con necesidades de otra persona (M16) | Requiere a alguien disponible y entre 2 y 3 días. | Amenaza reforzada y trabajo futuro |
| Hipótesis a priori (M2) | El director pidió quitarlas. | Análisis declarado comparativo y descriptivo; presupuesto de latencia |
| Subpregunta sobre el motor (M3) o cambio de título (M11) | El director aprobó la pregunta y el título. | Justificación por «a qué costo» y por el origen del corpus |

## 9. Mapa de las preguntas del jurado

| # | Pregunta (resumida) | Decisión que la responde | Sección |
|---|---|---|---|
| 1 | ¿Cuál es el artefacto? ¿Qué criterio de éxito había antes de medir? | H2. JobAI; criterios comparativos explicitados ahora, con la honestidad de decir que no eran umbrales previos. Lo que sí se fijó antes fueron las reglas de decisión en el conjunto de desarrollo. | §4.1 |
| 2 | ¿Qué parte de la detección de las fallas se debe al protocolo? | H1. Columna de detección dividida; hallazgos formativos | §6.7 |
| 3 | ¿RAGAS habría detectado A1 o A2? | H1/E2. A4 y A6 se prueban con E2; A1 y A2 no se pueden probar con RAGAS, y se dice | §6.7 |
| 4 | ¿No se contradice a Barnett con otro tipo de falla? | H1. Mapeo a los siete puntos de falla; los defectos genéricos se declaran como tales | §6.7, §6.8.5 |
| 5 | ¿Cuánto queda de +0,263 si BM25 tiene los mismos filtros? | H3/E1 | §6.3.1 |
| 6 | ¿Por qué confiar en κ = 0,79 con un solo anotador? | H5. Limitación declarada, validación anotada a ciegas, literatura sobre la variación entre evaluadores | §4.6, §6.2, Limitaciones |
| 7 | ¿La recalibración acercó al autor al criterio del juez? | H5. El κ de calibración solo eligió el juez; la validación se anotó después sin ver ningún juez; amenaza declarada | §4.6 |
| 8 | ¿Qué parte del +0,046 es por construcción? | M8. Amenaza de constructo y C@5 (0,41 → 0,95), que no depende del juez | §4 (amenazas), §6.3.2 |
| 9 | ¿Se probó quitar la híbrida de la configuración completa? | M1/E1 | §6.3.2 |
| 10 | ¿Es aceptable 1,96 s hasta el primer *token*? | M2. Presupuesto de latencia con literatura | §4.7, §6.5 |
| 11 | ¿Qué tiene de específico lo remoto? | M11 | §2.1, §4.4 |
| 12 | ¿Por qué pgvector frente a Qdrant está en una tesis de RAG? | M3. El componente que fija el costo de la búsqueda («a qué costo») | §2, §4, §6.6 |
| 13 | ¿Por qué no se evaluó la fragmentación? | M10. Exclusión explícita | §2.6 |
| 14 | ¿Qué cambiaría con otra distribución de fuentes (84 % Findwork)? | Sin hallazgo propio: **nueva limitación** sobre la generalización a otras fuentes, con la distribución del corpus | Limitaciones |
| 15 | ¿Cómo se descarta que la prueba haya orientado el diseño? | M16. Amenaza reforzada, reglas previas en desarrollo, juez final distinto, A8 y C2 abiertas | Tabla 4.5, Limitaciones |
| 16 | ¿Cómo saber que no queda una novena falla del arnés? | Sin hallazgo propio: **nueva limitación** que no la descarta. La mitigan las verificaciones de conteo (lección de D5), la reproducción de listas en E1 y las tablas generadas por script (E5) | Limitaciones |
| 17 | La contribución en una frase que sirva fuera del caso | Propuesta abajo, para aprobar después de E1 y E2 | Cap. 1, Cap. 7 |

**Propuesta para la Q17** (se ajusta con los resultados de E1 y E2; requiere la aprobación del autor): *En una búsqueda de empleo con condiciones duras, la ventaja de un pipeline RAG sobre una búsqueda léxica con los mismos filtros se descompone en aportes de componentes concretos, y su tamaño y su costo solo se ven midiendo cada etapa por separado, con métricas que no dependen del juez.*

## 10. Orden de ejecución y calendario

| Fecha | Qué | Confirmación del autor |
|---|---|---|
| 17-nov | E1 (código, corrida, pool, conteo de pares → juicio → métricas); E2 (RAGAS de la Iteración 1); E5 (script de tablas y regresión); pedirle las consultas de M4 a otra persona; empezar E4 | Aprobación del costo de E1 y E2 después de revisar el crédito real |
| 18-nov | E3, en cuanto lleguen las consultas; esquema breve de los cambios de cada capítulo | Aprobación de los esquemas |
| 18–20 nov | Edición en `borradores/`, en este orden: Resultados → Metodología → Artefacto → Preliminares e Introducción → Estado del arte → Discusión y Conclusiones → Anexos y siglas → resumen y abstract (al final, porque dependen de todas las cifras) | Revisión de cada capítulo |
| 21-nov | `bash Tesis/Desarollo/build-preview-final.sh` (sin errores; resumen y abstract en las pp. 3-4, «Contenido» en la p. 5); `python3 Tesis/Desarollo/check-numbers.py` (listas vacías); revisión completa de la vista previa | Aprobación de la versión |
| 22-nov | Borradores a `Plantilla/` y `latexmk`; nota al director (§11); *fast-forward* de `main` a `thesis/qdrant-eval` y push (dispara `docker-publish`); etiqueta de la versión y B3; envío | Cada paso por separado |

Si E1 o E2 se atrasan, la edición de los capítulos que no dependen de sus cifras (Estado del arte, Preliminares, Metodología salvo la Tabla 4.3) se adelanta.

## 11. Qué avisarle al director en la nota de envío

- El OE4 se ajustó para decir lo que se mide (H4). Es el único cambio a los objetivos que él aprobó; la pregunta y el título no cambiaron.
- Se agregaron análisis posteriores a la corrida final, en una familia de Holm aparte: BM25 con los mismos filtros, ablación quitando un componente, RAGAS de la Iteración 1 y la compuerta con consultas fuera de dominio. Ninguno cambió la configuración del artefacto.
- Las fallas se presentan ahora como hallazgos de la evaluación formativa, con el origen de cada detección explícito (H1).
- Se aclaró que el artefacto de DSR es JobAI y que el protocolo es el instrumento (H2).
- El estado del arte tiene ahora un método de búsqueda declarado y una tabla de trabajos relacionados (H6).
- Limitaciones nuevas o reforzadas: un solo anotador humano para la validación del juez, consultas redactadas por el autor, fragmentación fuera del alcance, distribución de fuentes del corpus.
