# Auditoría de cifras y afirmaciones — vista previa del 17-nov

**Objeto:** `borradores/vista-previa-final.pdf` (103 págs., compilada el 17-nov a las 00:04 desde los `*-final.tex` y los capítulos de `Plantilla/` sin borrador). Las páginas son las del PDF.
**Hecha:** 25-nov-2026, por Claude, para la revisión del autor. **Aprobada por el autor el 25-nov; correcciones aplicadas el mismo día en `borradores/` (sección G).** `MainMatter/` no se tocó.
**Método:**
1. Se extrajeron todas las cifras de la prosa de los nueve archivos del documento (948 apariciones) y se compararon con las 13 tablas generadas por `tables.py`, con coincidencia exacta.
2. Las 462 que no están en una tabla (unas 30 son coordenadas de las figuras TikZ del Cap. 5) se contrastaron con los datos de las corridas, recalculándolas con scripts de solo lectura (`docker run … jobai-analysis python …`). Las fuentes se indican en cada fila y en la §F.
3. Las afirmaciones se cruzaron entre capítulos.

## Causas

| Causa | Qué pasó | Evidencia |
|---|---|---|
| **1. Cifras de la prosa escritas a mano** | `tables.py` genera solo las 13 tablas del Cap. 6. Toda cifra del texto se escribe a mano. | `evaluation/analysis/tables.py` (`TABLES`) |
| **2. Texto anterior a E1** | El resumen y las Conclusiones se escribieron antes de que E1 ampliara los juicios de 1.977 a 2.249 pares. Esa ampliación bajó todos los nDCG@10 entre 0,012 y 0,018. Su actualización se dejó para el final de la ronda, que se detuvo el 17-nov. | `01c8e46` (16-nov 19:24) frente a `9a8baac` (E1, 17-nov 00:10); `steps.md`, «▶▶ Próxima sesión», punto 3 |
| **3. Verificador que no verificaba** | `check-numbers.py` acepta `steps.md` como fuente (conserva las cifras viejas), compara por subcadena («0,83» pasa por estar en «0,839»), revisa solo tres textos y no comprueba a qué se refiere cada cifra. Dio listas casi vacías y `steps.md` lo anotó como verificado. | `Tesis/Desarollo/check-numbers.py` (`sources`, `n not in sources`) |
| **4. Ronda de corrección a medias** | Resultados y Metodología se editaron el 17-nov. Introducción, Preliminares, Estado del arte y Artefacto siguen como el 12-nov, con el encuadre anterior a la revisión. El texto nuevo remite a cambios que no se hicieron. | `a783af8` (17-nov) frente a `9f368c3` (12-nov) |
| **5. Afirmaciones que dejaron de ser ciertas** | Frases correctas al escribirse no se revisaron cuando cambiaron los datos (sistemas nuevos, cambio de juez, ampliación de los juicios). Incluye errores introducidos por Claude en la ronda del 16 y 17-nov. | Fecha de origen de cada frase con `git log -S` (en cada fila) |

## A. Cifras desactualizadas por E1 (causas 1, 2 y 3)

Valores correctos tomados de `evaluation/runs/2026-11-17T01-31-32-1a7ec43-dirty-retrieve-test-e1/analysis-qrels.api.openai.com_gpt-6-sol_reasoning_none/` (`summary.csv`, `significance.csv`, `ladder.csv`).

| Id | Pág. | Texto actual | Correcto | Corrección propuesta |
|---|---|---|---|---|
| A1 | 3, 4 | nDCG@10 completa 0,83 / BM25 0,57 / denso 0,69 | 0,82 / 0,56 / 0,68 | Macros generadas |
| A2 | 3, 4 | Español: completa 0,78 / BM25 0,34 | 0,76 / 0,33 | Macros |
| A3 | 3, 4 | Filtros +0,05, reordenamiento +0,10 y C@5 0,41 → 0,97 | Sin cambio (+0,045, +0,097, 0,407 → 0,973) | Pasar a macros de todos modos |
| A4 | 4 | «κ = 0,79» y «1 %» en el abstract en inglés | 0.79 y 1% | Macro en inglés (B1 de la revisión) |
| A5 | 81 | «de 0,570 con BM25 a 0,834 ($+0,263$ [$+0,207$; $+0,321$])» | 0,558 → 0,816, $+0,258$ [$+0,202$; $+0,315$] | Macros |
| A6 | 82 | Densa frente a BM25 $+0,122$ | $+0,120$ | Macro |
| A7 | 82 | Completa en español 0,778 frente a BM25 en inglés 0,626 | 0,763 frente a 0,615 | Macros |
| A8 | 82 | Filtros $+0,046$ global y $+0,181$ con restricciones | $+0,045$ y $+0,178$ | Macros |
| A9 | 82 | Híbrida $-0,003$ | $-0,004$ | Macro |
| A10 | 82 | Reordenamiento $+0,099$ | $+0,097$ | Macro |
| A11 | 82 | C@5 «de 0,41 a 0,95» sin decir el peldaño | 0,407 → 0,953 (+filtros); completa 0,973 | Nombrar el peldaño (M7 de la revisión) |
| A12 | 51 | «bajan entre 0,012 y 0,018» (los nueve originales) | ILIKE baja 0,001; los otros ocho, entre 0,012 y 0,018 | «los ocho sistemas que no son ILIKE» |

## B. Cifras que no coinciden con los datos

| Id | Pág. | Texto actual | Correcto | Fuente | Origen | Corrección propuesta |
|---|---|---|---|---|---|---|
| B1 | 74 | Iteración 2: fidelidad 0,890 y cumplimiento 0,962, comparados con 18 respuestas de la Iteración 1 | En la Iteración 2 hay 21 respuestas (incluye en-co-03, es-co-03 y en-co-15, que cambiaron de texto). En las 18 comunes, la fidelidad es **0,886**; el cumplimiento está por recalcular. | `evaluation/analysis/e2_context_compliance.mjs`: para la Iteración 2 compara la consulta consigo misma (`finalQ` = la misma corrida) | Error del script de Claude, 16-nov (`0e1f37b`) | Corregir el script y volver a correrlo (requiere `job-posting-db` arriba); citar 18 frente a 18 |
| B2 | 74 frente a 61 | Dos grupos de 18 «con restricciones»: fidelidad de la Iteración 1 0,924 (p. 74) y 0,921 (tabla 6.11) | Ambas son correctas, pero son conjuntos distintos: la p. 74 usa las consultas con filtros esperados (incluye en/es-no-02, ruidosas) y la tabla, la categoría | Recalculado con las corridas `…00-59-39…generate-full` y `…20-15-22…generate-test-full` | Claude, 16-nov | Decirlo en la p. 74 |
| B3 | 55 | HNSW frente a exacto: «altera las diez primeras posiciones en 22 de las 85 consultas (en 20 de ellas cambia una o dos ofertas…), y en 15 de esas 22 el cambio favorece al índice aproximado» | Cambia la lista (orden o contenido) en **26**; en **22** cambia el nDCG@10; en 24 de las 26 cambian 1 o 2 ofertas o solo el orden; **16** a favor de HNSW y 6 en contra | `pg-exact.trec` y `pg-hnsw.trec` de la corrida E1 (idénticos a los de la corrida final) y `per_query.csv` | La frase mezcló «cambia la lista» con «cambia el nDCG»; el 15 viene de los juicios anteriores a E1. Escrita el 14-nov (`cbfee01`), no se recalculó con E1. | «cambia el nDCG@10 en 22 de las 85 consultas; en 16 a favor del índice aproximado y en 6 en contra» |
| B4 | 63 | Longitud mediana de las respuestas de la Iteración 1: 1.354 caracteres | 1.354,5 (mediana de 90) | `…01-06-11…latency-qdrant-generation/latency.jsonl` | Redondeo hacia abajo | 1.355, o «unos 1.350» (menor) |

## C. Afirmaciones que se contradicen entre capítulos

| Id | Pág. | Texto actual | Contradice a | Origen | Corrección propuesta |
|---|---|---|---|---|---|
| C1 | 81 | «El corpus, las consultas, los juicios, las corridas y el código del arnés están en el repositorio público» | §4.11 (p. 40) y Anexo C (p. 97): el corpus no se publica | Conclusiones del 16-nov (`01c8e46`); §4.11 se precisó el 17-nov (M14) | Quitar el corpus de la lista; repetible frente a reproducible por terceros, como en §4.11 (respuesta al OE2) |
| C2 | 62, 76, 78, 82 | «El reordenamiento es el componente que más aporta» | Densa frente a BM25 +0,120 > reordenamiento +0,097 (pp. 53-55) | Frase del 18-oct (`6b63f76`), cierta solo dentro de la escalera | «el que más aporta sobre la recuperación densa» |
| C3 | 57, 76 | «Sin filtros, menos de la mitad de las ofertas devueltas cumple las condiciones… con cualquier sistema» | Completa sin filtros: C@5 0,653 y C@10 0,527 (tabla 6.7, p. 58) | 18-oct (`6b63f76`), con 9 sistemas; el sistema posterior (17-nov) la vuelve falsa | «Sin filtros ni reordenamiento…»; el reordenador sube el cumplimiento a 0,653 pero no lo resuelve. En la p. 57, «vuelve a 0,653» → «baja a 0,653». |
| C4 | 75, 79 | «Lo que las detecciones tienen en común es que miraron salidas intermedias» / «en todas las detecciones lo decisivo fueron medidas deterministas de etapas intermedias» | Tabla 6.16 (p. 67): A1, A2 y C1 salieron de revisar el código o la documentación | Claude, 17-nov (`a783af8`), en la misma edición que creó la tabla | Limitarlo a las detecciones por métrica e inspección (9 de 12) |
| C5 | 3, 4, 15, 19, 29, 82 | Fallas «que el protocolo reveló/detectó»; «se detectaron porque el protocolo mide salidas intermedias» (p. 82); «la aplicación del protocolo reveló 20 fallas» | Tabla 6.16: 5 de 12 por métricas del protocolo, 4 por inspección y 3 por revisión de código; las 8 del arnés, por inspección o revisión | 18-oct (`6b63f76`) y 16-nov (`01c8e46`); H1 de la revisión, decidido pero sin aplicar fuera del Cap. 6 | Conservar el texto de OE3 (decisión del director). En la Metodología, la aplicación del protocolo incluye su preparación. En el resto del texto, «que reveló la aplicación del protocolo, incluida su preparación», con el desglose 5/4/3 donde se cuantifique. |
| C6 | 82 | «Ninguna de las fallas silenciosas producía un error visible… Se detectaron porque el protocolo mide salidas intermedias de cada etapa» | Mismo caso que C4 y C5: de las 10 silenciosas, 4 por métrica, 4 por inspección y 2 por código | 16-nov (`01c8e46`) | Igual que C5 |
| C7 | 14, 3 | «El centro del trabajo es un protocolo de evaluación»; «se diseñó un protocolo… y se aplicó» | §4.1 (p. 31): el artefacto es el pipeline y el protocolo es el instrumento | 18-oct; H2 decidido, sin aplicar fuera del Cap. 4 | Alinear con §4.1 |
| C8 | 19 | OE4: «aporte de cada componente… en calidad de la recuperación **y fidelidad de la respuesta**» | §4.2 (p. 33): la fidelidad se mide en la configuración final y entre iteraciones, no por componente | OE4 aprobado el 19-oct; la medición nunca fue por componente | OE4 sin cambios (decisión del director). Las Conclusiones lo declaran cumplido en parte, y se agrega a Limitaciones. |
| C9 | 19, 15 | «corpus congelado de ofertas de empleo remoto»; «ofertas de empleo remoto en inglés» | §4.4 (p. 34): el 36 % no está marcado como remoto | 18-oct; M11 de la revisión | «de agregadores orientados al empleo remoto» |
| C10 | 86 | Anexo A.3: las 25 consultas en español «se redactaron a partir de la distribución real de títulos y habilidades del corpus» | §4.4.1 (p. 35) y Limitaciones (p. 80): son traducciones del autor de consultas en inglés (misma `infoNeedId`, comprobado en `queries.v2.draft.jsonl`) | 19-oct (`d67c731`) | «Son traducciones de consultas en inglés que se redactaron a partir de la distribución del corpus» |
| C11 | 83 frente a 77 | Trabajo futuro: solo fusión ponderada o traducir la consulta | Discusión: retirar la híbrida o limitarla a las ruidosas, validándolo en desarrollo | Conclusiones del 16-nov, antes de E1 | Alinear con la p. 77 |
| C12 | 81 | Objetivo 2: «nueve sistemas que forman una escalera» | 13 sistemas (9 + 4 posteriores), §4.5 | Antes de E1 | Macro de conteo |
| C13 | 59, 76, 82 | «La configuración completa en español supera incluso a BM25 sobre la consulta en inglés (traducción perfecta)» | Es cierto frente a BM25 simple (0,763 frente a 0,615), pero empata con BM25 + filtros + reordenamiento en inglés (0,763) | 18-oct; los sistemas posteriores no se miraron en este punto | Agregar la comparación con BM25 + filtros + reordenamiento |
| C14 | 77 | Recomendación de aplicar la híbrida «solo a las consultas ruidosas, donde aporta» (+0,040 en la escalera) | Dentro de la configuración completa, en las ruidosas aporta solo +0,011 (0,819 frente a 0,808) | Claude, 17-nov | Matizar: el aporte en las ruidosas casi desaparece con el reordenamiento |

## D. Remisiones a cambios no hechos u omisiones (causa 4)

| Id | Pág. | Problema | Corrección propuesta |
|---|---|---|---|
| D1 | 34 frente a 44 | §4.3 dice que la tabla 5.1 compara las tres configuraciones (desplegada, de referencia y evaluada) con modelos y fechas; la tabla 5.1 solo tiene la de referencia | Tabla 5.1 en tres columnas (esquema aprobado el 17-nov, en `steps.md`) |
| D2 | 32 frente a 19 | §4.1.1 remite al alcance (§2.5) para excluir la fragmentación; el §2.5 no la menciona, y la p. 46 la justifica con las iteraciones de abril | Agregarla al §2.5 y quitar el apoyo en abril (M10) |
| D3 | 49-50 | Tabla 5.4: 0,820 de Qwen con 30 candidatas; el texto dice 0,832 → 0,830 sin explicar la diferencia | Explicación ya verificada: mismas listas y etiquetas, otro agrupamiento (6 frente a 3 sistemas, 15,0 frente a 13,7 relevantes por consulta) |
| D4 | 49-50 | **Nuevo:** la selección del reordenador (tabla 5.4) se juzgó con el juez local (Llama 3.1 8B, κ = 0,508 en validación), y el Cap. 5 no lo dice | Declararlo en el pie de la tabla y en el texto: la regla se aplicó con el juez de desarrollo, y su resultado se confirmó después en la prueba con el juez final (+0,097) |
| D5 | 97 | Etiqueta del repositorio pendiente (`\pendiente`) | Al etiquetar la versión entregada (B3 de la revisión) |
| D6 | 24 | «En la búsqueda bibliográfica de este trabajo… resultaron escasos y recientes»: la búsqueda no está documentada en el Estado del arte | Fuera de este plan (E4); señalarlo |

## E. Descripciones del método desactualizadas (causa 5)

| Id | Pág. | Texto actual | Correcto | Origen | Corrección propuesta |
|---|---|---|---|---|---|
| E1 | 37 | «De los pares juzgados se extrae una muestra aleatoria del 20 %» | 401 pares = 20 % de los 1.977 de la corrida final; tras E1 son el 18 % de 2.249, y los 272 pares posteriores no están en la muestra | Protocolo del 10-oct (`c692ade`) | «el 20 % de los 1.977 pares de la corrida final»; declarar que los 272 posteriores no se validaron |
| E2 | 88 | Anexo A.8: «El juez de RAGAS es el juez final… Por eso su ventana de contexto se fija en 16.384 *tokens*» | La ventana de 16.384 era un ajuste del juez local en Ollama (D2); con GPT-6 Sol, el límite que fija el arnés es el de salida (`--max-tokens 4096`) | Frase del 13-oct (`7c6bd66`), cuando el juez de RAGAS era local; el 14-nov se antepuso «es el juez final» | Separar los dos jueces |
| E3 | 37 | La muestra está «estratificada por etiqueta del juez»: no dice qué juez | Era el juez local, el único disponible al extraerla | 10-oct | Decirlo |

## F. Verificado sin discrepancias

Se recalcularon y coinciden: §6.1 (2.249 pares; 19,5/8,3/57,1/15,0 %; 10,4 relevantes por necesidad, mín. 1, máx. 25, 32 < 10, 12 < 5; techos 0,91 y 0,75; 272 pares nuevos, 46 relevantes en 34 necesidades); §6.2 (κ de calibración y validación, IC, matrices, 28/20/8, 91 frente a 103, 58, local 0,508 con 70/6, 16 desacuerdos 9/7); §6.3 (familias de 14 y 9, todas las diferencias e IC de la escalera, las posteriores y el texto por categoría e idioma; 78 vacías de ILIKE; 84 de BM25; 65/77/6; P@5 0,667 = 74 % del techo; escalera del juez local +0,050/−0,002/+0,077 y 0,73 → 0,68); §6.4 (n = 83, mediana 0,92, mínimo 0,50, relevancia 0,89/0,82, juez local 0,679 con 19 < 0,5 y 5 en 0, Pearson 0,04 (83) y 0,18 (67), las cinco respuestas en 0 entre 0,81 y 1,00); §6.5 (tablas; 29 de 30 llamadas al clasificador; 1.666 caracteres); §6.6 (500.000 vectores: 0,816/0,950, 0,956 en 1,88 ms, 0,984 en 4,21 ms, filtro del 1 % entre 0,872 y 0,899 en unos 10 ms, unas 2.400 consultas por segundo; carga 16/133 s y 77/360 s; 4,1 + 2,0 GB frente a 1,86 GB; pico 7,8 y 4,1 GB; corpus real entre 6.700 y 8.400 consultas por segundo); Cap. 5 (tabla 5.4 completa, 0,019, 0,832 → 0,830, 1.184 → 788 ms).

Sin recalcular, porque sus datos no cambiaron desde que se escribieron (14 a 16-nov): E3 (compuerta fuera de dominio), la verificación humana de RAGAS, las fallas D2 y D6 y el corpus (Cap. 4). Se revisarán con el verificador estricto (Paso 3).

## G. Correcciones aplicadas (25-nov)

Páginas de `borradores/vista-previa-final.pdf` compilada el 25-nov (105 págs.), antes de quitar las páginas en blanco: en la versión final de la revisión (100 págs., sección H) los capítulos 4 a 7 se adelantan entre 2 y 5 páginas. Todas las correcciones están en `borradores/*-final.tex`; los capítulos que no tenían borrador (Introducción, Preliminares, Estado del arte y Artefacto) se copiaron a `borradores/` y se agregaron a `build-preview-final.sh`.

**Herramientas (Pasos 2 y 3 del plan).**
- `evaluation/analysis/tables.py` escribe además `borradores/tablas/cifras.tex`: 117 macros `\cXxx` con las cifras clave, con variantes de dos decimales (`…Dos`) y en inglés (`…En`, `…EnTres`). Las 13 tablas `res-*.tex` no cambiaron (`git status`). La vista previa lee `cifras.tex` en el preámbulo.
- `check-numbers.py` reescrito: revisa los nueve archivos del documento con coincidencia exacta del token; fuentes: tablas generadas, `cifras.tex` y `check-numbers-permitidas.txt` (cada número con su fuente o motivo y los archivos donde vale). Sin `steps.md`. Estado final: **0 cifras sin fuente, 0 macros indefinidas**.
- Las variantes en inglés van en `\mbox{}`: babel en español convierte el punto en coma en modo matemático, y eso producía «κ = 0,79» en el abstract (B1 de la revisión). El «1 %» del abstract se escribe con `\symbol{37}`.

| Id | Corrección aplicada | Pág. nueva |
|---|---|---|
| A1–A4 | Resumen y abstract con macros (0,82 / 0,56 / 0,68 / 0,06; 0,76 / 0,33; 0,41 → 0,97; κ 0,79 y 0.79) | 3, 4 |
| A3 | **Hallazgo nuevo:** el aporte de los filtros es 0,0446, que a dos decimales da +0,04, no +0,05. Decisión del autor: las diferencias del resumen van con tres decimales (+0,045 y +0,097) | 3, 4 |
| A5–A10 | Conclusiones con macros | 83, 84 |
| A11 | C@5 «de 0,407 a 0,953 en su peldaño (0,973 con la configuración completa)»; se agrega que sin filtros la completa cumple 0,653 | 84 |
| A12 | «los ocho sistemas originales distintos de ILIKE … (la de ILIKE, 0,001)» | 53 |
| B1 | Script de E2 corregido (mismas 18 consultas en ambas iteraciones) y vuelto a correr: Iteración 2 con **cumplimiento 0,956** y **fidelidad 0,886** (antes 0,962 y 0,890). Iteración 1 sin cambios (0,356 y 0,924) | 76 |
| B2 | Se aclara que ese grupo de 18 no es la fila «Con restricciones» de la tabla de iteraciones (incluye en-no-02 y es-no-02) | 76 |
| B3 | «cambia la lista en 26 de las 85 consultas (en 24, una o dos ofertas o solo el orden), y el nDCG@10 en 22; en 16 a favor y en 6 en contra» | 57 |
| B4 | «unos 1.350» (decisión del autor) | 65 |
| C1 | Conclusiones: repetible frente a reproducible por terceros, como §4.11; el corpus no se publica | 84 |
| C2 | «el que más aporta sobre la recuperación densa» en las cuatro apariciones y en la síntesis | 65, 78, 80, 84, 85 |
| C3 | «Sin filtros ni reordenamiento…»; «baja a 0,653: el reordenador sube el cumplimiento, pero no lo resuelve» | 59, 78 |
| C4 | Limitado a «las detecciones por métrica y por inspección, 9 de las 12»; las otras 3, de la revisión del código | 77, 81 |
| C5, C6 | Metodología: «aplicar el protocolo incluye prepararlo» (inspección de planes, datos y código frente a la documentación). Resumen, Introducción, Estado del arte y Conclusiones: «la aplicación del protocolo, incluida su preparación»; Conclusiones con el desglose 5/4/3 y el contrafactual acotado a las dos fallas probadas. OE3 sin cambios | 3, 15, 29, 33, 84 |
| C7 | Introducción: «El artefacto es el pipeline de JobAI, y el instrumento con que se evalúa es un protocolo…»; resumen alineado con §4.1 | 3, 14 |
| C8 | OE4 sin cambios. Conclusiones declaran el cumplimiento parcial en la fidelidad; nueva limitación «La fidelidad por componente» | 82, 84 |
| C9 | «ofertas en inglés de agregadores orientados al empleo remoto» (Introducción) y «tres agregadores públicos orientados al empleo remoto» (§2.5) | 15, 19 |
| C10 | Anexo A.3: traducciones de consultas en inglés | 88 |
| C11 | Trabajo futuro alineado con la Discusión: retirar la híbrida o limitarla a las ruidosas, decidiéndolo con desarrollo | 85 |
| C12 | «13 sistemas (una escalera de componentes con sus líneas base y cuatro sistemas del análisis posterior)» | 83 |
| C13 | Se agrega el empate con BM25 + filtros + reordenamiento en inglés (0,763) | 61, 78, 84 |
| C14 | «… donde aporta en la escalera (+0,040), aunque dentro de la configuración completa ese aporte casi desaparece (0,819 frente a 0,808 sin ella)» | 79 |
| D1 | Tabla 5.1 en tres columnas (desplegada, de referencia, evaluada) con modelos y fechas; párrafo nuevo «Origen de los parámetros» | 43, 44 |
| D2 | Fragmentación agregada al §2.5; el Cap. 5 ya no la justifica con las iteraciones de abril; trabajo futuro | 20, 45, 85 |
| D3 | Explicación de 0,820 frente a 0,832 (mismas listas y etiquetas; agrupamiento de 3 frente a 6 sistemas, 13,7 frente a 15,0 relevantes por consulta) | 50 |
| D4 | Pie de la tabla 5.4 y párrafo: la selección se juzgó con el juez local (κ 0,508); el aporte del reordenamiento se confirmó con el juez final (+0,097). Verificado: las corridas `…18-22-24…-s1` y `…18-34-01…-s2` solo tienen `qrels.localhost_11434_llama3.1_8b` | 50 |
| D5 | Sin cambio: se resuelve al etiquetar la versión entregada | 99 |
| D6 | Fuera de este plan (E4) | — |
| E1, E3 | «De los 1.977 pares … una muestra del 20 % (401 pares), estratificada … por la etiqueta del juez local, el único disponible al extraerla»; los 272 pares posteriores no están en la muestra | 37 |
| E2 | Anexo A.8: salida de hasta 4.096 tokens (RAGAS fija 1.024 por defecto); el contexto cabe en la ventana del modelo; los 16.384 eran del juez local (D2) | 90 |

**Verificado además durante las correcciones:** las cifras del idioma de la Iteración 1 (21 de 25 en inglés; relevancia 0,845, 0,910 y 0,879), recalculadas con las palabras vacías de cada respuesta.

**Búsqueda de cifras viejas en el PDF** (paso 4 de la verificación): 0,834, 0,570, 0,263, 0,122, 0,181, 0,626, 0,890, 0,962, 0,099, 0,003, «con cualquier sistema», «vuelve a 0», «todas las detecciones», «centro del trabajo» y 1.354: ninguna aparición. Las que quedan son correctas: 0,57 s (clasificación), «nueve sistemas de la corrida final», 16.384 en la falla D2 y 0,046 como valor $p$.

## H. Revisión final de coherencia (25-nov, noche)

Lectura completa de los nueve archivos, a pedido del autor, buscando incoherencias de argumento, texto y cifras. Se corrigió:
- **Páginas en blanco** (8, 10, 42, 52 y 98): la clase `book` abre los capítulos en página impar. Decisión del autor: opción `openany`, aplicada en `build-preview-final.sh` (hay que agregarla a `\documentclass` de `main.tex` al pasar a `Plantilla/`). La vista previa queda en 100 págs.
- **Objetivos en la Introducción:** tenían una versión resumida que omitía la fidelidad en el OE4. Decisión del autor: copiar el texto oficial del Cap. 2.
- **Metodología:** repetición «Este trabajo… En este trabajo» (§4.1.1); el OE3 «se responde con las fallas que la evaluación reveló» → «que reveló la aplicación del protocolo, incluida su preparación»; la configuración evaluada se precisa como servida desde Qdrant (y pgvector para comparar), igual que la tabla 5.1.
- **Introducción:** «congelado para que los experimentos sean reproducibles» → «repetibles», coherente con §4.11.
- **Resultados:** las cuatro respuestas de agregación no exactas no son «todas fallas abiertas» (una es un error del clasificador fuera de la taxonomía); la falla D2 era del **juez local** de RAGAS (tabla y descripción), coherente con el Anexo A.8 corregido.
- **Discusión:** «tres de los cuatro componentes evaluados» → «de recuperación», y se agrega que el cambio de modelo no es concluyente (el modelo multilingüe también se evaluó).
- **Conclusiones:** el origen de las 4 detecciones por inspección se nombra como en la tabla 6.16; el OE3 cuantifica la mejora de la Iteración 2 (+0,138 [+0,101; +0,178] sobre la densa); se cierran los tres objetivos de la solución de §4.1 (a, b y c), que la Metodología definía y ningún capítulo retomaba completos.

**Verificado sin cambios:** cifras de la prosa de Resultados frente a las tablas generadas (PE2, iteraciones, latencia, agregación, restricciones); las dos figuras del Cap. 6, regeneradas desde la corrida E1 e idénticas píxel a píxel a las usadas; conteos de la taxonomía (5/4/3; silenciosas 4/4/2); referencias cruzadas (sin indefinidas).

**Pendiente conocido, fuera de esta ronda:** la frase del Estado del arte sobre la búsqueda bibliográfica (D6, E4) y la etiqueta del repositorio (D5).

## Siguiente paso

El autor revisa la vista previa (`borradores/vista-previa-final.pdf`). Después: comentarios de forma del director (ronda aparte), E4, siglas y bibliografía; al aprobar, pasar `borradores/` (y `borradores/tablas/`, incluido `cifras.tex`, con el `\input` en el preámbulo de `main.tex`) a `Plantilla/`.
