# Revisión «como jurado» — 26-nov-2026

Lectura completa del PDF de `Tesis/Plantilla/main.pdf` (112 págs., commit `660bd54`), hecha por Claude a pedido del autor con la consigna de ser lo más exigente posible. Los números de página son los del PDF. El plan de corrección que responde a esta revisión está en `steps.md`, sección «▶ Estado al 26-nov-2026 (noche)». Los objetivos están aprobados y **no cambian**.

## Concepto general

El trabajo es riguroso y honesto con sus límites, pero se presenta como algo que no es. Es una evaluación de **recuperación neuronal frente a BM25** en un corpus pequeño, sobre un sistema que el mismo autor construyó, juzgó, etiquetó y redactó. La «G» de RAG casi no participa en la pregunta principal, y varios «hallazgos» están construidos de forma que no podían salir de otra manera.

Fortalezas: conjunto de desarrollo separado del de prueba, juez validado con humanos, análisis posteriores declarados como tales, tablas generadas por script, todo repetible.

## I. Fondo: observaciones mayores

1. **La pregunta y el título no corresponden a lo que se mide.** La recuperación no depende de la generación: lo que se compara es búsqueda densa + filtros + reordenador frente a BM25, que es recuperación de información neuronal, no RAG. La generación nunca se compara con nada. Los componentes evaluados son cuatro de recuperación; el clasificador se mide de forma lateral, la fragmentación queda fuera y el generador no se varía.
2. **El aporte en ingeniería no es claro.** El sistema ya existía (p. 14). El Cap. 5, «Diseño y desarrollo», describe lo que hay sin mostrar un proceso de diseño: faltan requisitos, alternativas, decisiones justificadas, pruebas y despliegue. No queda claro qué se construyó durante la tesis.
3. **Los resultados confirman lo que ya se sabía.** E5 por encima de BM25, el cross-encoder que ayuda, RRF sin ajustar que no aporta. Con 1.068 ofertas y 60 necesidades no se puede generalizar. Falta decir con fuerza qué se sabe ahora que antes no.
4. **El hallazgo de RAGAS es casi una tautología.** Se usaron justo las dos métricas que no pueden detectar A4: la fidelidad, que mide si la respuesta se apoya en el contexto, y la relevancia de la respuesta, que usa los embeddings del propio sistema. RAGAS tiene métricas del contexto (*context precision* y *context relevance*) que no se usaron.
5. **La validación humana está contaminada.** Antes de volver a etiquetar la calibración se mostraron al autor diez desacuerdos con los jueces, y 34 pares cambiaron de lado (p. 53). Hay un solo anotador, que además es el autor de todo lo demás. La guía de la verificación de fidelidad cambió después de ver los desacuerdos, y la correlación por respuesta es −0,13. Llamar «conservadora» a la cifra de 0,901 es más de lo que esos datos permiten.
6. **La Iteración 1 nunca se midió de verdad.** Se aproximó con 50 fragmentos agrupados, cuando el sistema usaba 15 con umbral. Las correcciones de la Iteración 1 no tienen medición de antes y después. La Iteración 2 se decidió después de ver el conjunto de prueba.
7. **El OE4 se cumple solo «en parte»** (p. 85): no hay fidelidad por componente. Además, «costo» se reduce a latencia, sin costo en dinero ni carga.
8. **Los criterios de éxito se fijaron después de medir** (p. 34). El criterio (b) no tiene umbral, así que no puede fallar. El (c) aplica umbrales de páginas de resultados web a una respuesta generada que se muestra de forma incremental.
9. **La configuración se eligió con un juez que, por las propias reglas del trabajo, no sirve.** El juez local tiene κ = 0,508, por debajo del umbral de 0,60 (p. 51).
10. **Se evalúa un sistema que no está en producción.** La configuración desplegada usa embeddings de Gemini y no tiene reordenador. El corpus evaluado se analizó con Llama 8B y no con gpt-oss-120b, y 256 ofertas tienen análisis fallido o parcial.
11. **La línea base «fuerte» es un BM25 propio.** Un solo campo, k1 y b sin ajustar, *S-stemmer*, sin comparación con Lucene o Pyserini y sin traducción en español.
12. **«Retirar la híbrida» es una conclusión sobre una sola configuración** (RRF k = 60 sin ponderar). El orden fijo de la escalera no permite ver interacciones; un diseño factorial sería barato.
13. **Hay datos que ya permiten responder dos dudas abiertas.** La ganancia del reordenador se puede calcular solo con los 298/401 pares de etiqueta humana (duda de Fröbe), y se puede volver a juzgar todo con Claude Sonnet (κ de calibración 0,828).
14. **El catálogo de fallas está inflado como contribución.** Varias son errores comunes de programación, la asignación a los puntos de falla de Barnett se hizo después y el conteo por origen no tiene contra qué compararse. Son nueve páginas dentro de Resultados.
15. **El vacío declarado choca con un trabajo citado.** Se dice que «ninguno mide si las ofertas cumplen las restricciones» (p. 25), pero Hossain et al. se titula *Constraint-aware…* y JobMatchAI aplica restricciones duras.
16. **El problema está poco fundamentado y sin contexto local.** No hay evidencia de que los agregadores pequeños busquen por palabras clave, no hay cifras del problema y no hay contexto colombiano o latinoamericano.
17. **Falta una sección de ética y datos:** sesgo en el reclutamiento con IA (alto riesgo en el AI Act), currículos y Ley 1581 de 2012, y licencia del corpus publicado.
18. **El conjunto de prueba es pequeño y redactado por el autor.** Las consultas en español son traducciones suyas, hay conclusiones por categoría con 15 necesidades y muchos valores p sin ajustar.
19. **La comparación de latencia mezcla factores.** Cambian el hardware (CPU → GPU) y el día, el proveedor es externo y no hay prueba de carga del sistema completo.
20. **«Reproducible» está sobredimensionado.** Los modelos comerciales se retirarán; lo que se repite es el análisis sobre la caché. Faltan identificadores exactos de los modelos y la entrada bibliográfica de Claude.

## II. Objetivos, metodología y estructura

- El OE1 es una actividad, no un objetivo. Como no se puede cambiar, se defiende con el texto.
- «Estudio de caso» sin citar a Yin ni a Runeson & Höst. DSR queda como una frase aislada (la pidió el director).
- No hay una tabla que relacione objetivo → actividades → resultado → capítulo.
- El Cap. 4 habla de la Iteración 2 antes de que el Cap. 5 la describa.
- Las limitaciones se tratan tres veces (§2.5, §4.9, §6.8.6). Hay repeticiones entre la Introducción y el Cap. 2.
- Marco teórico de 3 páginas frente a 31 de Resultados. Faltan la fórmula de BM25, bi-encoder frente a cross-encoder, aprendizaje contrastivo y Cranfield.
- Las conclusiones son una lista de cifras, sin una respuesta directa a «¿en qué medida?».
- No hay ningún ejemplo cualitativo ni captura de JobAI.
- Faltan anexos con el prompt del juez, el prompt del generador y la lista de las 100 consultas.
- A.9 (búsqueda bibliográfica) está en el anexo del protocolo; B.6 es una anécdota.

## III. Estado del arte

- Muchas fuentes son preprints de 2026 o notas de trabajo de CEUR.
- Se declara que se leyó menos de la mitad de los candidatos; el cribado con IA tiene κ = 0,29 frente al autor.
- La fila «Este trabajo» dentro de la Tabla 3.1 se ve rara.
- La Justificación generaliza a partir de dos trabajos.

## IV. Forma

**Preliminares**
- Falta la página de aceptación (`F01` existe pero no se incluye en `main.tex`).
- No hay agradecimientos ni glosario.
- Las páginas preliminares van en arábigos.
- Las figuras y tablas no tienen «Fuente».

**Citas y bibliografía**
- Las citas dicen «Nogueira and Cho» dentro de un texto en español.
- La bibliografía está en inglés (`apalike`).
- Algunas entradas tienen «et al.» en vez de la lista de autores (Gao 2023b, Li 2023, Wang 2021, Shen 2024).
- `pagebackref` agrega números de página al final de cada referencia.
- El año de Johnson es ambiguo.

**Lenguaje**
- Anglicismos y calcos: «arnés», «compuerta de sin resultados», «peldaño», «plan B».
- Cursivas de los términos en inglés inconsistentes.
- Frases muy largas y con demasiadas salvedades (§6.3.5).

**Siglas**
- Faltan: IC, API, JSON, JWT, UUID, REST, CPU, MS MARCO, MTEB, MIRACL, BIRD, TAG, UMBRELA, CLEF, p50/p95.
- κ no es una sigla.

**Figuras**
- Título arriba en los Caps. 2 y 5 y abajo en el Cap. 6.
- Las figuras de matplotlib usan tipografía sans y escriben «500 000».
- La Fig. 6.2 no tiene barras de error.
- La Fig. 5.3 choca con el logo (p. 45).
- La Fig. 2.3 aparece antes del texto de su sección.
- Las Figs. 5.5, 6.1 y 6.3 dependen del color.

**Tablas**
- La Tabla 6.14 tiene líneas verticales.
- La Tabla 5.1 está sobrecargada.
- Las Tablas 3.1 y 6.16 ocupan tres páginas cada una.

**Títulos y redacción puntual**
- Títulos con guion de corte: §2.6.3, §3.2, B.6.
- Título de la Tabla A.1 con «diseño-evaluación».
- «65 de las 85 consultas» cuando la unidad declarada es la necesidad (p. 55).
- El resumen dice «100 consultas».
- El título dice «empleo remoto» con un 36 % de ofertas no remotas.

## V. Preguntas probables en la sustentación

1. ¿Qué parte de sus resultados depende de la generación? ¿Por qué es «RAG» y no «recuperación densa con reordenador»?
2. Usted etiquetó, escribió y tradujo las consultas y diseñó el sistema. ¿Por qué creer en la referencia humana, sobre todo después de que le mostraron los desacuerdos?
3. ¿Por qué no usó *context precision* antes de concluir que RAGAS no detecta la falla?
4. El OE4 está incumplido en parte. ¿Por qué no midió la fidelidad por componente?
5. ¿Por qué no volvió a juzgar con Claude Sonnet 5.5, si ya estaba validado?
6. ¿Su BM25 es comparable con el de Lucene? ¿Ajustó k1 y b?
7. ¿Cuántos usuarios simultáneos aguanta JobAI con el reordenador? ¿Cuánto cuesta por consulta?
8. ¿Qué construyó durante la tesis y qué ya existía?
9. ¿Publicar el corpus respeta los términos de Remotive y Findwork?
10. ¿Cómo maneja el sesgo y la discriminación un sistema de recomendación de empleo?
