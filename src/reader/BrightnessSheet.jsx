import React from 'react';
import Sheet, { Group } from '../ui/Sheet.jsx';
import { IconSun } from '../ui/icons.jsx';

/**
 * Brillo y temperatura de la pantalla.
 *
 * ## Por qué ya no está en el borde
 *
 * Antes se ajustaba arrastrando por una franja invisible del borde izquierdo.
 * Tres problemas, y los tres eran el mismo: **nadie sabía que existía.** No se
 * veía, no había forma de descubrirla, y encima el gesto de pasar página también
 * empezaba ahí, así que arrastrar en esa zona hacía dos cosas a la vez.
 *
 * Un ajuste que se toca a diario tiene que tener un botón. Está arriba, al lado
 * del índice, y es la primera hoja que sale con las dos cosas que se cambian
 * cuando cambia la luz de la habitación.
 *
 * ## Por qué son dos controles y no uno
 *
 * Atenuar y quitar azul no son lo mismo y no se usan en el mismo momento.
 * Atenuar baja el brillo por debajo del mínimo del sistema, para leer a oscuras.
 * El filtro cálido quita el componente azul, que es lo que molesta de madrugada
 * aunque el brillo ya esté bajo. Juntarlos en un deslizador obligaría a aceptar
 * una mezcla que casi nunca es la que hace falta.
 */
export default function BrightnessSheet({ dim, onChangeDim, warm, onChangeWarm, onClose }) {
    return (
        <Sheet title="Brillo" onClose={onClose}>
            {() => (
                <>
                    <Group
                        label="Atenuar"
                        hint="Baja por debajo del mínimo del sistema, para leer a oscuras sin
                              que la pantalla deslumbre."
                    >
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
                    </Group>

                    <Group
                        label="Filtro cálido"
                        hint="Quita luz azul. De madrugada es lo que molesta, no el brillo."
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
                            <span className="slider-val">
                                {Math.round(((warm || 0) / 0.55) * 100)}%
                            </span>
                        </div>
                    </Group>

                    {/* Atajo para volver a cero de un toque: llegar al extremo
                        izquierdo de dos deslizadores con el pulgar es incómodo, y
                        es lo que se quiere al salir a la calle. */}
                    {((dim || 0) > 0 || (warm || 0) > 0) && (
                        <button
                            type="button"
                            className="btn btn-block"
                            onClick={() => { onChangeDim(0); onChangeWarm(0); }}
                        >
                            Quitar los dos filtros
                        </button>
                    )}
                </>
            )}
        </Sheet>
    );
}
