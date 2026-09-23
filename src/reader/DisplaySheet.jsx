import React from 'react';
import Sheet, { Row, Group, Segmented } from '../ui/Sheet.jsx';
import Switch from '../ui/Switch.jsx';
import { READER_THEMES } from './typography.js';
import { PAGE_TRANSITIONS } from './transitions.js';
import { AUTOSCROLL_SPEEDS } from './useAutoScroll.js';
import { SPREAD_MODES } from './spread.js';
import { RULER_MODES } from './ruler.js';
import { REFRESH_INTERVALS, intervalLabel } from './einkRefresh.js';
import { IconSun, IconColumns, IconRotate, IconEink, IconRuler } from '../ui/icons.jsx';

/**
 * Pantalla y lectura.
 *
 * ## El problema que resuelve el rediseño
 *
 * Esta hoja había llegado a **once secciones apiladas**: tinta electrónica,
 * tema, modo de lectura, animación, columnas, gestos, regla, orientación,
 * brillo, filtro cálido y avance automático. Cambiar el fondo —que es lo que más
 * se hace aquí— obligaba a recorrer la lista entera, y las opciones frecuentes
 * competían por atención con las que se tocan una vez en la vida.
 *
 * Ahora hay dos niveles. Arriba **el tema**, que es el motivo por el que se abre
 * esta hoja casi siempre. Debajo, cuatro filas que llevan a lo demás. El brillo
 * y el filtro cálido tienen su propia hoja con botón en la barra superior:
 * estaban en una franja invisible del borde izquierdo que nadie encontraba. El reparto no es por parentesco técnico sino por momento de uso:
 * gestos y orientación van juntos porque los dos se configuran una vez y no se
 * vuelven a mirar.
 *
 * Las muestras de tema llevan **texto de libro**, no una «Aa» sobre un
 * rectángulo de color: lo que se está eligiendo es cómo se verá una página.
 */

/** Fragmento para las muestras. Corto, con acentos y una palabra larga. */
const SWATCH_TEXT = 'Del libro que nunca';

export default function DisplaySheet({
    theme, onChangeTheme,
    dim, onChangeDim, warm, onChangeWarm,
    flow, onChangeFlow,
    transition, onChangeTransition,
    spread, onChangeSpread, columns,
    ruler, onChangeRuler,
    eink, onChangeEink,
    refreshEvery, onChangeRefreshEvery, onFlashNow,
    onOpenGestures,
    autoScroll,
    onClose,
}) {
    // En tinta electrónica el tema lo impone el modo, así que enseñar el
    // selector sería ofrecer algo que no va a surtir efecto.
    const themeLocked = Boolean(eink);

    const pages = {
        paging: {
            title: 'Columnas',
            render: () => (
                <Segmented
                    label="Columnas"
                    value={spread || 'auto'}
                    options={Object.entries(SPREAD_MODES)
                        .map(([id, option]) => ({ value: id, label: option.label }))}
                    onChange={onChangeSpread}
                    hint={`Ahora mismo ${columns === 2 ? 'dos' : 'una'}. En horizontal, una sola
                           columna da noventa caracteres por línea y el ojo pierde el
                           salto de línea.`}
                />
            ),
        },
        gestures: {
            title: 'Gestos y orientación',
            render: () => (
                <>
                    <Group
                        label="Zonas de la pantalla"
                        hint="Nueve zonas con acción propia. Sirve para invertir los lados o
                              para apagar la de abajo, donde se apoya el pulgar."
                    >
                        <button type="button" className="btn btn-block" onClick={onOpenGestures}>
                            Configurar los gestos
                        </button>
                    </Group>

                    {/* El bloqueo de giro se fue: la app entera es vertical, fijado
                        en el manifiesto de Android. Un ajuste que solo puede decir
                        «vertical» no es un ajuste. */}
                </>
            ),
        },

        aids: {
            title: 'Ayudas de lectura',
            render: () => (
                <>
                    <Segmented
                        label="Regla de lectura"
                        value={ruler || 'off'}
                        options={Object.entries(RULER_MODES)
                            .map(([id, option]) => ({ value: id, label: option.label }))}
                        onChange={onChangeRuler}
                        hint="Como poner una cuartilla bajo el renglón. Se arrastra con el dedo y
                              salta de línea en línea, para no cortar las letras por la mitad."
                    />

                    {autoScroll && (
                        <Group
                            label="Avance automático"
                            hint={`${autoScroll.secondsPerPage} segundos por página.`}
                        >
                            <div className="stepper">
                                <button
                                    type="button"
                                    onClick={autoScroll.slower}
                                    disabled={!autoScroll.canGoSlower}
                                    aria-label="Más lento"
                                >
                                    <span aria-hidden="true">−</span>
                                </button>
                                <span className="stepper-val">
                                    {AUTOSCROLL_SPEEDS.length - autoScroll.speedIndex} de {AUTOSCROLL_SPEEDS.length}
                                </span>
                                <button
                                    type="button"
                                    onClick={autoScroll.faster}
                                    disabled={!autoScroll.canGoFaster}
                                    aria-label="Más rápido"
                                >
                                    <span aria-hidden="true">+</span>
                                </button>
                            </div>
                            <button
                                type="button"
                                className={`btn btn-block${autoScroll.running ? '' : ' btn-primary'}`}
                                onClick={autoScroll.toggle}
                            >
                                {autoScroll.running ? 'Detener el avance' : 'Empezar avance automático'}
                            </button>
                        </Group>
                    )}
                </>
            ),
        },

        eink: {
            title: 'Tinta electrónica',
            render: () => (
                <>
                    <Switch
                        label="Modo tinta electrónica"
                        hint="Blanco y negro puros, sin animaciones ni capas de color"
                        checked={Boolean(eink)}
                        onChange={onChangeEink}
                    />

                    <p className="option-desc">
                        Un panel e-ink no tiene niveles intermedios: cualquier capa
                        semitransparente se convierte en una trama de puntos y cualquier
                        animación deja rastro. Este modo apaga las dos cosas, sube el peso
                        del trazo —que en tinta se pierde— e impone negro sobre blanco.
                    </p>

                    {eink && (
                        <Group
                            label="Limpiar la pantalla"
                            hint="En tinta electrónica el texto va dejando rastro de las páginas
                                  anteriores. Un parpadeo cada tantas páginas la deja limpia."
                        >
                            <div className="segmented">
                                {REFRESH_INTERVALS.map((value) => (
                                    <button
                                        key={value}
                                        type="button"
                                        className={refreshEvery === value ? 'on' : ''}
                                        onClick={() => onChangeRefreshEvery(value)}
                                        aria-label={intervalLabel(value)}
                                    >
                                        {value === 0 ? 'Nunca' : value}
                                    </button>
                                ))}
                            </div>
                            <button type="button" className="btn btn-block" onClick={onFlashNow}>
                                Limpiar ahora
                            </button>
                        </Group>
                    )}
                </>
            ),
        },
    };

    return (
        <Sheet title="Pantalla" onClose={onClose} pages={pages}>
            {({ openPage }) => (
                <>
                    {/* ── Brillo ──────────────────────────────────────────────
                        Baja aquí desde la barra de arriba, que tenía seis iconos
                        del mismo peso y no se distinguía ninguno. Este es el sitio
                        que le corresponde: lo que cambia el aspecto de la página
                        está todo junto, y cuando cambia la luz de la habitación se
                        toca esto y el tema en el mismo gesto.

                        Son dos controles y no uno porque atenuar y quitar azul no
                        se usan en el mismo momento: atenuar baja por debajo del
                        mínimo del sistema para leer a oscuras, y el filtro cálido
                        quita el componente azul, que es lo que molesta de
                        madrugada aunque el brillo ya esté bajo. */}
                    <Group label="Brillo">
                        <div className="slider-row">
                            <IconSun size={17} />
                            <input
                                type="range"
                                min={0}
                                max={72}
                                value={Math.round((dim || 0) * 100)}
                                onChange={(event) => onChangeDim(Number(event.target.value) / 100)}
                                aria-label="Atenuar la pantalla"
                            />
                            <span className="slider-val">
                                {Math.round(((dim || 0) / 0.72) * 100)}%
                            </span>
                        </div>
                        <div className="slider-row">
                            <input
                                type="range"
                                min={0}
                                max={100}
                                value={Math.round((warm || 0) * 100)}
                                onChange={(event) => onChangeWarm(Number(event.target.value) / 100)}
                                aria-label="Filtro cálido"
                            />
                            <span className="slider-val">{Math.round((warm || 0) * 100)}%</span>
                        </div>
                    </Group>

                    {/* El tema: con texto de libro en cada muestra, porque lo que
                        se elige es cómo se verá una página. */}
                    <Group label="Tema">
                        <div className="theme-grid">
                            {Object.entries(READER_THEMES)
                                // El tema e-ink no se ofrece aquí: lo impone su
                                // modo, y elegirlo a mano dejaría la interfaz sin
                                // los demás ajustes que ese modo necesita.
                                .filter(([id]) => id !== 'eink')
                                .map(([id, option]) => (
                                    <button
                                        key={id}
                                        type="button"
                                        className={`theme-card${theme === id && !themeLocked ? ' on' : ''}`}
                                        style={{ background: option.bg, color: option.text }}
                                        onClick={() => onChangeTheme(id)}
                                        disabled={themeLocked}
                                        aria-pressed={theme === id}
                                    >
                                        <span className="theme-card-name">{option.label}</span>
                                        <span className="theme-card-text">{SWATCH_TEXT}</span>
                                    </button>
                                ))}
                        </div>
                        {themeLocked && (
                            <p className="option-desc">
                                El modo tinta electrónica impone negro sobre blanco.
                            </p>
                        )}
                    </Group>

                    {/* Modo de lectura y paso de página, al primer nivel.
                        
                        Estaban detrás de la fila «Paginación», así que cambiar de
                        páginas a desplazamiento eran cinco toques: abrir el
                        chrome, esta hoja, la subpágina, elegir y cerrar. Son los
                        dos ajustes que más se tocan de toda la hoja y ahora se ven
                        al abrirla. Detrás de la fila se quedan las columnas, que
                        se eligen una vez y no se vuelven a mirar. */}
                    <Segmented
                        label="Modo de lectura"
                        value={flow === 'scrolled' ? 'scrolled' : 'paginated'}
                        options={[
                            { value: 'paginated', label: 'Páginas' },
                            { value: 'scrolled', label: 'Desplazamiento' },
                        ]}
                        onChange={onChangeFlow}
                    />

                    {flow !== 'scrolled' && (
                        <Segmented
                            label="Al pasar página"
                            value={transition}
                            options={Object.entries(PAGE_TRANSITIONS)
                                .map(([id, spec]) => ({ value: id, label: spec.label }))}
                            onChange={onChangeTransition}
                            hint={PAGE_TRANSITIONS[transition]?.description}
                        />
                    )}

                    <div className="rows">
                        <Row
                            icon={<IconColumns size={18} />}
                            label="Columnas"
                            hint="Cuántas caben en horizontal"
                            value={columns === 2 ? '2 columnas' : 'Una columna'}
                            onClick={() => openPage('paging')}
                        />
                        <Row
                            icon={<IconRotate size={18} />}
                            label="Gestos"
                            hint="Qué hace cada zona de la pantalla"
                            onClick={() => openPage('gestures')}
                        />
                        <Row
                            icon={<IconRuler size={18} />}
                            label="Ayudas de lectura"
                            hint="Regla, filtro cálido, avance automático"
                            value={ruler !== 'off' ? RULER_MODES[ruler]?.label : null}
                            onClick={() => openPage('aids')}
                        />
                        <Row
                            icon={<IconEink size={18} />}
                            label="Tinta electrónica"
                            hint="Para lectores de e-ink"
                            value={eink ? 'Activado' : null}
                            onClick={() => openPage('eink')}
                        />
                    </div>
                </>
            )}
        </Sheet>
    );
}
