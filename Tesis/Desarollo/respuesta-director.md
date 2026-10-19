# Respuesta del director a la entrega del 15-oct-2026

Versión que revisó el director: `Tesis/Desarollo/borradores/Luis-Peña-trabajo-de-grado_borrador1.pdf` (85 páginas, sha256 `beb0cccd38141339…`), generada desde `Tesis/Plantilla/` tal como estaba el 15-oct a las 21:35. Texto del correo: `Tesis/Desarollo/nota-profesor-reencuadre.md`. El director cita la numeración del PDF; la correspondencia con los archivos está en `steps.md` ("▶ Estado").

**Fecha de la respuesta:** 2026-10-19 (fecha en que el autor la compartió; _confirmar_)
**Canal:** correo (_confirmar_)

## Texto literal

> Buenos días Luis Esteban.
> A continuación, los comentarios.
> El titulo del capítulo 2 hay que cambiarlo. Sugiero que sea algo como preliminares de la investigación.
> La pregunta de investigación está bien. Se puede trabajar así.
> La hipótesis en este tipo de trabaos no va. Hay que quitar esas sección del documento.
> Los objetivos estan bien definidos.
> La metodología y el capitulo 5 (Diseño y desarrollo del artefacto) deben hacer una síntesis o resumen. El fuerte del trabajo debe ser la sección de los resultados y conclusiones.
>
> Va bien, hay que ir finalizando. Recuerde que se debe colocar en algún lado el enlace del repositorio con lo que se ha realizado en software.
>
> Quedo pendiente a comentarios.

## Respuestas a las cuatro preguntas de la nota

| # | Pregunta | Respuesta del director | Consecuencia |
|---|---|---|---|
| 1 | ¿Aprueba el problema, la pregunta, las hipótesis y los cuatro objetivos (Cap. 2)? | Pregunta y objetivos aprobados. Las hipótesis no van. El problema no se objeta, pero el título del capítulo cambia. | Se quita §2.3 y toda mención a H1-H3; el capítulo pasa a llamarse "Preliminares de la investigación". |
| 2 | ¿Acepta el modelo de lenguaje como juez, validado con una muestra humana? | Sin respuesta. | Se sigue el plan (GPT-4o + validación humana). Conviene volver a preguntarlo en la respuesta al director. |
| 3 | ¿Extensión o estructura de capítulos exigida por el pregrado? | Sin límite de páginas. Metodología y Artefacto deben ser una síntesis; el peso está en Resultados y Conclusiones. | Metodología y Artefacto se condensan (detalle a anexos); las fallas pasan a Resultados. |
| 4 | ¿Fechas intermedias obligatorias? | Ninguna. "Hay que ir finalizando". | Se mantiene el cronograma (envío completo 9-15 nov). |

## Comentarios y decisiones

| # | Comentario (PDF: capítulo/sección/página) | Tipo | Archivos afectados | Opciones (recomendada primero) | Decisión del autor | Estado |
|---|---|---|---|---|---|---|
| 1 | Cambiar el título del Cap. 2 ("preliminares de la investigación") | Forma y extensión | `main.tex` (l. 87), `Cap0` (estructura) | Usar exactamente "Preliminares de la investigación" | Por defecto, sin objeción (19-oct) | En borradores |
| 2 | La pregunta de investigación está bien | Problema y objetivos | — | — | — | Sin cambios |
| 3 | Quitar la sección de hipótesis | Problema y objetivos | `Cap1` (§2.3 y marco conceptual), `Cap0`, `Cap2` (§3.5), `Cap3` (Peffers, PE, amenazas), `Cap4` (Iteración 1), `Cap5` (por categoría, Discusión), `Cap9` | Quitarlas por completo; la Discusión se organiza por preguntas de evaluación y compara con la literatura | Recomendada (19-oct) | En borradores |
| 4 | Los objetivos están bien definidos | Problema y objetivos | — | — | — | Sin cambios |
| 5 | Sintetizar la Metodología (Cap. 4) y el Artefacto (Cap. 5); el peso, en Resultados y Conclusiones | Forma y extensión | `Cap3`, `Cap4`, `Cap5`, `BackMatter/B01-Anexos.tex`, `main.tex` | (a) Detalle a anexos; (b) eliminarlo y remitir al repositorio; (c) fusionar ambos capítulos. Fallas: (a) a Resultados; (b) tabla en Resultados y detalle en anexo; (c) condensadas en Artefacto. Alcance: solo estos comentarios; Discusión y Conclusiones tras la corrida final | (a) anexos; fallas a Resultados con D6; solo estos comentarios (19-oct) | En borradores |
| 6 | Poner el enlace del repositorio | Otro | `Cap0` (§Metodología), `Cap3` (§Reproducibilidad), anexo C | (a) URL raíz y `main` al día con etiqueta antes del envío; (b) enlace a la rama de la tesis; (c) etiqueta solo al final | (a) (19-oct) | En borradores; `main` y etiqueta pendientes (paso 5 del plan) |
