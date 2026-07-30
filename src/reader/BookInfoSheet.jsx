import React from 'react';
import Sheet, { Group } from '../ui/Sheet.jsx';
import { normalizeDescription } from '../core/epubMeta.js';

/**
 * Ficha del libro que se está leyendo.
 *
 * Se abre tocando el título en la barra de arriba. Antes ese título no era más
 * que una etiqueta: la sinopsis, el autor completo, la editorial y el idioma solo
 * se podían ver saliendo del libro y buscando la portada en la biblioteca. Y el
 * momento en que uno se pregunta «¿de qué iba esto?» es justo cuando lleva tres
 * días sin abrirlo y acaba de volver — dentro del libro, no fuera.
 *
 * ## Qué se muestra y qué no
 *
 * Solo lo que el EPUB trae de verdad. Un campo vacío no se enseña con un guion:
 * una ficha llena de «—» parece un error de la app, y no lo es — es que ese libro
 * no declara editorial. Si no hay sinopsis se dice, porque no tenerla es
 * información sobre el fichero.
 *
 * La sinopsis va en la serif de lectura, no en la de la interfaz: es texto del
 * libro, no un ajuste.
 */
export default function BookInfoSheet({ book, location, onClose }) {
    const done = Math.round((book.progress || 0) * 100);
    const cover = book.coverUrl || book.coverBase64;

    // Se normaliza también aquí, no solo al importar. Los libros que ya están en
    // la biblioteca se guardaron con la versión anterior, que borraba las
    // etiquetas sin dejar nada en su sitio y no resolvía las entidades: en la
    // ficha se leían `&#160;` sueltos y frases pegadas. Ver `normalizeDescription`.
    const sinopsis = normalizeDescription(book.description);
    const parrafos = sinopsis ? sinopsis.split(/\n{2,}/) : [];

    const datos = [
        ['Autor', book.author],
        ['Editorial', book.publisher],
        ['Idioma', IDIOMAS[book.language] || book.language],
        ['Formato', FORMATOS[book.type] || book.type],
        ['Añadido', fecha(book.dateAdded)],
        ['Empezado', fecha(book.dateStarted)],
        ['Terminado', fecha(book.dateFinished)],
    ].filter(([, valor]) => valor);

    return (
        <Sheet title={book.name} subtitle={book.author || undefined} onClose={onClose}>
            {() => (
                <>
                    <div className="info-top">
                        <span className="info-cover" style={cover ? undefined : { background: book.color }}>
                            {cover && <img src={cover} alt="" />}
                        </span>
                        <div className="info-now">
                            <p className="info-pct"><b>{done}</b> %</p>
                            {location?.chapter && (
                                <p className="info-chapter">{location.chapter}</p>
                            )}
                            {location?.page > 0 && (
                                <p className="info-page mono">
                                    Página {location.page} de {location.totalPages} del capítulo
                                </p>
                            )}
                            <span className="bar thin"><i style={{ width: `${done}%` }} /></span>
                        </div>
                    </div>

                    <Group label="Sinopsis">
                        {parrafos.length > 0 ? (
                            <div className="info-synopsis">
                                {parrafos.map((parrafo, indice) => (
                                    // eslint-disable-next-line react/no-array-index-key
                                    <p key={indice}>{parrafo}</p>
                                ))}
                            </div>
                        ) : (
                            <p className="info-synopsis vacia">
                                Este libro no trae sinopsis en sus metadatos.
                            </p>
                        )}
                    </Group>

                    {datos.length > 0 && (
                        <Group label="Ficha">
                            <dl className="info-datos">
                                {datos.map(([etiqueta, valor]) => (
                                    <React.Fragment key={etiqueta}>
                                        <dt>{etiqueta}</dt>
                                        <dd>{valor}</dd>
                                    </React.Fragment>
                                ))}
                            </dl>
                        </Group>
                    )}
                </>
            )}
        </Sheet>
    );
}

/** Los códigos de idioma de los metadatos, en palabras. */
const IDIOMAS = {
    es: 'Español', 'es-ES': 'Español', 'es-419': 'Español',
    en: 'Inglés', 'en-US': 'Inglés', 'en-GB': 'Inglés',
    fr: 'Francés', pt: 'Portugués', 'pt-BR': 'Portugués', it: 'Italiano',
    de: 'Alemán', ca: 'Catalán', gl: 'Gallego', eu: 'Euskera', ja: 'Japonés',
};

const FORMATOS = { epub: 'EPUB', pdf: 'PDF', comic: 'Cómic', docx: 'Word' };

/** Fecha corta. Devuelve vacío si no hay nada, para que la fila no se pinte. */
const fecha = (valor) => {
    if (!valor) return '';
    const date = new Date(valor);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' });
};
