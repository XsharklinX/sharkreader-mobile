# Fase 5 — Progreso, logros y notificaciones (v0.5.0)

Estado: **implementada, sin probar en dispositivo**.

Es la fase de menor riesgo técnico del proyecto: casi todo el cálculo ya existía
en el núcleo compartido. El trabajo aquí ha sido darle pantallas móviles y
decidir qué merece espacio en 360 px de ancho.

---

## Reparto de esfuerzo

Dijiste que logros, Sharky y Workshop no son prioritarios. El esfuerzo va
repartido en consecuencia:

| Pieza | Trato |
|---|---|
| Pantalla de progreso | **Completa.** Es el dato de lectura real y es lo que trae de vuelta al usuario. |
| Logros | **Completos**, pero salen casi gratis: las 59 condiciones son del núcleo. |
| Notificaciones | **Completas.** Cierran el cuarto puerto de la arquitectura. |
| Sharky | **Contenido a propósito** — ver más abajo. |
| Workshop | **Sin tocar.** Sigue como en la Fase 0. |

---

## Progreso

`src/stats/derive.js` concentra los cálculos y es todo puro, con `now`
inyectable — sin eso, los tests de rachas y calendarios fallarían según el día en
que se ejecutaran. 39 tests nuevos.

- **Racha** con récord histórico, minutos de hoy y de la semana.
- **Nivel y XP** con la fórmula del escritorio (`readerXp` y `readerLevelFromXp`
  del núcleo) y los mismos siete nombres: Aprendiz → Leyenda.
- **Gráfica de minutos** por semana, mes o año. Dibujada con flex, sin librería:
  son doce valores como mucho y cargar una dependencia de gráficas para esto
  saldría más caro que el propio dato.
- **Heatmap** de seis meses, en columnas semanales que empiezan en lunes y hacen
  scroll horizontal.
- **Metas** diaria y semanal, ajustables.
- **Top de libros** por minutos y hora punta de lectura.

La pantalla tiene estado vacío propio: sin minutos leídos no se enseña un
esqueleto de gráficas a cero, se explica qué aparecerá.

## Logros

Las 59 condiciones vienen del núcleo sin tocar, así que **un logro se desbloquea
en el móvil con el mismo criterio que en escritorio**. Por eso, al importar un
backup, los ya ganados se conservan con su fecha original en lugar de volver a
dispararse.

La reevaluación se hace en un solo sitio (`useStats`) cada vez que cambian
biblioteca o estadísticas. Las condiciones dependen de cosas muy distintas
—número de libros, rachas, subrayados— y comprobarlas repartidas por el código
es la forma segura de que alguna se quede sin desbloquear porque nadie miró
después del evento que la cumplía.

Aviso de desbloqueo arriba, no abajo: la zona inferior es de pulgar y un aviso
tocable sin querer mientras navegas estorba más de lo que celebra.

## Notificaciones

Cuarto puerto implementado. Recordatorio diario a la hora que elijas y resumen
semanal los domingos. Todo local: sin servidor y sin push, coherente con una app
que no manda nada a ningún sitio.

**El permiso se pide al activar el interruptor, no al arrancar.** Un diálogo de
permisos nada más abrir una app es la forma más rápida de que te lo denieguen
para siempre. Si Android lo deniega, el interruptor vuelve solo a apagado en
lugar de quedarse encendido mintiendo.

## Sharky

Contenido a propósito: una tarjeta con una frase, descartable y **apagada por
defecto**.

Reutiliza el guion del núcleo compartido —los 76 KB escritos a mano, que es el
trabajo de verdad— y elige el tono según el contexto (racha viva, libro a medias,
hora de la noche). Lo que **no** se ha portado es la capa de animación: sprites
de pixel art, emotes y cosméticos desbloqueables.

Está preparado para crecer: la elección de tono ya funciona, así que añadir
sprites más adelante es cambiar cómo se pinta, no qué se dice. Si en algún
momento quieres el Sharky completo, dilo y es una tarea acotada.

---

## Estado

| | |
|---|---|
| Tests | **335** (+30 esta fase) |
| APK debug | 25 MB |
| AAB para Play | 12 MB |
| Puertos implementados | 4 de 5 (falta TTS, v0.6.0) |

---

## Sin verificar

Cinco fases sin ejecutar en hardware. Lo nuevo de esta, por orden de riesgo:

1. **Que las notificaciones lleguen** — programar con `every: 'day'` y que el
   sistema no las mate es algo que solo se comprueba dejando pasar un día.
2. **Que el permiso de Android 13+** se pida y se resuelva bien.
3. **Que las estadísticas se acumulen** entre sesiones: el reloj escribe en
   SQLite y la pantalla las relee al salir del lector.
4. Scroll horizontal del heatmap en pantallas estrechas.
