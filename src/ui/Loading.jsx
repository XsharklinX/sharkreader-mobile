import React from 'react';

/**
 * Estado de carga.
 *
 * ## Por qué no hay ningún icono
 *
 * Antes había un emoji de libro de 34 px centrado en la pantalla con un texto
 * debajo. Dos problemas:
 *
 *  1. **Un emoji no es un elemento de diseño.** Lo dibuja el sistema con su
 *     propio estilo, peso y color, así que no se parece a nada del resto de la
 *     app. Es exactamente el motivo por el que los iconos de SharkReader son SVG
 *     propios.
 *  2. **Un icono grande y centrado promete más espera de la que hay.** Ese patrón
 *     es de las pantallas de bienvenida, que duran varios segundos. Aquí son uno
 *     o dos: al aparecer y desaparecer tan rápido se lee como un parpadeo.
 *
 * Lo que hay ahora es un **esqueleto de lo que va a aparecer**: barras del tamaño
 * y en el sitio del contenido real. Se entiende sin leer nada, no promete una
 * espera larga y cuando el contenido llega no hay salto de maquetación, porque lo
 * que había ocupaba ya su sitio.
 *
 * El movimiento es un barrido suave, no un giro: un indicador que gira dice «hay
 * un proceso»; un barrido sobre la forma del contenido dice «esto se está
 * llenando», que es lo que pasa.
 */

/**
 * @param {Object} props
 * @param {'library'|'reader'} [props.kind]  Qué forma imita.
 * @param {string} [props.label]  Para lectores de pantalla. No se dibuja.
 */
export default function Loading({ kind = 'library', label = 'Cargando' }) {
    if (kind === 'reader') {
        return (
            <div className="skeleton reader-skeleton" role="status" aria-label={label}>
                {/* Las líneas imitan un párrafo: anchos desiguales y la última
                    corta, como acaba un párrafo de verdad. Con todas iguales
                    parece una tabla. */}
                {[96, 100, 92, 98, 88, 100, 94, 62].map((width, index) => (
                    <span key={index} className="sk-line" style={{ width: `${width}%` }} />
                ))}
                <span className="sk-gap" />
                {[100, 94, 98, 90, 100, 71].map((width, index) => (
                    <span key={`b${index}`} className="sk-line" style={{ width: `${width}%` }} />
                ))}
            </div>
        );
    }

    return (
        <div className="skeleton library-skeleton" role="status" aria-label={label}>
            <span className="sk-head" />
            <div className="sk-grid">
                {Array.from({ length: 6 }, (_, index) => (
                    <span key={index} className="sk-cover" />
                ))}
            </div>
        </div>
    );
}
