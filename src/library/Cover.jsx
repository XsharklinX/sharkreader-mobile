import React, { useState } from 'react';
import { ajusteDePortada } from './coverFit.js';

/**
 * La portada de un libro.
 *
 * Se saca a su propio componente porque va a aparecer en las cuatro vistas de la
 * biblioteca —rejilla, compacta, lista y estante— además de la ficha y la tarjeta
 * de seguir leyendo. Con la lógica copiada en cada sitio, arreglar el recorte en
 * una dejaba las otras cinco como estaban.
 *
 * ## Dos casos
 *
 * **Con imagen.** Se mide al cargar y se decide si llenar la celda o respetarla,
 * según `ajusteDePortada`. Cuando se respeta quedan bandas, y detrás va la propia
 * cubierta desenfocada: así el hueco pertenece a la imagen en lugar de ser un
 * rectángulo gris.
 *
 * La medida se hace en el `onLoad` y no al importar a propósito. Guardar las
 * proporciones exigiría migrar los libros que ya están —y en una biblioteca de 136
 * eso es abrir 136 ficheros— para conseguir exactamente lo mismo que da leer dos
 * números que el navegador ya tiene.
 *
 * **Sin imagen.** Una cubierta tipográfica de verdad: título en la serif de la
 * app, autor debajo y una regla arriba, sobre el color del libro. No es un hueco
 * de relleno, es lo que hace una editorial cuando reedita un clásico sin arte.
 */
export default function Cover({ book, className = '', children }) {
    const src = book.coverUrl || book.coverBase64;
    const [ajuste, setAjuste] = useState('rellena');

    if (!src) {
        return (
            <span
                className={`cover cover-tipo ${className}`}
                style={{ background: book.color }}
            >
                <span className="cover-regla" aria-hidden="true" />
                <span className="cover-titulo">{book.name}</span>
                {book.author && <span className="cover-autor">{book.author}</span>}
                {children}
            </span>
        );
    }

    return (
        <span className={`cover ${ajuste === 'contiene' ? 'contiene' : ''} ${className}`}>
            {/* El fondo desenfocado solo se monta si hace falta: en una rejilla de
                136 celdas, un desenfoque por cada una sería trabajo de la GPU para
                algo que no se ve en la mayoría. */}
            {ajuste === 'contiene' && (
                <span
                    className="cover-fondo"
                    style={{ backgroundImage: `url(${src})` }}
                    aria-hidden="true"
                />
            )}

            <img
                src={src}
                alt=""
                loading="lazy"
                decoding="async"
                onLoad={(event) => {
                    const { naturalWidth, naturalHeight } = event.currentTarget;
                    setAjuste(ajusteDePortada(naturalWidth, naturalHeight));
                }}
            />

            {children}
        </span>
    );
}
