/**
 * Lo que hay que saber de la racha para poder enseñarla.
 *
 * Las reglas viven en `core/readingProgress.js` y son las mismas que en la versión
 * de escritorio: cinco minutos en un día lo encienden, cada cinco días de racha se
 * gana un salvador, se guardan como mucho dos, y un salvador cubre un día que no
 * leíste para que la racha no se rompa.
 *
 * Aquí no se decide nada de eso. Esto solo traduce el estado guardado a lo que
 * necesita una pantalla: si hoy ya cuenta, cuánto falta si no, qué pasó cada día
 * de las últimas semanas y cuántos salvadores quedan.
 *
 * ## Por qué en un módulo aparte y sin React
 *
 * Porque es la parte que se puede equivocar en silencio. Que la racha diga 7
 * cuando son 6, o que un día salvado se pinte como leído, no lo va a cazar nadie
 * mirando la pantalla: hay que esperar a que pasen los días. Aquí se prueba con
 * fechas inventadas y en un segundo.
 */

/** Minutos que hay que leer en un día para que cuente. Ver `applyReadingMinute`. */
export const MINUTOS_PARA_ENCENDER = 5;

/** Cada cuántos días de racha se gana un salvador, y cuántos caben. */
export const DIAS_POR_SALVADOR = 5;
export const MAX_SALVADORES = 2;

const clave = (fecha) => fecha.toDateString();

const restarDias = (fecha, dias) => {
    const otra = new Date(fecha);
    otra.setDate(otra.getDate() - dias);
    otra.setHours(0, 0, 0, 0);
    return otra;
};

/**
 * Estado de hoy.
 *
 * `currentDailyMins` solo es de hoy si `lastActiveDate` es hoy: si no, es lo que
 * se leyó el último día activo y darlo por bueno diría «llevas 4 de 5 minutos»
 * una semana después de la última lectura.
 */
export const estadoDeHoy = (stats = {}, ahora = new Date()) => {
    const hoy = clave(ahora);
    const esDeHoy = stats.lastActiveDate === hoy;
    const minutos = esDeHoy ? (stats.currentDailyMins || 0) : 0;
    const encendida = (stats.history || {})[hoy] === 'read';

    return {
        encendida,
        minutos,
        faltan: encendida ? 0 : Math.max(0, MINUTOS_PARA_ENCENDER - minutos),
        // Para pintar la barra de 0 a 5. Al encenderse se queda llena aunque se
        // siga leyendo: pasados los cinco minutos ya no mide nada.
        progreso: encendida ? 1 : Math.min(1, minutos / MINUTOS_PARA_ENCENDER),
    };
};

/**
 * Los últimos N días, del más antiguo al de hoy.
 *
 * Cada día es `leido`, `salvado`, `vacio` o `futuro`. Se devuelve también el día
 * de la semana para poder alinearlo en una rejilla sin volver a mirar la fecha.
 */
export const diasRecientes = (stats = {}, cuantos = 28, ahora = new Date()) => {
    const historia = stats.history || {};
    const minutos = stats.minutesByDay || {};
    const dias = [];

    for (let atras = cuantos - 1; atras >= 0; atras -= 1) {
        const fecha = restarDias(ahora, atras);
        const k = clave(fecha);
        const marca = historia[k];

        dias.push({
            fecha,
            clave: k,
            hoy: atras === 0,
            // `getDay()` da 0 para domingo; aquí la semana empieza en lunes.
            diaSemana: (fecha.getDay() + 6) % 7,
            minutos: minutos[k] || 0,
            estado: marca === 'read' ? 'leido' : marca === 'saved' ? 'salvado' : 'vacio',
        });
    }

    return dias;
};

/**
 * Los salvadores: cuántos hay y cuánto falta para el siguiente.
 *
 * Con el máximo alcanzado no se dice «faltan N»: prometer un premio que no se va a
 * entregar es peor que no prometer nada.
 */
export const estadoSalvadores = (stats = {}) => {
    const tiene = Math.min(MAX_SALVADORES, Math.max(0, stats.streakSavers || 0));
    const racha = Math.max(0, stats.streak || 0);
    const lleno = tiene >= MAX_SALVADORES;
    const faltan = DIAS_POR_SALVADOR - (racha % DIAS_POR_SALVADOR);

    return {
        tiene,
        maximo: MAX_SALVADORES,
        lleno,
        // Con racha 0 el siguiente llega al quinto día de leer seguido.
        diasParaElSiguiente: lleno ? null : (faltan === DIAS_POR_SALVADOR && racha > 0 ? DIAS_POR_SALVADOR : faltan),
    };
};

/**
 * ¿Está la racha en peligro?
 *
 * Lo está si hay racha viva, hoy todavía no cuenta y no quedan salvadores. Es el
 * único momento en que avisar aporta algo: con salvadores el descuido no cuesta
 * la racha, y sin racha no hay nada que perder.
 */
export const enPeligro = (stats = {}, ahora = new Date()) => {
    const hoy = estadoDeHoy(stats, ahora);
    const salvadores = estadoSalvadores(stats);
    return (stats.streak || 0) > 0 && !hoy.encendida && salvadores.tiene === 0;
};

/** Todo junto, que es como lo pide la pantalla. */
export const resumenRacha = (stats = {}, ahora = new Date()) => ({
    racha: Math.max(0, stats.streak || 0),
    mejor: Math.max(0, stats.maxStreak || 0, stats.streak || 0),
    hoy: estadoDeHoy(stats, ahora),
    salvadores: estadoSalvadores(stats),
    peligro: enPeligro(stats, ahora),
    dias: diasRecientes(stats, 28, ahora),
});
