import React from 'react';
import { READER_THEMES } from './typography.js';
import { PAGE_TRANSITIONS } from './transitions.js';
import { AUTOSCROLL_SPEEDS } from './useAutoScroll.js';
import { IconSun } from '../ui/icons.jsx';

/**
 * Ajustes de pantalla y de lectura.
 *
 * Va aparte del botón «Aa» a propósito: bajo la Aa solo debe haber cosas del
 * texto —fuente, tamaño, espaciado—. El tema, el modo de paginación, la
 * animación al pasar página y el brillo no son tipografía, y meterlo todo en el
 * mismo sitio obligaba a bajar por una lista larguísima para cambiar algo tan
 * frecuente como el fondo.
 */
export default function DisplaySheet({
    theme, onChangeTheme,
    flow, onChangeFlow,
    transition, onChangeTransition,
    dim, onChangeDim,
    autoScroll,
    onClose,
}) {
    return (
        <div className="scrim" onClick={onClose} role="presentation">
            <section
                className="sheet"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-label="Pantalla y lectura"
            >
                <span className="grip" aria-hidden="true" />

                <div className="setting">
                    <span className="setting-label">Tema</span>
                    <div className="themes">
                        {Object.entries(READER_THEMES).map(([id, option]) => (
                            <div className="theme-item" key={id}>
                                <button
                                    type="button"
                                    className={`theme-swatch${theme === id ? ' on' : ''}`}
                                    style={{ background: option.bg, color: option.text }}
                                    onClick={() => onChangeTheme(id)}
                                    aria-label={option.label}
                                    aria-pressed={theme === id}
                                >
                                    Aa
                                </button>
                                <span className="theme-name">{option.label}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="setting">
                    <span className="setting-label">Modo de lectura</span>
                    <div className="segmented">
                        <button
                            type="button"
                            className={flow !== 'scrolled' ? 'on' : ''}
                            onClick={() => onChangeFlow('paginated')}
                        >
                            Páginas
                        </button>
                        <button
                            type="button"
                            className={flow === 'scrolled' ? 'on' : ''}
                            onClick={() => onChangeFlow('scrolled')}
                        >
                            Desplazamiento
                        </button>
                    </div>
                </div>

                {/* La animación no tiene sentido en modo desplazamiento: ahí no
                    se pasa página, se desplaza. */}
                {flow !== 'scrolled' && (
                    <div className="setting">
                        <span className="setting-label">Al pasar página</span>
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
                    </div>
                )}

                <div className="setting">
                    <span className="setting-label">
                        <span><IconSun size={15} style={{ verticalAlign: -3, marginRight: 5 }} />Atenuar pantalla</span>
                        <span className="setting-value">{Math.round((dim / 0.72) * 100)}%</span>
                    </span>
                    <input
                        type="range"
                        min={0}
                        max={72}
                        value={Math.round(dim * 100)}
                        onChange={(event) => onChangeDim(Number(event.target.value) / 100)}
                        aria-label="Atenuar la pantalla"
                    />
                    <p className="option-desc">
                        Baja el brillo por debajo del mínimo del sistema. También se
                        ajusta deslizando por el borde izquierdo mientras lees.
                    </p>
                </div>

                {autoScroll && (
                    <div className="setting">
                        <span className="setting-label">
                            Avance automático
                            <span className="setting-value">{autoScroll.secondsPerPage} s por página</span>
                        </span>
                        <div className="stepper">
                            <button
                                type="button"
                                onClick={autoScroll.slower}
                                disabled={!autoScroll.canGoSlower}
                                aria-label="Más lento"
                            >
                                <span style={{ fontSize: 17, fontWeight: 600 }}>−</span>
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
                                <span style={{ fontSize: 17, fontWeight: 600 }}>+</span>
                            </button>
                        </div>
                        <button
                            type="button"
                            className={`btn btn-block${autoScroll.running ? '' : ' btn-primary'}`}
                            onClick={autoScroll.toggle}
                        >
                            {autoScroll.running ? 'Detener el avance' : 'Empezar avance automático'}
                        </button>
                    </div>
                )}

                <button type="button" className="btn btn-primary btn-block" onClick={onClose}>
                    Listo
                </button>
            </section>
        </div>
    );
}
