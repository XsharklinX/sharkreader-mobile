import React, { useMemo } from 'react';
import BookCard from './BookCard.jsx';

/**
 * Biblioteca como estante.
 *
 * ## Qué añade sobre la rejilla
 *
 * Una rejilla de portadas es eficiente y aprovecha la pantalla, pero es una
 * cuadrícula: todas las portadas del mismo tamaño, flotando sobre un fondo. Un
 * estante hace otra cosa — le da a la colección **peso físico**. Se ve cuántos
 * libros hay como se ve en una estantería de verdad, de un vistazo y sin contar.
 *
 * Y hay un motivo práctico además del gusto: en el estante las portadas se
 * apoyan en una base, así que el ojo tiene una línea de referencia. En la
 * rejilla, con portadas de proporciones distintas —los EPUB traen de todo— los
 * bordes inferiores quedan a alturas distintas y la cuadrícula se ve desigual
 * aunque las celdas midan lo mismo.
 *
 * ## Cómo se reparte
 *
 * Filas fijas de tres o cuatro según el ancho, no `auto-fill`. Un estante con un
 * hueco vacío a la derecha se ve mal —una estantería real no tiene medio anaquel
 * suelto— así que la última fila se rellena con separadores en lugar de dejar el
 * anaquel a medias.
 */

/** Libros por anaquel según el ancho disponible. */
export const shelfColumns = (width) => {
    if (width >= 900) return 6;
    if (width >= 600) return 5;
    // Tres en un móvil: con cuatro, la portada baja de los 80 px y el título de
    // la cubierta deja de leerse, que es medio sentido de una portada.
    return width >= 420 ? 4 : 3;
};

/** Reparte los libros en anaqueles del tamaño dado. */
export const intoShelves = (books, perShelf) => {
    if (perShelf <= 0) return [];
    const shelves = [];
    for (let index = 0; index < books.length; index += perShelf) {
        shelves.push(books.slice(index, index + perShelf));
    }
    return shelves;
};

export default function Bookshelf({ books, width = 0, onOpen, onLongPress }) {
    const perShelf = shelfColumns(width || 390);
    const shelves = useMemo(() => intoShelves(books, perShelf), [books, perShelf]);

    return (
        <div className="shelves">
            {shelves.map((shelf, index) => (
                <div className="shelf" key={index}>
                    <div className="shelf-books" style={{ '--per-shelf': perShelf }}>
                        {shelf.map((book) => (
                            <BookCard
                                key={book.id}
                                book={book}
                                onOpen={onOpen}
                                onLongPress={onLongPress}
                            />
                        ))}

                        {/* Huecos para que el último anaquel no quede a medias.
                            Van vacíos y sin interacción: solo mantienen el ancho
                            de las portadas igual que en los anaqueles llenos, en
                            lugar de dejar que se estiren. */}
                        {shelf.length < perShelf && Array.from(
                            { length: perShelf - shelf.length },
                            (_, gap) => <span className="shelf-gap" key={`gap-${gap}`} aria-hidden="true" />
                        )}
                    </div>

                    {/* La tabla del anaquel. Es lo que da la línea de apoyo: sin
                        ella las portadas flotan y vuelve a ser una rejilla. */}
                    <div className="shelf-board" aria-hidden="true" />
                </div>
            ))}
        </div>
    );
}
