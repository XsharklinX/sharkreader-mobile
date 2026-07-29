import React from 'react';
import Sheet, { Row, Group, Segmented } from '../ui/Sheet.jsx';
import Switch from '../ui/Switch.jsx';
import { READER_THEMES } from './typography.js';
import { PAGE_TRANSITIONS } from './transitions.js';
import { AUTOSCROLL_SPEEDS } from './useAutoScroll.js';
import { SPREAD_MODES } from './spread.js';
import { RULER_MODES } from './ruler.js';
import { REFRESH_INTERVALS, intervalLabel } from './einkRefresh.js';
import { ORIENTATION_MODES } from '../adapters/ScreenOrientation.js';
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
 * Ahora hay dos niveles. Arriba **el tema y el brillo**, que son el motivo por
 * el que se abre esta hoja el 90 % de las veces. Debajo, cuatro filas que llevan
 * a lo demás. El reparto no es por parentesco técnico sino por momento de uso:
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
    flow, onChangeFlow,
    transition, onChangeTransition,
    dim, onChangeDim,
    warm, onChangeWarm,
    spread, onChangeSpread, columns,
    orientation, onChangeOrientation,
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
            title: 'Paginación',
            render: () => (
                <>
                    <Segmented
                        label="Modo de lectura"
                        value={flow === 'scrolled' ? 'scrolled' : 'paginated'}
                        options={[
                            { value: 'paginated', label: 'Páginas' },
                            { value: 'scrolled', label: 'Desplazamiento' },
                        ]}
                        onChange={onChangeFlow}
                    />

                    {/* Ni animación ni columnas tienen sentido desplazando: ahí
                        no hay página que pasar ni que repartir. */}
                    {flow !== 'scrolled' && (
                        <>
                            <Group label="Al pasar página">
                                <div className="option-list">
                                    {Object.entries(PAGE_TRANSITIONS).map(([id, option]) => (
                                        <button
                                            key={id}
                                            type="button"
                                            className={`option${transition === id ? ' on' : ''}`}
                                            onClick={() => onChangeTransition(id)}
                                            aria-pressed={transition === id}
                                        >
                                            <span className="option-txt">
                                                <span className="option-name">{option.label}</span>
                                                <span className="option-desc">{option.description}</span>
                                            </span>
                                            <span className="option-mark" aria-hidden="true" />
                                        </button>
                                    ))}
                                </div>
                            </Group>

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
                        </>
                    )}
                </>
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

                    <Segmented
                        label="Orientación"
                        value={orientation || 'auto'}
                        options={Object.entries(ORIENTATION_MODES)
                            .map(([id, option]) => ({ value: id, label: option.label }))}
                        onChange={onChangeOrientation}
                        hint="Bloquearla evita que la página gire al leer tumbado, que es justo
                              cuando el sensor más molesta."
                    />
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

                    {/* Quitar azul es distinto de atenuar: de madrugada lo que
                        molesta es el componente azul, no el brillo. */}
                    <Group
                        label="Filtro cálido"
                        hint="Reduce la luz azul para leer de noche sin forzar la vista."
                    >
                        <div className="slider-row">
                            <input
                                type="range"
                                min={0}
                                max={55}
                                value={Math.round((warm || 0) * 100)}
                                onChange={(event) => onChangeWarm(Number(event.target.value) / 100)}
                                aria-label="Filtro cálido"
                                className="warm-slider"
                            />
                            <span className="slider-val">{Math.round((warm / 0.55) * 100)}%</span>
                        </div>
                    </Group>

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
                    {/* El tema primero: es el motivo por el que se abre esta hoja
                        casi siempre. Con texto de libro en cada muestra, porque
                        lo que se elige es cómo se verá una página. */}
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

                    <Group
                        label="Brillo"
                        hint="Baja por debajo del mínimo del sistema. También se ajusta deslizando
                              por el borde izquierdo mientras lees."
                    >
                        <div className="slider-row">
                            <IconSun size={16} />
                            <input
                                type="range"
                                min={0}
                                max={72}
                                value={Math.round(dim * 100)}
                                onChange={(event) => onChangeDim(Number(event.target.value) / 100)}
                                aria-label="Atenuar la pantalla"
                            />
                            <span className="slider-val">{Math.round((dim / 0.72) * 100)}%</span>
                        </div>
                    </Group>

                    <div className="rows">
                        <Row
                            icon={<IconColumns size={18} />}
                            label="Paginación"
                            hint="Páginas o desplazamiento, animación, columnas"
                            value={flow === 'scrolled'
                                ? 'Desplazamiento'
                                : columns === 2 ? '2 columnas' : PAGE_TRANSITIONS[transition]?.label}
                            onClick={() => openPage('paging')}
                        />
                        <Row
                            icon={<IconRotate size={18} />}
                            label="Gestos y orientación"
                            hint="Nueve zonas, bloqueo de giro"
                            value={orientation !== 'auto' ? ORIENTATION_MODES[orientation]?.label : null}
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
