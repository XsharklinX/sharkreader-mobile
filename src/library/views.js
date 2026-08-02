/**
 * Las cuatro formas de mirar la biblioteca.
 *
 * No son cuatro estilos: son cuatro preguntas distintas. Es la lección de las
 * siete transiciones del lector, donde seis eran la misma con otro número —si dos
 * vistas contestan lo mismo, sobra una.
 *
 * El `hint` es lo que se enseña al elegirla, y está escrito como la pregunta que
 * responde y no como una descripción de lo que dibuja.
 */
export const LIBRARY_VIEWS = {
    grid: {
        label: 'Rejilla',
        hint: 'Portada, título y autor. Para elegir qué leer.',
        columnas: 3,
    },
    compact: {
        label: 'Compacta',
        hint: 'Solo cubiertas, cuatro por fila. Para recorrer mucho, rápido.',
        columnas: 4,
    },
    list: {
        label: 'Lista',
        hint: 'Serie, progreso y tiempo restante. Para saber qué tienes.',
    },
    shelf: {
        label: 'Estante',
        hint: 'Apoyados sobre la tabla, cada uno con su tamaño real.',
    },
};

export const DEFAULT_VIEW = 'grid';

/**
 * Devuelve una vista válida.
 *
 * Las preferencias guardadas traen `grid` o `shelf` de cuando eran las dos únicas,
 * y la densidad compacta vivía aparte en `density`. Sin esto, una biblioteca
 * abierta con la configuración anterior aparecería sin ninguna vista marcada.
 */
export const normalizeView = (view, density) => {
    if (LIBRARY_VIEWS[view]) return view;
    // `density: 'compact'` era el interruptor viejo, y significaba exactamente la
    // vista compacta de ahora.
    if (density === 'compact') return 'compact';
    return DEFAULT_VIEW;
};

/**
 * Con qué encabezado se agrupa cada libro, según el orden elegido.
 *
 * Ordenar bien no basta en una lista de 136: sin marcas, cuarenta filas seguidas
 * obligan a leerlo todo igual para saber dónde estás. Devuelve `null` cuando el
 * orden no admite grupos —por reciente o por progreso, un encabezado sería una
 * raya arbitraria en medio.
 */
export const grupoDe = (libro, orden) => {
    if (!libro) return null;

    if (orden === 'title') return primeraLetra(libro.name);
    if (orden === 'author') return primeraLetra(libro.author);
    if (orden === 'serie') return String(libro.series || '').trim() || 'Sin serie';
    if (orden === 'added') return mesDe(libro.dateAdded);

    return null;
};

const primeraLetra = (texto) => {
    const limpio = String(texto || '').trim();
    if (!limpio) return '—';

    // Sin tildes: «Álvarez» va con la A y no en un grupo propio al final.
    const letra = limpio
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .charAt(0)
        .toUpperCase();

    // Los números y los símbolos juntos: un grupo «1» con un libro y otro «¿» con
    // otro son dos encabezados para dos libros.
    return /[A-Z]/.test(letra) ? letra : '#';
};

const mesDe = (marca) => {
    if (!marca) return 'Sin fecha';
    const fecha = new Date(marca);
    if (Number.isNaN(fecha.getTime())) return 'Sin fecha';
    const texto = fecha.toLocaleDateString('es', { month: 'long', year: 'numeric' });
    return texto.charAt(0).toUpperCase() + texto.slice(1);
};

/**
 * Parte una lista ya ordenada en grupos con su encabezado.
 *
 * Recibe la lista ordenada, no la ordena: quien decide el orden es `selectBooks`, y
 * agrupar por un criterio distinto del que ordena daría grupos rotos —la misma
 * letra apareciendo tres veces.
 */
export const agrupar = (libros, orden) => {
    if (!grupoDe(libros[0], orden)) return [{ titulo: null, libros }];

    const grupos = [];
    for (const libro of libros) {
        const titulo = grupoDe(libro, orden);
        const ultimo = grupos[grupos.length - 1];
        if (ultimo && ultimo.titulo === titulo) ultimo.libros.push(libro);
        else grupos.push({ titulo, libros: [libro] });
    }
    return grupos;
};
