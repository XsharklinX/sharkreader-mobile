/**
 * Catálogo de ajustes.
 *
 * Es la fuente única para dos cosas: las seis categorías que se pintan en la
 * raíz y el índice que alimenta el buscador. Tenerlo declarado en un solo sitio
 * evita el fallo clásico de añadir una opción nueva y que el buscador no la
 * encuentre porque nadie se acordó de indexarla.
 *
 * Las palabras clave incluyen sinónimos y errores frecuentes a propósito: quien
 * busca «letra» quiere el tamaño de texto, y quien escribe «nube» busca la
 * sincronización aunque en la app esa palabra no aparezca.
 */

export const CATEGORIES = [
    {
        id: 'reading',
        label: 'Lectura',
        summary: 'Metas, recordatorios y Sharky',
        items: [
            { id: 'goal-daily', label: 'Meta diaria', keywords: 'objetivo minutos día racha' },
            { id: 'goal-weekly', label: 'Meta semanal', keywords: 'objetivo minutos semana' },
            { id: 'reminder', label: 'Recordatorio diario', keywords: 'aviso notificación alarma hora' },
            { id: 'weekly-summary', label: 'Resumen semanal', keywords: 'notificación domingo informe' },
            { id: 'sharky', label: 'Sharky', keywords: 'mascota tiburón comentarios' },
            { id: 'volume-keys', label: 'Teclas de volumen', keywords: 'botones pasar página físicas' },
            { id: 'keep-awake', label: 'Mantener la pantalla encendida', keywords: 'apagar bloqueo suspensión' },
        ],
    },
    {
        id: 'appearance',
        label: 'Apariencia',
        summary: 'Tema de la app y densidad',
        items: [
            { id: 'theme', label: 'Tema de la aplicación', keywords: 'oscuro claro noche modo color' },
            { id: 'profile', label: 'Tu perfil', keywords: 'nombre usuario avatar foto imagen icono tiburon' },
            { id: 'library-view', label: 'Cómo se ven los libros', keywords: 'estante estanteria rejilla cuadricula portadas vista' },
            { id: 'density', label: 'Densidad de la biblioteca', keywords: 'rejilla compacta portadas tamaño' },
            { id: 'font-scale', label: 'Tamaño de la interfaz', keywords: 'letra texto grande accesibilidad' },
            { id: 'material-you', label: 'Colores del sistema', keywords: 'material you fondo pantalla dinamico tema android acento' },
        ],
    },
    {
        id: 'sync',
        label: 'Sincronización',
        summary: 'Tu servidor WebDAV',
        items: [
            { id: 'sync-server', label: 'Servidor', keywords: 'webdav nextcloud owncloud nube url dirección' },
            { id: 'sync-user', label: 'Usuario y contraseña', keywords: 'credenciales acceso login' },
            { id: 'sync-auto', label: 'Sincronizar al abrir', keywords: 'automático arranque' },
            { id: 'sync-wifi', label: 'Solo con wifi', keywords: 'datos móviles ahorro red' },
            { id: 'sync-now', label: 'Sincronizar ahora', keywords: 'manual forzar subir bajar' },
        ],
    },
    {
        id: 'data',
        label: 'Biblioteca y datos',
        summary: 'Backup, exportar e importar',
        items: [
            { id: 'backup-import', label: 'Importar backup', keywords: 'restaurar escritorio json zip traer' },
            { id: 'backup-export', label: 'Exportar backup', keywords: 'copia seguridad guardar json' },
            { id: 'export-notes', label: 'Exportar anotaciones', keywords: 'subrayados notas markdown obsidian' },
            { id: 'export-vocab', label: 'Exportar vocabulario', keywords: 'palabras diccionario markdown' },
            { id: 'storage', label: 'Almacenamiento', keywords: 'espacio megas ocupado libros caché limpiar' },
        ],
    },
    {
        id: 'privacy',
        label: 'Privacidad',
        summary: 'Permisos y conexiones',
        items: [
            { id: 'permissions', label: 'Permisos concedidos', keywords: 'android notificaciones internet acceso' },
            { id: 'neural-voice', label: 'Voz neuronal', keywords: 'tts servidor proxy azure narrador calidad nube' },
            { id: 'app-lock', label: 'Bloquear la aplicación', keywords: 'huella dactilar cara pin patron biometria seguridad candado' },
            { id: 'connections', label: 'Conexiones a internet', keywords: 'red openlibrary diccionario webdav datos' },
            { id: 'clear-dict', label: 'Borrar la caché del diccionario', keywords: 'limpiar palabras guardadas' },
            { id: 'policy', label: 'Política de privacidad', keywords: 'legal términos datos' },
        ],
    },
    {
        id: 'about',
        label: 'Acerca de',
        summary: 'Versión, Workshop y contacto',
        items: [
            { id: 'version', label: 'Versión', keywords: 'build número actualización' },
            { id: 'workshop', label: 'Workshop', keywords: 'addons extensiones módulos' },
            { id: 'contact', label: 'Contacto y soporte', keywords: 'ayuda correo github incidencias bug' },
        ],
    },
];

/** Índice plano: una entrada por opción, con su categoría. */
export const buildIndex = () =>
    CATEGORIES.flatMap((category) =>
        category.items.map((item) => ({
            ...item,
            categoryId: category.id,
            categoryLabel: category.label,
        }))
    );

const normalize = (value = '') => String(value)
    .toLowerCase()
    .normalize('NFD')
    // Quitar los acentos permite que «diccionario» encuentre lo mismo que
    // «díccionario», y que buscar «grafico» funcione sin tilde.
    .replace(/[̀-ͯ]/g, '');

/**
 * Busca una opción por nombre o por palabra clave.
 *
 * Prioriza las coincidencias en el nombre visible sobre las de palabras clave:
 * quien escribe «tema» espera «Tema de la aplicación» antes que cualquier cosa
 * que solo lo mencione entre sus sinónimos.
 */
export const searchSettings = (query, index = buildIndex()) => {
    const needle = normalize(query).trim();
    if (needle.length < 2) return [];

    // La consulta se parte en palabras y **todas** tienen que encontrarse en
    // alguna parte de la entrada. Sin esto, «exportar notas» no encontraría
    // «Exportar anotaciones», porque esa cadena exacta no está en ningún sitio
    // y así es como escribe la gente cuando busca algo.
    const words = needle.split(/\s+/).filter(Boolean);

    const scored = index
        .map((entry) => {
            const label = normalize(entry.label);
            const keywords = normalize(entry.keywords || '');
            const category = normalize(entry.categoryLabel);
            const haystack = `${label} ${keywords} ${category}`;

            if (!words.every((word) => haystack.includes(word))) {
                return { entry, score: 0 };
            }

            let score = 10; // todas las palabras aparecen en algún sitio
            if (label.startsWith(needle)) score = 100;
            else if (label.includes(needle)) score = 70;
            else if (words.every((word) => label.includes(word))) score = 55;
            else if (keywords.includes(needle)) score = 40;
            else if (category.includes(needle)) score = 20;

            return { entry, score };
        })
        .filter((result) => result.score > 0);

    return scored
        .sort((a, b) => b.score - a.score || a.entry.label.localeCompare(b.entry.label, 'es'))
        .map((result) => result.entry);
};
