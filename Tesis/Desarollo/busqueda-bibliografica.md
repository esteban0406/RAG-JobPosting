# Búsqueda bibliográfica estructurada (E4)

**Para qué:** hallazgo H6 de la revisión del primer borrador (y citas de H2, H5, M2, B5, B8). Ver `decisiones-revision-borrador1.md` §4 y §6.
**Cómo se presenta en la tesis:** como búsqueda **complementaria**, hecha después del primer borrador. La búsqueda original no se presenta como sistemática.
**Regla:** ninguna cita entra a `referencias.bib` sin verificarla en arXiv (`arxiv.org/abs/<id>`) o Crossref (`api.crossref.org/works/<DOI>`). Lo que no se pueda verificar no entra.

Iniciada el 16-nov-2026. Estado: búsquedas y cribado cerrados (16-nov): 149 candidatos a texto completo; falta el texto completo, la selección y la verificación.

## 1. Protocolo

### Bases

| Base | Cómo se consulta | Registro |
|---|---|---|
| Semantic Scholar | API pública (`api.semanticscholar.org/graph/v1/paper/search`), filtro de años | Cadena, fecha, total de resultados, primeros 50 por relevancia |
| arXiv | API pública (`export.arxiv.org/api/query`), categorías cs.IR y cs.CL | Igual |
| Google Scholar | Manual, por el autor (no admite consultas automáticas) | Cadena, fecha, total aproximado, primeros 50 |
| ACM Digital Library | Manual, por el autor | Igual |

### Periodo

2019–2026 (desde BERT aplicado a la recuperación, Nogueira y Cho, 2019). Los trabajos fundacionales anteriores que pide la revisión (BM25, Cranfield, Voorhees, 2000; Buckley y Voorhees, 2004; Webber et al., 2008) entran por *búsqueda hacia atrás* desde los trabajos incluidos, y se declara así.

### Cadenas (en inglés; título y resumen)

| Id | Tema (sección del Cap. 3) | Cadena |
|---|---|---|
| C1 | RAG o recuperación neuronal en empleo | `("retrieval-augmented generation" OR "dense retrieval" OR "semantic search" OR "neural ranking") AND (job OR recruitment OR vacancy OR "job matching" OR "job search")` |
| C2 | Evaluación por componentes de pipelines RAG | `("retrieval-augmented generation" OR RAG) AND evaluation AND (component OR ablation OR retriever OR reranker)` |
| C3 | Jueces LLM de relevancia | `("large language model" OR LLM) AND ("relevance judgments" OR "relevance assessment" OR "LLM-as-a-judge") AND (retrieval OR TREC)` |
| C4 | Variación entre evaluadores humanos | `("assessor disagreement" OR "inter-assessor agreement" OR "relevance judgments") AND (variation OR reliability) AND ("test collection" OR "system ranking")` |
| C5 | Juicios incompletos y agrupamiento | `(pooling OR "incomplete judgments" OR "unjudged documents") AND "test collection" AND retrieval` |
| C6 | Representaciones del dominio laboral | `(JobBERT OR ESCO OR "skill extraction" OR occupation) AND (embedding OR representation OR retrieval)` |
| C7 | Expansión de la consulta | `("query expansion" OR "document expansion" OR doc2query OR HyDE OR RM3) AND retrieval` |
| C8 | Reordenamiento con LLM | `(RankGPT OR "listwise reranking" OR "LLM reranking") AND retrieval` |
| C9 | Latencia percibida en búsqueda | `(latency OR "response time") AND ("web search" OR "search engine") AND (user OR satisfaction OR engagement)` |

### Procedimiento en las bases manuales (lo hace el autor)

Las páginas de resultados se guardan en `Tesis/Desarollo/busqueda/` y Claude extrae de ellas título, año y lugar de publicación; en `busqueda/registro.txt` va una línea por búsqueda: fecha, base, cadena y total de resultados mostrado.
- **Google Scholar:** 20 resultados por página (Configuración); cadena tal cual; intervalo 2019–2026; se guardan las tres primeras páginas («solo HTML»): `scholar-Cn-p1..p3.html`. Scholar no respeta del todo paréntesis y `AND`: se declara como limitación de la base. Las cadenas caben en su límite de unos 256 caracteres (C2 y C5 se acortaron el 16-nov por eso, antes de correr ninguna búsqueda).
- **ACM DL:** Advanced Search, Search Within = Abstract, Publication Date 2019–2026, 50 por página; se guarda la primera página (`acm-Cn-p1.html`) o se exporta BibTeX de todos (`acm-Cn.bib`). Si ACM no acepta la cadena en Abstract, se usa Anywhere y se anota.

### Criterios

- **Inclusión:** artículo revisado por pares o *preprint* con versión verificable; propone o evalúa recuperación, reordenamiento, RAG o su evaluación; o es un recurso del dominio laboral usado en recuperación; en inglés o español.
- **Exclusión:** sin evaluación empírica (salvo encuestas y trabajos de método); recomendación de empleo basada en el historial de interacción sin consulta textual; resúmenes de una página; duplicados (se conserva la versión publicada).
- **Criterio operativo (escrito el 16-nov, después de la primera ronda de revisión; ver §2b):** un registro pasa a texto completo si cumple la inclusión y aporta a **al menos una** de estas líneas del Cap. 3:
  - **L1** Recuperación o RAG en empleo y reclutamiento con consulta textual (búsqueda de ofertas, emparejamiento oferta-persona, títulos de cargo, búsqueda en redes profesionales), con alguna evaluación.
  - **L2** Evaluación de RAG o de pipelines de recuperación por componentes (recuperador, híbrida, reordenador, filtros, rechazo cuando nada responde) o de fallas por etapa.
  - **L3** Evaluación offline: jueces LLM de relevancia, variación entre evaluadores, agrupamiento y juicios incompletos, fiabilidad de las conclusiones, paradigma de Cranfield.
  - **L4** Componentes que la tesis usa o discute: recuperación densa, búsqueda híbrida y fusión, *cross-encoders* y reordenadores con LLM, expansión de consulta o documento, representaciones del dominio laboral (JobBERT, ESCO).
  - **L5** Latencia y comportamiento o satisfacción del usuario en la búsqueda.
  - Se excluyen: eficiencia de sistemas, *hardware* o servicio de modelos sin relación con L1–L5; RAG multimodal, agentes, memoria o generación sin recuperación textual; variantes de un método cuando ya entra el original o una revisión de su línea; duplicados; extracción de habilidades o análisis de hojas de vida sin recuperación evaluada.
  - Las **revisiones y encuestas** entran como contexto de una línea (no son filas de la tabla de trabajos relacionados). Las **obras que nombra la decisión de H6** entran siempre.
  - **Aclaraciones tras la segunda ronda (16-nov, con el autor):** (1) se excluye la recuperación en **dominios o modalidades ajenos sin transferencia a L1–L5** (legal, médico, imágenes, voz, comercio, redes sociales); (2) el motivo de los recursos de software es «sin evaluación empírica»; (3) una participación en una pista o tarea compartida no es motivo de exclusión; (4) L2 incluye la **evaluación de la fidelidad y la detección de alucinaciones** en RAG (la tesis mide fidelidad); (5) **regla de familia confirmada** por el autor; (6) **L5 cubre** la latencia percibida por el usuario y el costo en latencia de los componentes que usa la tesis (reordenamiento con *cross-encoder* o LLM, búsqueda híbrida); queda fuera la eficiencia del servicio de modelos (caché KV, caché de activaciones).
- **Selección:** título y resumen de los primeros 50 resultados por cadena y base; luego texto completo de los candidatos. Para C1 se revisan todos los resultados si son menos de 200.

- **Quién criba (decisión del autor, 16-nov):** Claude criba por título y después por resumen, con el motivo de cada exclusión (`busqueda/cribado.csv`); el autor revisa **todas las inclusiones y una muestra aleatoria de 50 exclusiones** (semilla fija), y se reporta el acuerdo. En el Cap. 3 se declara que el cribado lo hizo un asistente de IA y lo verificó el autor.

### Extracción (para la tabla de trabajos relacionados)

Dominio · corpus (tamaño, idioma) · líneas base · componentes evaluados · métricas · hallazgo principal · relación con JobAI.

## 2. Registro de búsquedas

| Fecha | Base | Cadena | Resultados | Revisados | Candidatos | Incluidos |
|---|---|---|---|---|---|---|
| 16-nov | Google Scholar | C1 | ≈17,000 | 60 | | |
| 16-nov | Google Scholar | C2 | ≈24,300 | 60 | | |
| 16-nov | Google Scholar | C3 | ≈16,500 | 40 | | |
| 16-nov | Google Scholar | C4 | ≈754 | 60 | | |
| 16-nov | Google Scholar | C5 | ≈1,570 | 60 | | |
| 16-nov | Google Scholar | C6 | ≈19,600 | 60 | | |
| 16-nov | Google Scholar | C7 | ≈20,100 | 60 | | |
| 16-nov | Google Scholar | C8 | ≈1,490 | 60 | | |
| 16-nov | Google Scholar | C9 | ≈17,400 | 60 | | |
| 16-nov | ACM DL (Anywhere, sin fechas) | C1 | 8,164 | 50 | | |
| 16-nov | ACM DL (Anywhere, sin fechas) | C2 | 11,512 | 50 | | |
| 16-nov | ACM DL (Anywhere, sin fechas) | C3 | 1,470 | 50 | | |
| 16-nov | ACM DL (Anywhere, sin fechas) | C4 | 1,036 | 50 | | |
| 16-nov | ACM DL (Anywhere, sin fechas) | C5 | 900 | 50 | | |
| 16-nov | ACM DL (Anywhere, sin fechas) | C6 | 150,628 | 50 | | |
| 16-nov | ACM DL (Anywhere, sin fechas) | C7 | 4,290 | 50 | | |
| 16-nov | ACM DL (Anywhere, sin fechas) | C8 | 154 | 50 | | |
| 16-nov | ACM DL (Anywhere, sin fechas) | C9 | 10,955 | 50 | | |
| 16-nov | arXiv (abs, cs.IR/cs.CL) | C1 | 23 | 23 | | |
| 16-nov | arXiv (abs, cs.IR/cs.CL) | C2 | 2266 | 50 | | |
| 16-nov | arXiv (abs, cs.IR/cs.CL) | C3 | 242 | 50 | | |
| 16-nov | arXiv (abs, cs.IR/cs.CL) | C4 | 13 | 13 | | |
| 16-nov | arXiv (abs, cs.IR/cs.CL) | C5 | 13 | 13 | | |
| 16-nov | arXiv (abs, cs.IR/cs.CL) | C6 | 123 | 50 | | |
| 16-nov | arXiv (abs, cs.IR/cs.CL) | C7 | 207 | 50 | | |
| 16-nov | arXiv (abs, cs.IR/cs.CL) | C8 | 84 | 50 | | |
| 16-nov | arXiv (abs, cs.IR/cs.CL) | C9 | 31 | 31 | | |
| 16-nov | Semantic Scholar (bulk, por citas) | C1 | 202 | 202 | | |
| 16-nov | Semantic Scholar (bulk, por citas) | C2 | 1935 | 50 | | |
| 16-nov | Semantic Scholar (bulk, por citas) | C3 | 511 | 50 | | |
| 16-nov | Semantic Scholar (bulk, por citas) | C4 | 10 | 10 | | |
| 16-nov | Semantic Scholar (bulk, por citas) | C5 | 35 | 35 | | |
| 16-nov | Semantic Scholar (bulk, por citas) | C6 | 3007 | 50 | | |
| 16-nov | Semantic Scholar (bulk, por citas) | C7 | 890 | 50 | | |
| 16-nov | Semantic Scholar (bulk, por citas) | C8 | 95 | 50 | | |
| 16-nov | Semantic Scholar (bulk, por citas) | C9 | 264 | 50 | | |

Notas del registro (16-nov):
- **Google Scholar** (autor): filtro 2019–2026 aplicado en todas las páginas (verificado en las URL guardadas). Totales aproximados de la primera página. `scholar-C3-p3.html` contiene en realidad la página 3 de C2 (el extractor identifica cadena y página por el contenido); **a C3 le falta su página 3** (40 revisados).
- **ACM DL** (autor): las 9 cadenas corrieron en **todos los campos (Anywhere)** y **sin filtro de fechas** (algunos filtros no estaban disponibles sin suscripción); primeros 50 por relevancia. Los totales están inflados por buscar en todo el texto (C6: 150.628). El periodo 2019–2026 se aplica en la selección.
- **arXiv** (Claude, API): campo resumen, categorías cs.IR o cs.CL, enviados 2019–2026, primeros 50 por relevancia (todos si son menos). Respuestas crudas en `busqueda/api/arxiv-Cn.xml` con la consulta exacta en `.query.txt`.
- **Semantic Scholar** (Claude, API `paper/search/bulk`, sintaxis booleana): años 2019–2026. La búsqueda masiva no ordena por relevancia, así que se toman los **50 más citados** (C1 completa: 202). Respuestas en `busqueda/api/s2-Cn.json`.
- **Unión:** 1.847 resultados → **1.395 registros únicos** (duplicados por DOI, id de arXiv o título normalizado; 263 aparecen en más de una base). 66 son anteriores a 2019 y 10 no tienen año. Archivos: `busqueda/resultados-scholar-acm.csv` (extraído de las páginas), `busqueda/registros-unicos.csv` (unión), scripts en `busqueda/scripts/`.

## 2b. Cribado (16-nov)

| Etapa | Entran | Excluidos | Quedan |
|---|---|---|---|
| Registros únicos | 1.395 | 66 fuera del periodo (6 marcados para búsqueda hacia atrás: R0137, R0141, R0159, R0168, R0370, R0374) | 1.329 |
| Título | 1.329 | 928 (título fuera del tema) | 401 |
| Resumen | 401 | 264 (motivo por registro) | **137 candidatos a texto completo** |

Candidatos por línea: empleo 38 · evaluación de RAG por componentes 33 · jueces LLM 22 · variación entre evaluadores 8 · agrupamiento y juicios incompletos 8 · expansión 8 · latencia 7 · reordenamiento 6 · dominio laboral (JobBERT, CareerBERT, revisión) 3 · compuerta / consultas sin respuesta 2 · recuperación densa 2. Detalle y motivo de cada decisión en `busqueda/cribado.csv` (columnas `etapa_titulo`, `motivo_titulo`, `etapa_resumen`, `motivo_resumen`). En Scholar el «resumen» es el fragmento que muestra la página; los registros con fragmento ambiguo pasaron a texto completo.

**Primera ronda de revisión del autor (16-nov):** 187 registros a ciegas (137 candidatos y 50 exclusiones al azar). Acuerdo **0,743, κ = 0,29**: el autor excluyó 18 candidatos (11 revisiones o encuestas, más RankGPT, JobBERT y docTTTTTquery, que H6 nombra) e incluyó 30 de las 50 exclusiones (22 del cribado por título, casi todas de recuperación o RAG en general). **Causa:** Claude cribó con un criterio más estrecho que el escrito (aportar a una línea concreta del Cap. 3) y la instrucción al autor resumió el criterio amplio («trata de recuperación, reordenamiento, RAG o su evaluación»); además, el autor excluyó revisiones que el protocolo permitía. El κ mide sobre todo esa diferencia de criterio. **Corrección (decisión del autor):** se escribió el criterio operativo (§1), se resuelven los 48 desacuerdos con él (`busqueda/resolucion-desacuerdos.csv`) y se mide de nuevo el acuerdo con 50 exclusiones que el autor no había visto (`busqueda/revision-autor-2.csv`, a ciegas). En la tesis se reportan las dos rondas.

**Resolución y segunda ronda (16-nov):** el autor aceptó 43 de las 48 propuestas; los 5 restantes se discutieron (Doc2Query++ e IDST fuera por la regla de familia; CacheBlend fuera por el alcance de L5; la compresión de tokens del reordenador dentro por L5; Lynx dentro por L2). En la **segunda ronda a ciegas** (50 exclusiones no vistas, semilla 2026) el autor **confirmó 40 (0,80)**, frente a 20 de 50 (0,40) en la primera; como la muestra solo tiene exclusiones, se reporta la proporción confirmada y no κ. Los 10 desacuerdos se resolvieron con el criterio aclarado: 7 entran (comprensión de consulta en RAG, FaithJudge, LongRanker, reparto de cómputo entre expansión y reordenamiento, dos plataformas de empleo con RAG y una participación en SemEval) y 3 quedan fuera (caché de activaciones por L5; dos variantes de doc2query por la regla de familia).

**Lista cerrada: 149 candidatos a texto completo** (119 del cribado de Claude sin desacuerdo, 21 por propuesta aceptada en la ronda 1, 2 discutidos en la ronda 1 y 7 en la ronda 2). Columnas `decision_final`, `motivo_final` y `origen_decision` en `busqueda/cribado.csv`; archivos del autor: `revision-autor-completado.csv`, `resolucion-desacuerdos (1).csv`, `revision-autor-2 (1).csv`.

**Líneas que las cadenas no recuperaron** (entran por búsqueda hacia atrás desde los incluidos, y se declara): DPR, Sentence-BERT, MTEB, MIRACL, RM3, el recurso ESCO, Voorhees (2000), Buckley y Voorhees (2004), Webber, Moffat y Zobel (2008), Gregor y Hevner (2013) y Arapakis et al. (2014; la versión extendida de 2017 es R0374). Sí aparecieron: ARES (R0449), RankGPT (R1349), doc2query (R0656, R1325), HyDE (R0697), Query2doc (R0655), JobBERT (R0920), Soboroff (R0539, «Don't use LLMs to make relevance judgments») y Clarke y Dietz (R0476, por confirmar en el texto completo).

**Siguiente:** lectura del texto completo de los candidatos acordados → selección final para el Cap. 3 y la tabla de trabajos relacionados → verificación de cada cita en arXiv o Crossref → `referencias.bib`.

## 3. Trabajos incluidos y verificación

| Clave `.bib` | Referencia | Verificado en | Contenido leído | Para (hallazgo, sección) |
|---|---|---|---|---|
| GregorHevner2013 | Gregor y Hevner (2013), MIS Quarterly 37(2):337–355 | Crossref | Sí (PDF del autor, 17-nov): «Exaptation: Known Solutions Extended to New Problems»; la exaptación debe mostrar que la extensión es no trivial e interesante, con desafíos que no existían en el campo de origen | H2, tipo de contribución (§4.1) |
| Arapakis2014 | Arapakis, Bai y Cambazoglu (2014), SIGIR, 103–112 | Crossref | Sí (PDF del autor, 17-nov): los usuarios de un sistema rápido notan más los retrasos; un retraso añadido mayor que 1.000 ms se nota con mucha probabilidad (experimento con retrasos de 0 a 1.750 ms en pasos de 250 ms, búsqueda web) | M2, presupuesto de latencia |
| Bai2017 | Bai, Arapakis, Cambazoglu y Freire (2017), ACM TOIS 36(2):1–42 (= R0374) | Crossref | Sí (PDF del autor, 17-nov): retrasos añadidos menores que 500 ms no se distinguen (no mejor que el azar); mayores que 1.000 ms se notan con muy alta probabilidad; más sensibles los usuarios del sistema rápido | M2, presupuesto de latencia |
| Voorhees2000 | Voorhees (2000), IP&M 36(5):697–716 | Crossref | Sí (PDF del autor, 17-nov): la evaluación comparativa es estable a pesar de diferencias sustanciales en los juicios; cambian las cifras absolutas | H5, variación entre evaluadores |
| Soboroff2025 | Soboroff (2025), Information Retrieval Research 1(1):29–46 (= R0539) | Crossref y arXiv 2409.15133 | Texto (arXiv): usar un LLM como juez fija ese LLM como techo del desempeño medible; hay formas de usar LLM en la evaluación, pero no generar los juicios con un prompt | H5, jueces LLM |
| ClarkeDietz2024 | Clarke y Dietz (2024), arXiv 2412.17156 (= R0476) | arXiv (el DOI 10.20736/0002002105 no está en Crossref) | Texto (arXiv): discuten la afirmación de que los juicios de UMBRELA pueden reemplazar a los humanos | H5, jueces LLM |

Líneas que la decisión de H6 pide cubrir: DPR, Sentence-BERT, expansión de la consulta (RM3, doc2query, HyDE), RankGPT, MTEB/MIRACL, ARES, juicios incompletos (Buckley y Voorhees, 2004; Webber, Moffat y Zobel, 2008), JobBERT y ESCO. Además: Gregor y Hevner (2013) para H2; Voorhees (2000), Soboroff (2025) y Clarke y Dietz (2024) para H5; Arapakis et al. (2014) para M2; fuentes para las dos afirmaciones del §2.4 (B5); versión publicada de los *preprints* del `.bib` (B8, prioridad Yashwant et al., 2026).

## 4. Descartados con motivo

| Referencia | Motivo |
|---|---|
| | |

## 5. Pendiente

- El autor corre C1–C9 en Google Scholar y ACM DL (decidido el 16-nov) y pasa los primeros resultados.
- Semantic Scholar devuelve 429 sin clave: reintentar con pausas.
