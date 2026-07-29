import React, { useState, useCallback } from 'react';
import { useBackHandler } from './useBackHandler.js';
import { IconArrowLeft, IconChevronRight } from './icons.jsx';

/**
 * Anatomía común de las hojas del lector.
 *
 * Las cuatro —Texto, Pantalla, Notas, Voz— se abrían igual pero cada una
 * repetía por su cuenta el asa, el título y el cierre, y con el tiempo habían
 * derivado: una tenía botón «Listo» y otra no, una cerraba al tocar fuera y otra
 * no. Aquí vive esa estructura una sola vez.
 *
 * ## Dos niveles
 *
 * La hoja de Pantalla había llegado a once secciones apiladas: cambiar el fondo
 * obligaba a recorrer la lista entera. La solución no es una hoja más larga sino
 * una menos profunda — arriba lo que se toca a diario y el resto detrás de una
 * fila.
 *
 * La subpágina **sustituye** el contenido en lugar de abrir otra hoja encima.
 * Apilar hojas en un móvil deja la de abajo asomando por los bordes y en dos
 * niveles ya no se sabe qué cierra cada cosa.
 */
export default function Sheet({ title, subtitle, children, pages = {}, onClose }) {
    const [page, setPage] = useState(null);
    const open = page ? pages[page] : null;

    // Atrás sube un nivel antes de cerrar. Cerrar de golpe desde una subpágina
    // obliga a volver a entrar para cambiar lo de al lado.
    useBackHandler(() => {
        if (page) { setPage(null); return true; }
        return false;
    });

    const goBack = useCallback(() => setPage(null), []);

    return (
        <div className="scrim" onClick={onClose} role="presentation">
            <section
                className="sheet"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-label={open?.title || title}
            >
                <span className="grip" aria-hidden="true" />

                <header className="sheet-bar">
                    {open ? (
                        <>
                            <button
                                type="button"
                                className="icon-btn"
                                onClick={goBack}
                                aria-label={`Volver a ${title}`}
                            >
                                <IconArrowLeft size={20} />
                            </button>
                            <h2 className="sheet-title">{open.title}</h2>
                        </>
                    ) : (
                        <div className="sheet-titles">
                            <h2 className="sheet-title">{title}</h2>
                            {subtitle && <p className="sheet-sub">{subtitle}</p>}
                        </div>
                    )}
                </header>

                <div className="sheet-body">
                    {open
                        ? open.render({ close: goBack })
                        : children({ openPage: setPage })}
                </div>
            </section>
        </div>
    );
}

/**
 * Fila de ajuste.
 *
 * Tres formas en una porque las tres tienen que verse como hermanas: la que
 * lleva a otro sitio, la que muestra el valor actual y la que se enciende. Con
 * tres componentes distintos acabaron con altos y alineaciones distintos.
 */
export const Row = ({ icon, label, hint, value, onClick, control, danger }) => {
    const Element = onClick ? 'button' : 'div';

    return (
        <Element
            type={onClick ? 'button' : undefined}
            className={`sheet-row${onClick ? ' tappable' : ''}${danger ? ' danger' : ''}`}
            onClick={onClick}
        >
            {icon && <span className="sheet-row-icon">{icon}</span>}
            <span className="sheet-row-txt">
                <span className="sheet-row-label">{label}</span>
                {hint && <span className="sheet-row-hint">{hint}</span>}
            </span>
            {value && <span className="sheet-row-value">{value}</span>}
            {control}
            {onClick && !control && (
                <IconChevronRight size={16} className="sheet-row-chev" />
            )}
        </Element>
    );
};

/** Grupo con etiqueta. La etiqueta es de datos, no un título: va en versalitas. */
export const Group = ({ label, hint, children }) => (
    <div className="sheet-group">
        {label && <span className="sheet-group-label">{label}</span>}
        {children}
        {hint && <p className="option-desc">{hint}</p>}
    </div>
);

/** Segmentado. El control por defecto para elegir entre pocas opciones. */
export const Segmented = ({ label, value, options, onChange, hint }) => (
    <Group label={label} hint={hint}>
        <div className="segmented" role="group" aria-label={label}>
            {options.map((option) => (
                <button
                    key={String(option.value)}
                    type="button"
                    className={value === option.value ? 'on' : ''}
                    onClick={() => onChange(option.value)}
                    aria-pressed={value === option.value}
                >
                    {option.label}
                </button>
            ))}
        </div>
    </Group>
);
