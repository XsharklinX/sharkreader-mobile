import React from 'react';

/**
 * Juego de iconos de SharkReader Mobile.
 *
 * Todos comparten rejilla de 24, trazo de 1.75, extremos y uniones redondeados.
 * Esa consistencia es justo lo que no puede dar un emoji: cada emoji lo dibuja
 * el sistema con su propio peso, color y estilo, y nunca forman un conjunto.
 *
 * Sin dependencias: son componentes, igual que `icons.jsx` en el escritorio.
 * `currentColor` hereda el color del contexto, así que un icono dentro de un
 * botón activo se tiñe solo.
 */

const Svg = ({ size = 24, children, ...rest }) => (
    <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        {...rest}
    >
        {children}
    </svg>
);

// ── Navegación ───────────────────────────────────────────────────────────────
export const IconLibrary = (p) => (
    <Svg {...p}>
        <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10v16H5.5A1.5 1.5 0 0 1 4 18.5z" />
        <path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14z" />
        <path d="M10 12h4" />
    </Svg>
);

export const IconChart = (p) => (
    <Svg {...p}>
        <path d="M4 20V11M10 20V4M16 20v-6M22 20H2" />
    </Svg>
);

/**
 * Rueda dentada de verdad.
 *
 * La versión anterior era un círculo con ocho rayos rectos, que es exactamente
 * como se dibuja un sol: nadie la leía como «ajustes». Aquí los dientes son
 * trapecios unidos al aro, que es lo que distingue un engranaje.
 */
export const IconSettings = (p) => (
    <Svg {...p}>
        <path d="M10.3 3.2h3.4l.35 2.2a6.9 6.9 0 0 1 1.72 1l2.03-.87 1.7 2.94-1.68 1.45a7 7 0 0 1 0 2l1.68 1.45-1.7 2.94-2.03-.87a6.9 6.9 0 0 1-1.72 1l-.35 2.2h-3.4l-.35-2.2a6.9 6.9 0 0 1-1.72-1l-2.03.87-1.7-2.94 1.68-1.45a7 7 0 0 1 0-2L4.5 8.47l1.7-2.94 2.03.87a6.9 6.9 0 0 1 1.72-1z" />
        <circle cx="12" cy="12" r="2.6" />
    </Svg>
);

// ── Acciones del lector ──────────────────────────────────────────────────────
export const IconArrowLeft = (p) => (
    <Svg {...p}><path d="M19 12H5M11 18l-6-6 6-6" /></Svg>
);

export const IconTextSize = (p) => (
    <Svg {...p}>
        <path d="M3 18 7.5 6l4.5 12M4.4 14.4h6.2" />
        <path d="M14 18l3.4-8.5L20.8 18M15 15.4h4.8" />
    </Svg>
);

export const IconList = (p) => (
    <Svg {...p}><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" /></Svg>
);

export const IconSearch = (p) => (
    <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.6-3.6" /></Svg>
);

export const IconBookmark = ({ filled, ...p }) => (
    <Svg {...p}>
        <path d="M6 3.8h12a.8.8 0 0 1 .8.8v15.6L12 16.4l-6.8 3.8V4.6a.8.8 0 0 1 .8-.8z" fill={filled ? 'currentColor' : 'none'} />
    </Svg>
);

export const IconHighlight = (p) => (
    <Svg {...p}>
        <path d="M14.5 3.5 20.5 9.5 10 20H4v-6z" />
        <path d="M12.5 5.5 18.5 11.5" />
        <path d="M3 21h18" />
    </Svg>
);

export const IconSun = (p) => (
    <Svg {...p}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M22 12h-2M4 12H2M18.4 5.6l-1.4 1.4M7 17l-1.4 1.4M18.4 18.4 17 17M7 7 5.6 5.6" />
    </Svg>
);

export const IconVolume = (p) => (
    <Svg {...p}>
        <path d="M4 15V9h3.5L12 4.5v15L7.5 15z" />
        <path d="M16 9.5a4 4 0 0 1 0 5M18.8 7a7.5 7.5 0 0 1 0 10" />
    </Svg>
);

// ── Biblioteca ───────────────────────────────────────────────────────────────
export const IconPlus = (p) => (
    <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>
);

export const IconSort = (p) => (
    <Svg {...p}><path d="M7 4v16M7 20l-3-3M7 4l3 3M17 20V4M17 4l-3 3M17 20l3-3" /></Svg>
);

export const IconStar = ({ filled, ...p }) => (
    <Svg {...p}>
        <path
            d="M12 4.2l2.5 5.1 5.6.8-4 3.9 1 5.6-5.1-2.7-5.1 2.7 1-5.6-4-3.9 5.6-.8z"
            fill={filled ? 'currentColor' : 'none'}
        />
    </Svg>
);

export const IconCheck = (p) => (
    <Svg {...p}><path d="M20 6.5 9.5 17 4 11.5" /></Svg>
);

export const IconTrash = (p) => (
    <Svg {...p}>
        <path d="M4 7h16M10 4h4a1 1 0 0 1 1 1v2H9V5a1 1 0 0 1 1-1z" />
        <path d="M6.5 7l.8 12.1a1 1 0 0 0 1 .9h7.4a1 1 0 0 0 1-.9L17.5 7" />
        <path d="M10.5 11v5M13.5 11v5" />
    </Svg>
);

export const IconShare = (p) => (
    <Svg {...p}>
        <path d="M12 15V3M12 3 8.5 6.5M12 3l3.5 3.5" />
        <path d="M4 15v3.5A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V15" />
    </Svg>
);

export const IconClose = (p) => (
    <Svg {...p}><path d="M18 6 6 18M6 6l12 12" /></Svg>
);

export const IconChevronRight = (p) => (
    <Svg {...p}><path d="m9 5 7 7-7 7" /></Svg>
);

export const IconFlame = (p) => (
    <Svg {...p}>
        <path d="M12 3c.6 3 2.4 4 3.8 5.7A6.9 6.9 0 0 1 17.5 13a5.5 5.5 0 0 1-11 0c0-1.7.7-3 1.6-4.1.3 1 .9 1.6 1.7 1.9C9.3 8.2 10.4 5.6 12 3z" />
    </Svg>
);

export const IconTrophy = (p) => (
    <Svg {...p}>
        <path d="M8 4h8v5a4 4 0 0 1-8 0z" />
        <path d="M8 5.5H5.5A1.5 1.5 0 0 0 4 7c0 2 1.6 3.5 4 3.7M16 5.5h2.5A1.5 1.5 0 0 1 20 7c0 2-1.6 3.5-4 3.7" />
        <path d="M12 13v4M9 20h6M10 17h4" />
    </Svg>
);

export const IconClock = (p) => (
    <Svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 1.8" /></Svg>
);

export const IconBook = (p) => (
    <Svg {...p}>
        <path d="M4 4.8A1.8 1.8 0 0 1 5.8 3H11v17H5.8A1.8 1.8 0 0 1 4 18.2z" />
        <path d="M20 4.8A1.8 1.8 0 0 0 18.2 3H13v17h5.2a1.8 1.8 0 0 0 1.8-1.8z" />
    </Svg>
);

export const IconFolder = (p) => (
    <Svg {...p}>
        <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h7A1.5 1.5 0 0 1 19 10v7.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 3 17.5z" />
    </Svg>
);

export const IconBell = (p) => (
    <Svg {...p}>
        <path d="M18 9a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16S18 14 18 9z" />
        <path d="M10.3 19a2 2 0 0 0 3.4 0" />
    </Svg>
);

export const IconGrid = (p) => (
    <Svg {...p}>
        <rect x="3.5" y="3.5" width="7" height="7" rx="1.4" />
        <rect x="13.5" y="3.5" width="7" height="7" rx="1.4" />
        <rect x="3.5" y="13.5" width="7" height="7" rx="1.4" />
        <rect x="13.5" y="13.5" width="7" height="7" rx="1.4" />
    </Svg>
);

// ── Lector: composición y orientación ────────────────────────────────────────
// El icono de columnas dibuja una página con dos bloques de texto en vez de dos
// rectángulos sueltos: lo que se está eligiendo es cómo se compone la página,
// no cómo se reparte la pantalla.
export const IconColumns = (p) => (
    <Svg {...p}>
        <rect x="3" y="4" width="18" height="16" rx="1.6" />
        <path d="M12 4v16" />
        <path d="M6 8.5h3M6 11.5h3M6 14.5h2" />
        <path d="M15 8.5h3M15 11.5h3M15 14.5h2" />
    </Svg>
);

export const IconRotate = (p) => (
    <Svg {...p}>
        <rect x="4" y="8.5" width="16" height="11" rx="1.6" />
        <path d="M8.5 5.5a6 6 0 0 1 8.4 1.2" />
        <path d="M17.5 3.6v3.3h-3.3" />
    </Svg>
);

export const IconGoTo = (p) => (
    <Svg {...p}>
        <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z" />
        <path d="M8.5 12h7" />
        <path d="M12.8 9.2 15.6 12l-2.8 2.8" />
    </Svg>
);

export const IconQuote = (p) => (
    <Svg {...p}>
        <path d="M9.5 6.5C7 7.6 5.5 9.8 5.5 12.4v5.1h5.2v-5.2H8.2c0-1.9.8-3.3 2.4-4.2z" />
        <path d="M18.3 6.5c-2.5 1.1-4 3.3-4 5.9v5.1h5.2v-5.2H17c0-1.9.8-3.3 2.4-4.2z" />
    </Svg>
);

export const IconLock = (p) => (
    <Svg {...p}>
        <rect x="4.5" y="10.5" width="15" height="9.5" rx="2" />
        <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" />
        <path d="M12 14.3v2.2" />
    </Svg>
);

export const IconDownload = (p) => (
    <Svg {...p}>
        <path d="M12 4v10.5" />
        <path d="M8 11l4 4 4-4" />
        <path d="M4.5 17.5v1.2A1.3 1.3 0 0 0 5.8 20h12.4a1.3 1.3 0 0 0 1.3-1.3v-1.2" />
    </Svg>
);

export const IconCloud = (p) => (
    <Svg {...p}>
        <path d="M7 18.5h9.8a3.7 3.7 0 0 0 .5-7.4 5.5 5.5 0 0 0-10.5-1.3A4.1 4.1 0 0 0 7 18.5z" />
    </Svg>
);

export const IconEink = (p) => (
    <Svg {...p}>
        <rect x="4" y="3.5" width="16" height="17" rx="2" />
        <path d="M8 8h8M8 12h8M8 16h5" />
    </Svg>
);

// La regla de lectura: la banda que ilumina el renglón, no un objeto de medir.
// Un icono de escuadra habría prometido otra función.
export const IconRuler = (p) => (
    <Svg {...p}>
        <path d="M4 7.5h16M4 16.5h16" />
        <rect x="2.6" y="10.3" width="18.8" height="3.4" rx="1.2" />
    </Svg>
);

/**
 * Menú principal. Tres rayas, la de abajo más corta.
 *
 * El acortado no es decoración: distingue el menú de un icono de lista, que en
 * esta app existe y abre el índice del libro. Con tres rayas iguales los dos
 * iconos son el mismo dibujo.
 */
/**
 * Tres líneas iguales y con más cuerpo que el resto del juego.
 *
 * Las tenía desiguales —la última más corta— y al trazo fino de 1.75 de los demás
 * iconos. Eso lo dejaba en un garabato débil justo al lado de la marca, que va en
 * serif y con peso 700: el contraste de pesos era lo que hacía que la barra
 * pareciera montada con piezas de dos sitios distintos. Iguales y a trazo 2
 * aguantan la mirada al lado del nombre.
 */
export const IconMenu = (p) => (
    <Svg {...p} strokeWidth="2">
        <path d="M4 7h16M4 12h16M4 17h16" />
    </Svg>
);

/**
 * Los iconos de las cuatro vistas de la biblioteca.
 *
 * Van juntos y en un solo componente porque solo tienen sentido como conjunto: lo
 * que hace que se entiendan no es cada dibujo, es que se vean como cuatro maneras
 * de repartir el mismo espacio. Dibujados por separado, cada uno acabaría con su
 * propio grosor y su propio margen.
 */
export const IconView = ({ id, size = 17 }) => {
    if (id === 'compact') {
        return (
            <Svg size={size}>
                <path d="M4 4h4v6H4zM10 4h4v6h-4zM16 4h4v6h-4zM4 14h4v6H4zM10 14h4v6h-4zM16 14h4v6h-4z" fill="currentColor" stroke="none" />
            </Svg>
        );
    }

    if (id === 'list') {
        return (
            <Svg size={size}>
                <path d="M4 6h3v4H4zM10 7h10M10 10h6M4 14h3v4H4zM10 15h10M10 18h6" />
            </Svg>
        );
    }

    if (id === 'shelf') {
        return (
            <Svg size={size}>
                <path d="M5 5v7M9 5v7M13 7v5M17 6v6M3 12h18M3 16h18" />
            </Svg>
        );
    }

    // Rejilla: cuatro celdas con hueco para el título debajo de cada una.
    return (
        <Svg size={size}>
            <path d="M4 4h6v7H4zM14 4h6v7h-6zM4 14h6v6H4zM14 14h6v6h-6z" />
        </Svg>
    );
};

/* ── Iconos de la tanda de octubre de 2026 ──────────────────────────────── */

/** Recibir libros por la wifi de casa. */
export const IconWifi = (p) => (
    <Svg {...p}><path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.6 16a5 5 0 0 1 6.8 0" /><circle cx="12" cy="19.2" r="0.9" fill="currentColor" /></Svg>
);

/** Emparejar con el ordenador. */
export const IconLink = (p) => (
    <Svg {...p}><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2" /><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2" /></Svg>
);

/** Traducir: dos alfabetos. */
export const IconTranslate = (p) => (
    <Svg {...p}><path d="M3 5h9M7.5 3v2M5 5c.5 3 2.6 5.6 5.5 7M10 5c-.6 3.4-3 6.4-6.5 8" /><path d="M12.5 21l4-10 4 10M14 17.5h5" /></Svg>
);

/** Personajes del libro. */
export const IconPeople = (p) => (
    <Svg {...p}><circle cx="9" cy="8" r="3.2" /><path d="M3 20c.6-3.6 3-5.6 6-5.6s5.4 2 6 5.6" /><path d="M15.5 4.9a3.2 3.2 0 0 1 0 6.2M17.6 14.6c2 .7 3.1 2.6 3.4 5.4" /></Svg>
);

/** Traer de otra app: una flecha que entra en una caja. */
export const IconImport = (p) => (
    <Svg {...p}><path d="M12 3v11M7.5 9.5 12 14l4.5-4.5" /><path d="M4 14v4.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V14" /></Svg>
);

/** Escribir a mano sobre un PDF: un lápiz. */
export const IconPen = (p) => (
    <Svg {...p}><path d="M15.5 4.5 19.5 8.5 8.5 19.5 4 20l.5-4.5z" /><path d="M13.5 6.5 17.5 10.5" /></Svg>
);

/** Borrar trazos: una goma. */
export const IconEraser = (p) => (
    <Svg {...p}><path d="M9 20h11" /><path d="M4.6 14.6 13.4 5.8a1.5 1.5 0 0 1 2.1 0l3.7 3.7a1.5 1.5 0 0 1 0 2.1L11 19.8H8.8l-4.2-4.2a.7.7 0 0 1 0-1z" /><path d="m9 10 5 5" /></Svg>
);

/** Deshacer: una flecha que vuelve. */
export const IconUndo = (p) => (
    <Svg {...p}><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></Svg>
);
