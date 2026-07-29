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
