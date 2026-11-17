# Revisión académica — Tesis JobAI (primer borrador)

Nov 16, 2026 · @Esteban

Revisión del primer borrador de «Evaluación por componentes de un pipeline de Retrieval-Augmented Generation para la búsqueda de empleo remoto: el caso JobAI» (Luis Esteban Peña Rodríguez, Universidad Sergio Arboleda, 2026).

Se leyeron las 97 páginas completas: cuerpo, anexos y bibliografía. Las páginas de las figuras 5.2 y 6.2 se revisaron además como imagen. La bibliografía no se verificó contra fuentes externas: las referencias que se proponen como faltantes son líneas a revisar, no citas listas para copiar.

**Escala de gravedad:** CRÍTICO compromete la validez o coherencia; ALTO requiere corrección importante antes de avanzar; MEDIO afecta la calidad sin comprometer el conjunto; BAJO es presentación o estilo.

## 1. Concepto general del director

El borrador es mucho más riguroso de lo habitual en un trabajo de pregrado; sus debilidades están en el encuadre, no en la ejecución. El protocolo de evaluación tiene casi todo lo que pediría un revisor de un workshop de IR:

- un corpus congelado con huella SHA-256;
- conjuntos de desarrollo y de prueba separados;
- reglas de decisión fijadas antes de ver los datos;
- un juez LLM validado contra juicios humanos, con un plan B previsto;
- pruebas de aleatorización con corrección de Holm;
- la necesidad de información como unidad de análisis;
- una tabla de amenazas a la validez.

El documento reporta con honestidad los resultados nulos (la búsqueda híbrida, el cambio de modelo de embeddings) y deja abiertas dos fallas a propósito para no ajustar el sistema al conjunto de prueba. Esa disciplina se sostiene ante un jurado.

Las debilidades importantes son de encuadre:

1. **No está claro cuál es la contribución ni cuál es el artefacto de DSR.** A veces el centro es el protocolo y a veces es JobAI.
2. **La conclusión que cierra el resumen y el capítulo 7 va más allá de la evidencia.** La afirmación de que el protocolo reveló las fallas silenciosas choca con la propia Tabla 6.14: más de la mitad se detectaron por revisión de código, inspección de planes de ejecución o contraste con la documentación.
3. **Algunas decisiones del diseño experimental inflan la brecha entre RAG y la búsqueda por palabras clave, o dejan objetivos a medias.** BM25 compite sin filtros, y la fidelidad no se mide por componente aunque el OE4 lo promete.
4. **El estado del arte es pertinente y está bien conectado con JobAI, pero es corto y no sistemático.** El vacío que justifica el trabajo descansa sobre una búsqueda bibliográfica que no se documenta.

El mayor riesgo en la sustentación es que el jurado lea el trabajo como «el autor evaluando su propio producto y generalizando a partir de sus propios bugs». Casi todo lo que se propone aquí apunta a cerrar esa lectura.

## 2. Evaluación por dimensiones

Cinco de las siete dimensiones están en 4 y dos en 3: problema y objetivos, y estado del arte. La nota refleja la calidad actual del borrador, no su potencial (1 deficiente, 3 aceptable con mejoras, 5 excelente).

| Dimensión | Nota (1–5) | Justificación |
| --- | --- | --- |
| A. Estructura y coherencia | 4 | La secuencia de capítulos es lógica, la terminología es consistente (necesidad, peldaño, PE1–PE4) y las preguntas de evaluación se reflejan una a una en resultados y conclusiones. Bajan la nota la redundancia (la introducción repite casi literal el problema, la pregunta y los objetivos del Cap. 2; la sección 2.6 repite contenido del Cap. 3) y la tensión entre la pregunta y los aportes. |
| B. Problema y objetivos | 3 | El problema (desajuste de vocabulario) y la pregunta son claros y relevantes. Pero el planteamiento declara dos vacíos (evidencia y método) y la pregunta cubre solo el primero; el texto excluye el segundo («La forma de evaluar \[…\] es una decisión metodológica, no una pregunta») y aun así lo presenta como aporte. El OE4 promete fidelidad por componente y no se mide. PE4 (motor vectorial) no está en la pregunta ni en el título. No se justifica qué hace específico al empleo remoto. |
| C. Estado del arte | 3 | Fuentes de calidad (SIGIR, TOIS, NeurIPS, MISQ, VLDB J.) y actuales; los cierres «Relación con JobAI» son muy buenos. Pero es breve (unas 8 páginas), no documenta cómo se buscó, encuentra un solo trabajo directamente comparable (Yashwant et al., 2026) y le faltan líneas clave: fundamentos de la recuperación densa, expansión léxica, críticas a los jueces LLM, evaluación de RAG más allá de RAGAS. |
| D. Metodología | 4 | Protocolo ejemplar en control del sesgo de configuración y tratamiento estadístico; DSR aplicado con la correspondencia de Peffers y la distinción formativa/sumativa de FEDS. Faltan: definición inequívoca del artefacto, objetivos de diseño cuantificables, revisión de los lineamientos de Hevner, una línea base léxica con filtros y una validación humana que no dependa solo del autor. |
| E. Diseño e implementación | 4 | Arquitectura clara y decisiones centrales justificadas con literatura (filtros dentro de la búsqueda, RRF, cambio de modelo sin cambiar dimensión, selección del reordenador con regla previa); los anexos permiten reconstruir el sistema. Quedan sin justificar o evaluar varios parámetros (50 fragmentos, 5 ofertas en el contexto, efsearch = 40, el generador) y la fragmentación. No queda clara la diferencia entre las configuraciones desplegada, de referencia y evaluada. |
| F. Evaluación y resultados | 4 | Reporte estadístico muy bueno (IC bootstrap, Holm, techos de P@k, efectos pequeños interpretados como tales) que separa en general lo observado de lo interpretado. Bajan la nota: atribución excesiva en las fallas, comparación contra BM25 sin filtros, validación con un solo anotador recalibrado, compuerta evaluada solo por su costo, robustez probada con un juez no válido y al menos una inconsistencia numérica. |
| G. Redacción y presentación | 4 | Prosa precisa, impersonal, sobria y bien citada. Mejoraría con menos cifras por párrafo en resultados, fórmulas de las métricas de IR, glosario de siglas, un resumen menos denso y respaldo para dos afirmaciones de la justificación. |

## 3. Hallazgos críticos y observaciones

Hay un hallazgo crítico (H1), cinco altos (H2–H6), dieciséis medios y ocho bajos. Los críticos y altos se detallan con ubicación, problema, consecuencia y recomendación; los medios y bajos van en la tabla final.

### H1 · CRÍTICO — El aporte 2 y la conclusión final sobre las fallas silenciosas no están respaldados como se formulan

**Ubicación:** resumen (cierre), Cap. 1 «Aportes» (2), §2.1 «segundo vacío», §3.7 «Relación con JobAI», §6.7, §6.7.6, §6.8.5 y §7.1 (Objetivo 3).

**Problema:**

- El texto afirma: «Se detectaron porque el protocolo mide salidas intermedias y no solo la respuesta final». La columna «Detección» de la Tabla 6.14 dice otra cosa: de las 12 fallas del artefacto, solo A4, A6, A7, A8 y C2 salieron de corridas del protocolo. A1 (revisión frente a la documentación), C1 (revisión del código), B1 y B2 (EXPLAIN ANALYZE), A2 (revisión de la agregación), A3 (inspección de similitudes) y A5 salieron de inspección técnica durante la preparación.
- No hay contrafactual: nunca se muestra que una evaluación de la respuesta final (por ejemplo, RAGAS sobre la versión con fallas) las habría pasado por alto.
- El planteamiento excluye explícitamente el «vacío de método» de la pregunta de investigación y después lo reclama como aporte.

**Por qué es un problema:** es la conclusión que cierra el resumen («Evaluar un sistema RAG exige, por tanto, verificar sus componentes») y se apoya en un caso único, con defectos de código propio y una atribución causal que el propio documento contradice en parte. Posicionarse contra Barnett et al. puede leerse como un hombre de paja: ellos hablan de fallas que dependen de consultas no previstas en operación, mientras que una consulta SQL que no usa el índice es un defecto de software que detecta cualquier prueba convencional.

**Consecuencia:** el jurado puede invalidar el aporte 2 y, con él, la frase final del resumen.

**Recomendación:** elegir una de dos vías.

- **(a) Convertirlo en pregunta secundaria** («¿qué fallas revela una evaluación por componentes que no revela la evaluación de la respuesta final?») y someterla a prueba: con el historial de git y las cachés, reintroducir A1, A2, A4, A5 y A6 y medir si RAGAS u otro juez de la respuesta final las detecta. Es barato y convierte una anécdota en evidencia.
- **(b) Degradarlo** a «hallazgos de la evaluación formativa» y suavizar el resumen y las conclusiones.

En ambos casos: dividir la columna de detección en «métrica del protocolo», «inspección durante la preparación» y «revisión de código», y mapear cada falla a los siete puntos de falla de Barnett o declararla defecto de software genérico.

### H2 · ALTO — Ambigüedad sobre cuál es el artefacto de DSR y cuál es la contribución

**Ubicación:** resumen («se diseñó un protocolo de evaluación reproducible»), Cap. 1 («El centro del trabajo es un protocolo de evaluación»), §4.1 («El artefacto es una instanciación de software, JobAI») y Tabla 4.1.

**Problema:**

- Si el artefacto es el protocolo (un método), su evaluación debería mostrar que es útil, por ejemplo frente a otro protocolo, y eso no se diseñó.
- Si el artefacto es JobAI (una instanciación), faltan los «objetivos de la solución» de Peffers (actividad 2) como criterios de desempeño: la Tabla 4.1 remite a las preguntas de evaluación, que son preguntas y no criterios.
- La actividad de «Demostración» se confunde con la de evaluación.
- No se revisan los siete lineamientos de Hevner que el propio texto menciona.
- No se ubica el tipo de contribución: aplicar soluciones conocidas (RAG) a un problema nuevo es, en el marco de Gregor y Hevner (2013), algo cercano a la exaptación.

**Por qué es un problema:** en DSR la contribución es el artefacto evaluado; si la ambigüedad persiste, el trabajo queda expuesto a la crítica de «desarrollo de software con métricas».

**Recomendación:** declarar que el artefacto es el pipeline de JobAI, con objetivos de diseño explícitos (superar a BM25 en nDCG@10, cierto C@5 en consultas con restricciones, un tiempo hasta el primer token bajo un umbral justificado). Tratar el protocolo como instrumento de rigor, salvo que se evalúe como segundo artefacto (conecta con H1-a). Añadir una tabla de los lineamientos de Hevner con la sección donde se cumple cada uno.

### H3 · ALTO — La línea base léxica compite sin filtros

**Ubicación:** Tabla 4.3, §6.3.1, Tabla 6.5 («Con restricciones»: BM25 0,468 frente a 0,845), §7.1.

**Problema:** la configuración completa usa un LLM para extraer filtros estructurados y BM25 no los recibe. Los filtros no son propios de RAG ni de la recuperación densa, y el §2.1 reconoce que las plataformas reales ya tienen «sus filtros». La diferencia de +0,263 combina el efecto semántico con el de estructurar la consulta.

**Consecuencia:** se sobrestima la respuesta a la primera parte de la pregunta; un jurado de IR lo notará.

**Recomendación:** agregar BM25 + filtros y, si es posible, BM25 + filtros + reordenamiento. Los sistemas nuevos entran al agrupamiento: juzgar los pares nuevos con el mismo juez y reportar cuántos son. Costo bajo.

### H4 · ALTO — El OE4 promete fidelidad por componente y solo se mide la configuración final

**Ubicación:** §2.3.2, OE4 («Cuantificar el aporte de cada componente \[…\] en calidad de la recuperación y fidelidad de la respuesta»), y §6.4.

**Problema:** PE2 evalúa solo la configuración completa. No se sabe si el reordenamiento o los filtros cambian la fidelidad, ni cómo cambió entre la Iteración 1 y la 2 con el juez final.

**Consecuencia:** un objetivo específico queda sin evidencia de cumplimiento.

**Recomendación:** generar respuestas para cada peldaño (denso, +filtros, +híbrida, completa), unas 330 evaluaciones de RAGAS adicionales, o reescribir el OE4 para que diga lo que se mide.

### H5 · ALTO — La validación del juez descansa en un solo anotador, recalibrado tras ver sus desacuerdos

**Ubicación:** §4.6 y §6.2.

**Problema:**

- El autor diseñó las consultas, la guía y el sistema, y es la única referencia humana.
- Tras ver diez ejemplos de desacuerdo con su dirección, volvió a etiquetar la calibración. Está reportado con honestidad y el kappa de calibración solo elige el juez, pero la validación la etiquetó la misma persona ya «entrenada» en el criterio de los jueces.
- No hay acuerdo humano–humano que sirva de techo: no se sabe si κ = 0,79 es alto o bajo frente a dos personas.

**Consecuencia:** la validez de toda la PE1 depende de este punto.

**Recomendación:** un segundo anotador independiente (un compañero con la misma guía) sobre al menos 100 pares de validación; reportar el kappa humano–humano y el del juez frente al segundo anotador. Discutir la literatura crítica sobre jueces LLM (Soboroff, 2025; Clarke y Dietz, 2024) y la variación entre evaluadores humanos (Voorhees, 2000).

### H6 · ALTO — El estado del arte no es sistemático y deja vacíos relevantes

**Ubicación:** Cap. 3, en particular §3.2: «En la búsqueda bibliográfica de este trabajo, los que combinan RAG y emparejamiento de empleo resultaron escasos y recientes».

**Problema:** el vacío que justifica el trabajo (§2.1, §3.9) se apoya en una búsqueda sin protocolo documentado (bases, cadenas, periodo, criterios de inclusión) y no hay tabla comparativa de trabajos relacionados. Faltan líneas que un jurado de IR esperaría:

- **Fundamentos de la recuperación densa:** DPR (Karpukhin et al., 2020), Sentence-BERT (Reimers y Gurevych, 2019).
- **Expansión de la consulta como alternativa léxica:** RM3, doc2query, HyDE (Gao et al., 2023); es la objeción natural a «denso frente a BM25».
- **Reordenadores basados en LLM:** RankGPT (Sun et al., 2023).
- **Benchmarks para justificar el modelo de embeddings:** MTEB, MIRACL.
- **Evaluación de RAG más allá de RAGAS:** ARES (Saad-Falcon et al.).
- **Juicios incompletos y potencia estadística:** Buckley y Voorhees (2004); Webber, Moffat y Zobel (2008).
- **Recursos del dominio de empleo:** JobBERT (Decorte et al., 2021), la taxonomía ESCO.

**Consecuencia:** la pregunta «¿cómo sabe que nadie lo ha hecho?» queda sin respuesta defendible.

**Recomendación:** abrir el Cap. 3 con un párrafo de método de revisión y cerrar con una tabla de trabajos relacionados (dominio, corpus, líneas base, componentes evaluados, métricas, hallazgo).

### Observaciones de gravedad media y baja

| # | Gravedad | Ubicación | Problema | Recomendación |
| --- | --- | --- | --- | --- |
| M1 | MEDIO | §6.3.2, §7.1 | La escalera mide aportes marginales en un orden fijo: «la híbrida no aporta» solo vale agregada antes del reordenamiento y con k = 60. | Ablación quitando un componente cada vez desde la configuración completa (sobre todo completa sin híbrida), o discutir la dependencia del orden. |
| M2 | MEDIO | Cap. 4 | No hay hipótesis a priori, aunque la discusión habla de «la expectativa con que se incorporó»; la latencia no tiene criterio de aceptabilidad. | Explicitar efectos esperados según el Cap. 3 y un presupuesto de latencia con literatura (p. ej., Arapakis et al., 2014), o declarar el análisis descriptivo. |
| M3 | MEDIO | Título, pregunta, Aportes (3), §6.6 | PE4 no está en la pregunta ni en el título; a escala real no hay efecto, y el sintético (500.000 vectores, KS = 0,23) se aleja del caso. Parece apoyo a una decisión de producto. | Justificar el almacenamiento como componente con una subpregunta, o presentarlo como resultado secundario. |
| M4 | MEDIO | §6.3.6, §5.4.1 | La compuerta solo se evalúa por su costo (2 falsos negativos); sin consultas fuera de dominio en la prueba, su beneficio no se mide. Umbral en el borde (0,132 frente a 0,134). | Añadir 10 a 20 consultas fuera de dominio y reportar precisión y recall de la compuerta. |
| M5 | MEDIO | §4.1.1, Tabla 4.3, Cap. 6 | La Iteración 1 se aproxima («usaba 15 fragmentos en lugar de 50») y el artefacto original nunca se mide; el OE3 no tiene un antes y después limpio. | Correr la configuración real de la Iteración 1 (15 fragmentos, umbral 0,5) y, si es viable, la previa, desde git. |
| M6 | MEDIO | §4.3, §5.1, §5.2, Tabla 4.5, §6.5 | Tres configuraciones: desplegada, de referencia (ingesta con gpt-oss-120b) y evaluada (corpus con Llama 3.1 8B). El generador figura como qwen3.8-27b pero las amenazas citan modelos retirados, y el §6.5 dice «El generador no cambió». | Tabla de configuraciones con identificadores exactos de modelos y fechas por corrida. |
| M7 | MEDIO | §5.4.1 y Tabla 5.4; resumen y §7.1 | Inconsistencia: el texto dice que con 30 candidatas el nDCG@10 era 0,832 y la Tabla 5.4 da 0,820. C@5 aparece como 0,41 → 0,97 en el resumen y 0,41 → 0,95 en la Tabla 6.14 y el §7.1 (peldaños distintos). | Auditar todas las cifras contra los archivos de corrida; idealmente generar las tablas de LaTeX con un script. |
| M8 | MEDIO | §4.6, §6.3.2, falla D1 | La regla de condiciones duras y los filtros comparten definición (una oferta sin salario no cumple): parte de la ganancia de los filtros es por construcción, y la regla se introdujo tras la primera corrida. | Declarar la amenaza de constructo y reportar la ganancia con relevancia solo temática (los veredictos v1 de 1.321 pares están en caché). |
| M9 | MEDIO | §6.8.1 | La robustez se demuestra con el juez local (κ = 0,508, bajo el umbral de 0,60). | Volver a juzgar el agrupamiento con Claude Sonnet 5.5, el segundo juez previsto (unas 2.000 llamadas). |
| M10 | MEDIO | §5.2, §4.1.1 | La fragmentación no se evalúa; se justifica con iteraciones previas que el propio texto declara poco fiables. | Ablación estructurada frente a ventana deslizante, o exclusión explícita del alcance. |
| M11 | MEDIO | Título, §2.1, §4.4 | Lo remoto no tiene tratamiento específico: solo 682 de 1.068 ofertas (64 %) son remotas y aparece solo como filtro. | Justificar el dominio o ajustar la redacción («ofertas de agregadores de empleo remoto»). |
| M12 | MEDIO | Cap. 1 frente a §2.1–2.3; §2.6 frente a Cap. 3 | Redundancia: problema, pregunta y objetivos aparecen dos veces; RRF, niveles de Gao, DSR y HNSW se explican dos veces. | Introducción como panorama breve; marco teórico en capítulo propio o fundido con el Cap. 3. |
| M13 | MEDIO | §4.7, Tabla 4.4 | nDCG, MRR, P@k, R@10 y kappa solo se nombran; RAGAS sí tiene fórmulas. Falta el paradigma de Cranfield. | Añadir fórmulas y una subsección de evaluación en IR. |
| M14 | MEDIO | OE2, §4.11 | «Reproducible»: corpus no público, etiqueta pendiente; repetir el análisis desde caché es repetibilidad, no reproducibilidad. | Precisar el término y, si es viable, una reproducción de prueba por un tercero. |
| M15 | MEDIO | §4.4.1, §6.3.5 | Las consultas en español son traducciones del autor, no consultas reales. | Declararlo en limitaciones; conservar el argumento de la traducción perfecta. |
| M16 | MEDIO | Tabla 4.5 | La Iteración 2 se decidió tras ver la corrida de prueba; «la corrida final usa otro juez» no elimina esa filtración. El autor redacta todas las consultas. | Corrida confirmatoria con 20 a 30 necesidades nuevas redactadas por otra persona. |
| B1 | BAJO | Abstract | Coma decimal en inglés («κ = 0,79», «1 %»). | Usar 0.79 y 1%. |
| B2 | BAJO | Resumen | Unas 330 palabras con más de 20 cifras. | Revisar el límite institucional y dejar 4 o 5 cifras clave. |
| B3 | BAJO | Anexo C | Marcador «\[Pendiente: etiqueta de la versión entregada\]». | Completarlo antes de entregar. |
| B4 | BAJO | Preliminares | Sin lista de siglas (RRF, ANN, HNSW, TTFT, PE, nDCG, MRR, DSR). | Añadir un glosario. |
| B5 | BAJO | §2.4 | Afirmaciones sin respaldo: «Muchas plataformas anuncian hoy ‘búsqueda con IA’ sin medir qué ganan» y «Quien busca empleo pierde tiempo…». | Citar una fuente o suavizar. |
| B6 | BAJO | Fig. 6.2 y 5.1 | El eje logarítmico de la 6.2 solo marca 1 y 10; la 5.1 es correcta pero básica. | Marcas intermedias en la 6.2; flujos de datos en la 5.1. |
| B7 | BAJO | §6.6.2, §6.5 | Párrafos saturados de cifras. | Dejar las cifras en tablas y usar el texto para interpretar. |
| B8 | BAJO | Bibliografía | Preprints recientes no verificados (p. ej., Yashwant et al., 2026, arXiv:2609.23307). | Comprobar cada referencia y buscar versiones publicadas. |

## 4. Matriz de coherencia y trazabilidad

La cadena problema → pregunta → objetivos → resultados funciona para el vacío de evidencia, pero el vacío de método, la fidelidad por componente y el motor vectorial quedan desconectados o a medias.

| Elemento | Se conecta con | Evidencia en el documento | Estado |
| --- | --- | --- | --- |
| Vacío 1: evidencia (cuánto aporta RAG frente a BM25 y qué componente lo explica) | Pregunta → objetivo general → OE4 | §2.1, §2.2 | Conectado |
| Vacío 2: método (protocolo que revele fallas antes de la operación) | Ninguna pregunta (excluido en §2.2) → aporte 2 | §2.1, §6.7, §7.1 | Desconectado (H1) |
| OE1: caracterizar la literatura | Cap. 3 → conclusión del Objetivo 1 | §3.1–3.9 | Cumplido, sin método de revisión (H6) |
| OE2: protocolo reproducible | Cap. 4 → validación del juez (§6.2) | κ = 0,786 en 298 pares | Cumplido; «reproducible» discutible (M14), un solo anotador (H5) |
| OE3: dos iteraciones | Cap. 5 → §6.7 → +0,141 frente al denso | Tablas 5.3 y 6.14 | Parcial: Iteración 1 aproximada, artefacto original sin medir (M5) |
| OE4 / PE1: calidad de recuperación por componente | Denso, filtros, híbrida, reordenamiento, embeddings | Tablas 6.3–6.7 | Cumplido, con sesgo de línea base (H3) y dependencia del orden (M1) |
| OE4 / PE2: fidelidad por componente | Generador | §6.4, solo configuración final | Incompleto (H4) |
| OE4 / PE3: latencia | Todas las etapas | Tablas 6.10 y 6.11 | Cumplido, sin criterio de aceptabilidad (M2) |
| OE4 / PE4: motor vectorial | pgvector y Qdrant | §6.6 | Cumplido, fuera de la pregunta y del título (M3) |
| Componentes del título («evaluación por componentes») | Clasificador, fragmentación, compuerta | Fragmentación sin evaluar; compuerta solo por costo; clasificador en §6.3.7 sin objetivo que lo pida | Desigual (M4, M10) |
| Resultados sin objetivo explícito | — | §6.3.6 (compuerta), §6.3.7 (enrutamiento y agregación), HNSW frente a búsqueda exacta | Útiles, pero sin anclaje en el OE1 ni en la pregunta |

**Desconexiones principales:**

1. El vacío de método, el aporte 2 y la frase final del resumen no tienen pregunta de investigación ni evidencia diseñada para ellos.
2. El OE4 promete fidelidad por componente y no se mide.
3. PE4 y el aporte 3 están en el OE4 pero no en la pregunta ni en el título.
4. El clasificador y la ruta de agregación se evalúan sin que ningún objetivo lo pida.

## 5. Fortalezas del trabajo

Estas partes están bien resueltas y deben conservarse en las siguientes versiones:

- **Separación entre desarrollo y prueba con reglas fijadas de antemano.** La selección del reordenador (§5.4.1) es un modelo de cómo evitar ajustar el sistema a la prueba.
- **Juez LLM con validación, plan B previsto y matriz de confusión publicada.** Es poco común incluso en artículos.
- **La necesidad de información como unidad de análisis**, la prueba de aleatorización pareada (con la referencia a Smucker et al.), Holm por familias e IC bootstrap.
- **Métricas que no dependen del juez** (C@5, exactitud de la extracción, exactitud de la agregación frente a SQL de referencia): el mejor argumento contra la circularidad.
- **Honestidad en resultados nulos y límites:** la híbrida, el modelo multilingüe sin significancia tras Holm, HNSW frente a búsqueda exacta (+0,005 «sin efecto práctico»), A8 y C2 dejados abiertos a propósito.
- **El diagnóstico de pgvector** (Tabla 5.2, M1 y M2), que convierte la motivación ingenua de la migración en una pregunta.
- **Las secciones «Relación con JobAI»** al final de cada apartado del estado del arte.
- **Las fallas del arnés (D1–D8):** reconocer que el instrumento también falla es una contribución metodológica madura.
- **El argumento de la traducción perfecta** (BM25 sobre la contraparte en inglés) en §6.3.5.

## 6. Vacíos y aspectos por desarrollar

Lo que falta se agrupa en seis frentes; los experimentos son baratos porque las cachés, el arnés y el historial de git ya existen.

1. **Experimentos:** BM25 + filtros; ablación quitando un componente cada vez desde la configuración completa; fidelidad por peldaño; consultas fuera de dominio en la prueba; la Iteración 1 real; el segundo juez sobre todo el agrupamiento; un contrafactual de detección de fallas; opcionalmente, la ablación de la fragmentación.
2. **Validación humana:** un segundo anotador de relevancia y el kappa humano–humano.
3. **Fundamentos de DSR:** objetivos de diseño cuantificables, tabla de lineamientos de Hevner, tipo de contribución (Gregor y Hevner, 2013) y diferencia entre demostración y evaluación.
4. **Estado del arte:** método de revisión, tabla de trabajos relacionados y las líneas faltantes de H6.
5. **Argumentos:** por qué el foco en lo remoto; por qué PE4 pertenece a la pregunta; criterio de aceptabilidad de la latencia; relación entre la regla de condiciones duras y los filtros.
6. **Descripción técnica:** tabla de configuraciones con versiones exactas de los modelos; justificación de parámetros no ajustados (50 fragmentos, 5 ofertas, efsearch = 40).

## 7. Plan de corrección priorizado

Los cinco cambios indispensables cierran el hallazgo crítico y la mayor parte de los altos; marca cada acción al completarla.

### Indispensables (antes de la próxima versión)

- [ ] **1. Reencuadrar el aporte 2 y la conclusión final (H1).** Pregunta secundaria con contrafactual o hallazgo formativo; ajustar resumen, §6.7.6, §6.8.5 y §7.1; dividir la columna de detección. Es la afirmación más expuesta del trabajo.
- [ ] **2. Definir el artefacto de DSR y sus objetivos de diseño (H2).** Un párrafo en §4.1 y la tabla de Hevner. Fija qué se defiende.
- [ ] **3. Agregar BM25 + filtros (H3).** Juzgar los pares nuevos y actualizar las Tablas 6.3, 6.5 y 6.6. Hace justa la respuesta principal a la pregunta.
- [ ] **4. Alinear el OE4 con lo medido (H4).** Medir la fidelidad por peldaño o reescribir el objetivo. La trazabilidad es lo primero que revisa un jurado.
- [ ] **5. Auditar las cifras (M7) y unificar las configuraciones (M6).** Una sola inconsistencia descubierta en la sustentación resta credibilidad a todo lo demás.

### Importantes

- [ ] **6. Segundo anotador de relevancia y kappa humano–humano (H5).**
- [ ] **7. Reestructurar el estado del arte (H6):** método, tabla comparativa y líneas faltantes.
- [ ] **8. Hipótesis a priori y presupuesto de latencia en el Cap. 4 (M2).**
- [ ] **9. Ablación quitando un componente cada vez, sobre todo completa sin híbrida (M1).** Hoy se recomienda cambiar la fusión con evidencia que depende del orden de la escalera.
- [ ] **10. Corrida confirmatoria con necesidades redactadas por otra persona (M16).**
- [ ] **11. Justificar o reubicar PE4 (M3).**

### Mejoras recomendadas

- [ ] **12.** Consultas fuera de dominio para la compuerta (M4); Iteración 1 real (M5); segundo juez sobre todo el agrupamiento (M9); relevancia solo temática con los veredictos v1 (M8).
- [ ] **13.** Reducir la redundancia entre Cap. 1 y Cap. 2 y reubicar el marco teórico (M12); fórmulas de las métricas y paradigma de Cranfield (M13).
- [ ] **14.** Justificar el foco en lo remoto (M11); precisar «reproducible» (M14); limitación de las traducciones (M15).
- [ ] **15.** Ablación de la fragmentación o exclusión explícita (M10).

### Para la versión final

- [ ] **16.** Abstract con punto decimal, resumen más corto, marcador del Anexo C, glosario, marcas de los ejes de las figuras, respaldo de las afirmaciones de la justificación y verificación de la bibliografía (B1–B8).

## 8. Preguntas del director y del jurado

Estas son las preguntas que conviene tener respondidas antes de la reunión de seguimiento y de la sustentación:

1. ¿Cuál es exactamente tu artefacto de DSR: JobAI o el protocolo? Si es JobAI, ¿qué criterio de éxito definiste antes de medir?
2. Siete de las doce fallas se detectaron por revisión de código o inspección. ¿Qué parte de su detección se debe al protocolo y cuál a hacer ingeniería con cuidado?
3. ¿Habría detectado RAGAS la falla A1 o la A2? ¿Lo probaste?
4. ¿No contradices a Barnett et al. con un tipo de falla distinto del que ellos describen?
5. Si le das a BM25 los mismos filtros que extrae tu clasificador, ¿cuánto queda de la ventaja de +0,263?
6. Tú escribiste las consultas, la guía y el sistema, y eres la única referencia humana del juez. ¿Por qué confiar en κ = 0,79? ¿Cuál es el acuerdo entre dos humanos en esta tarea?
7. Volviste a etiquetar la calibración después de ver hacia dónde iban tus desacuerdos con el juez. ¿Eso no te acercó a su criterio también en la validación?
8. La regla de condiciones duras y los filtros usan la misma definición. ¿Qué parte del +0,046 de los filtros es por construcción?
9. Concluyes que la híbrida no aporta. ¿Probaste quitarla de la configuración completa, o solo agregarla antes del reordenamiento?
10. ¿Es aceptable un tiempo de 1,96 s hasta el primer token? ¿Con qué referencia lo juzgas?
11. ¿Qué tiene de específico el empleo remoto en tu trabajo, si el 36 % del corpus no está marcado como remoto?
12. ¿Por qué la comparación entre pgvector y Qdrant forma parte de una tesis sobre RAG y no es una decisión de ingeniería de tu producto?
13. ¿Por qué no evaluaste la fragmentación, uno de los componentes que más influyen en un sistema RAG?
14. El 84 % del corpus viene de Findwork. ¿Qué conclusiones cambiarían con otra distribución de fuentes?
15. Agregaste los filtros después de ver la falla A4 en la corrida de prueba. ¿Cómo descartas que el conjunto de prueba haya orientado el diseño?
16. Si tu arnés tuvo ocho fallas silenciosas, ¿cómo sabes que no queda una novena que afecte los resultados?
17. ¿Qué aprende de tu trabajo alguien que no va a usar JobAI? Formula tu contribución en una frase que sirva fuera de tu caso.

## 9. Concepto final

**El documento tiene una estructura y fundamentación adecuadas para continuar su desarrollo.**

No se marca «no está listo» ni «requiere correcciones importantes sobre una base válida» porque el núcleo es sólido: la pregunta principal se responde con evidencia válida, bien medida y reportada con honestidad, y la estructura no necesita rehacerse. Tampoco se marca «muy cerca de la versión final», porque quedan un hallazgo crítico de encuadre (H1) y cinco altos (H2–H6) que un jurado competente señalaría.

Casi todos se resuelven con reformulación y experimentos baratos, porque las cachés, el arnés y el historial de git ya existen. No hay que rehacer la investigación: hay que decir con precisión qué demuestra y añadir las tres o cuatro pruebas que cierran las objeciones previsibles.

Prioridad: los puntos 1 a 5 del plan. Con ellos resueltos, el trabajo pasa de muy bueno a difícil de atacar en la sustentación.
