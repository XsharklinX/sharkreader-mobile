import React from 'react';
import Sheet, { Group } from '../ui/Sheet.jsx';
import { resumenRacha, MINUTOS_PARA_ENCENDER } from './streak.js';
import { IconFlame } from '../ui/icons.jsx';

/**
 * La racha.
 *
 * ## Qué se enseña y por qué
 *
 * Antes la racha era un número suelto repetido en dos sitios: un «7 días» sin
 * contexto. Eso no dice lo único que hace falta saber —**si hoy ya cuenta**— ni
 * deja ver los salvadores, que se ganan solos y se gastan solos sin que nadie se
 * entere de que existían.
 *
 * El orden responde a las preguntas por urgencia:
 *
 *  1. **¿Cuánto llevo?** El número, grande.
 *  2. **¿Hoy cuenta ya?** Lo primero que se mira al abrir esto por la noche. Si no
 *     cuenta, cuántos minutos faltan — que son cinco, y verlo escrito convierte
 *     «tengo que leer» en «me faltan tres minutos».
 *  3. **¿Qué pasó estos días?** Cuatro semanas de puntos. Un día salvado se pinta
 *     distinto de uno leído: es información sobre lo que hiciste, y falsearla para
 *     que la fila se vea bonita es mentir al usuario sobre su propio historial.
 *  4. **¿Qué red tengo?** Los salvadores, con lo que hacen dicho en una frase.
 *
 * ## Por qué no hay botones
 *
 * No se puede comprar un salvador ni congelar la racha a mano. La racha vale algo
 * justo porque no se puede negociar; en cuanto se compra, deja de contar días
 * leídos y pasa a contar toques.
 */
export default function StreakSheet({ stats, onClose }) {
    const resumen = resumenRacha(stats || {});
    const { racha, mejor, hoy, salvadores, peligro, dias } = resumen;

    // Cuatro semanas en filas de siete. La primera fila se rellena por delante
    // para que las columnas sean días de la semana de verdad y no una cuadrícula
    // arbitraria: así se ve si lo que fallas son los lunes.
    const huecos = dias.length ? dias[0].diaSemana : 0;

    return (
        <Sheet
            title="Tu racha"
            subtitle={racha > 0 ? `Mejor marca: ${mejor} ${mejor === 1 ? 'día' : 'días'}` : undefined}
            onClose={onClose}
        >
            {() => (
                <>
                    <div className={`racha-hero${hoy.encendida ? ' viva' : ''}`}>
                        <span className="racha-llama" aria-hidden="true">
                            <IconFlame size={30} />
                        </span>
                        <div>
                            <b>{racha}</b>
                            <span>{racha === 1 ? 'día seguido' : 'días seguidos'}</span>
                        </div>
                    </div>

                    {/* ── Hoy ──────────────────────────────────────────────────
                        Lo primero que se busca al abrir esto. */}
                    <Group label="Hoy">
                        {hoy.encendida ? (
                            <p className="racha-hoy on">
                                Hoy ya cuenta. Has leído {hoy.minutos} {hoy.minutos === 1 ? 'minuto' : 'minutos'}.
                            </p>
                        ) : (
                            <>
                                <div className="racha-meta">
                                    <span className="racha-meta-barra">
                                        <i style={{ width: `${Math.round(hoy.progreso * 100)}%` }} />
                                    </span>
                                    <span className="racha-meta-txt">
                                        {hoy.minutos} / {MINUTOS_PARA_ENCENDER} min
                                    </span>
                                </div>
                                <p className={`racha-hoy${peligro ? ' peligro' : ''}`}>
                                    {peligro
                                        ? `Te faltan ${hoy.faltan} ${hoy.faltan === 1 ? 'minuto' : 'minutos'} y no te quedan salvadores: si no lees hoy, la racha vuelve a empezar.`
                                        : `Te faltan ${hoy.faltan} ${hoy.faltan === 1 ? 'minuto' : 'minutos'} para encender el día.`}
                                </p>
                            </>
                        )}
                    </Group>

                    {/* ── Las últimas cuatro semanas ───────────────────────── */}
                    <Group label="Últimas cuatro semanas">
                        <div className="racha-semana" aria-hidden="true">
                            {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((letra, i) => (
                                // eslint-disable-next-line react/no-array-index-key
                                <span key={i} className="racha-dia-letra">{letra}</span>
                            ))}
                        </div>
                        <div className="racha-rejilla" role="img" aria-label={`Racha de ${racha} días`}>
                            {Array.from({ length: huecos }, (_, i) => (
                                // eslint-disable-next-line react/no-array-index-key
                                <span key={`hueco-${i}`} className="racha-dia fuera" />
                            ))}
                            {dias.map((dia) => (
                                <span
                                    key={dia.clave}
                                    className={`racha-dia ${dia.estado}${dia.hoy ? ' hoy' : ''}`}
                                    title={`${dia.fecha.toLocaleDateString('es', { day: 'numeric', month: 'short' })} · ${dia.minutos} min`}
                                />
                            ))}
                        </div>
                        <div className="racha-leyenda">
                            <span><i className="leido" /> Leído</span>
                            <span><i className="salvado" /> Salvado</span>
                            <span><i className="vacio" /> Sin leer</span>
                        </div>
                    </Group>

                    {/* ── Salvadores ───────────────────────────────────────── */}
                    <Group label="Salvadores">
                        <div className="salvadores">
                            {Array.from({ length: salvadores.maximo }, (_, i) => (
                                <span
                                    // eslint-disable-next-line react/no-array-index-key
                                    key={i}
                                    className={`salvador${i < salvadores.tiene ? ' lleno' : ''}`}
                                    aria-hidden="true"
                                >
                                    <IconFlame size={17} />
                                </span>
                            ))}
                            <span className="salvadores-txt">
                                {salvadores.tiene} de {salvadores.maximo}
                            </span>
                        </div>
                        <p className="option-desc">
                            Un salvador cubre un día que no leas, y la racha sigue. Se gasta solo,
                            sin preguntar: por eso puedes fallar un día sin perderlo todo.
                            {salvadores.lleno
                                ? ' Ya tienes todos los que caben.'
                                : ` El siguiente llega a los ${salvadores.diasParaElSiguiente} ${salvadores.diasParaElSiguiente === 1 ? 'día' : 'días'} de racha.`}
                        </p>
                    </Group>
                </>
            )}
        </Sheet>
    );
}
