import React, { useState } from 'react';
import { accionesPara } from './selection.js';
import { IconClose, IconCheck, IconStar, IconTrash, IconBook } from '../ui/icons.jsx';

/**
 * La barra que sustituye a la cabecera mientras hay libros marcados.
 *
 * ## Por qué sustituye en vez de aparecer debajo
 *
 * Porque el modo selección cambia lo que hace tocar una portada. Si la cabecera
 * normal siguiera ahí, la pantalla parecería la de siempre y el toque haría algo
 * distinto de lo que se espera. Cambiar la barra entera es lo que dice «ahora esto
 * funciona de otra manera».
 *
 * ## La ficha, cuando hay uno solo
 *
 * La pulsación larga abría la ficha del libro y ahora entra en selección, así que
 * la ficha se quedó sin puerta. Vuelve aquí, pero **solo con un libro marcado**:
 * es la única situación en la que «ver información» significa algo — con ocho
 * elegidos no hay una ficha que enseñar.
 *
 * Y encaja con el gesto: mantener pulsado deja ese libro marcado, y el botón de
 * información aparece justo encima. Son los mismos dos toques de antes.
 *
 * ## El borrado pide confirmación aquí mismo
 *
 * Y no en un diálogo del sistema: el número de libros que se van a borrar tiene
 * que estar delante en el momento de confirmar. Un «¿Seguro?» sin la cifra es
 * exactamente cómo se borran veinte libros queriendo borrar dos.
 */
export default function SelectionBar({ libros, onAccion, onBorrar, onTodo, onFicha, onCerrar }) {
    const [confirmando, setConfirmando] = useState(false);
    const acciones = accionesPara(libros);
    const total = libros.length;

    if (confirmando) {
        return (
            <div className="sel-bar peligro">
                <span className="sel-txt">
                    ¿Borrar {total} {total === 1 ? 'libro' : 'libros'}?
                    <b>No se puede deshacer</b>
                </span>
                <button type="button" className="btn" onClick={() => setConfirmando(false)}>
                    Cancelar
                </button>
                <button type="button" className="btn btn-danger" onClick={onBorrar}>
                    Borrar
                </button>
            </div>
        );
    }

    return (
        <div className="sel-bar">
            <button type="button" className="icon-btn" onClick={onCerrar} aria-label="Salir de la selección">
                <IconClose size={20} />
            </button>

            <button type="button" className="sel-txt" onClick={onTodo}>
                {total} {total === 1 ? 'seleccionado' : 'seleccionados'}
                <b>Tocar para marcar todo</b>
            </button>

            {/* Solo con uno marcado: con ocho elegidos no hay una ficha que
                enseñar, y un botón que a veces no hace nada es peor que uno que
                aparece cuando sirve. */}
            {total === 1 && (
                <button
                    type="button"
                    className="icon-btn"
                    onClick={() => onFicha?.(libros[0])}
                    aria-label={`Información de ${libros[0].name}`}
                    title="Información"
                >
                    <IconBook size={20} />
                </button>
            )}

            <button
                type="button"
                className="icon-btn"
                onClick={() => onAccion('terminar')}
                aria-label={acciones.terminar.label}
                title={acciones.terminar.label}
            >
                <IconCheck size={20} />
            </button>
            <button
                type="button"
                className="icon-btn"
                onClick={() => onAccion('favorito')}
                aria-label={acciones.favorito.label}
                title={acciones.favorito.label}
            >
                <IconStar size={20} filled={!acciones.favorito.marcar} />
            </button>
            <button
                type="button"
                className="icon-btn danger"
                onClick={() => setConfirmando(true)}
                aria-label={`Borrar ${total} libros`}
            >
                <IconTrash size={20} />
            </button>
        </div>
    );
}
