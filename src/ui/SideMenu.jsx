import React, { useRef } from 'react';
import { useBackHandler } from './useBackHandler.js';
import {
    IconChart, IconSettings, IconCloud, IconTrophy, IconFolder, IconBook,
} from './icons.jsx';
import { resolveSheetDrag } from './sheetDrag.js';

/**
 * Menú lateral.
 *
 * ## Por qué un cajón y no una hoja
 *
 * Esto era una hoja que subía desde abajo. Una hoja es para **decidir algo y
 * volver** —elegir un tema, ajustar un tamaño— y se cierra en cuanto tocas. Pero
 * aquí no se decide nada: se va a otro sitio de la app. Para navegar, el cajón
 * lateral es lo que todo el mundo tiene aprendido, y además cabe de pie: siete
 * destinos con su explicación ocupan alto, y una hoja de siete filas ya tapaba la
 * pantalla entera y dejaba de ser una hoja.
 *
 * Entra por la **izquierda**, del mismo lado que el botón que lo abre. Un panel
 * que sale del lado contrario al dedo que lo llamó se siente como otra pantalla.
 *
 * ## Por qué esto sí lleva color
 *
 * El resto de la app tiene una regla estricta: un uso de acento por pantalla, para
 * que el acento signifique algo. Aquí se rompe a propósito.
 *
 * Un cajón de navegación no compite con ningún contenido —lo tapa entero— y su
 * problema es el contrario: siete filas grises seguidas no se distinguen, y hay
 * que leer las siete para encontrar la que buscas. Un color por destino se
 * convierte en memoria: a la tercera vez ya no lees «Logros», vas al ámbar. Los
 * cinco colores son los de subrayado que ya usa el resto de la app y la versión de
 * escritorio, no una paleta nueva.
 */

/** Un color por destino. Los mismos que los subrayados: no se inventa paleta. */
const DESTINOS = [
    {
        id: 'progress',
        label: 'Progreso',
        hint: 'Minutos, rachas y ritmo',
        icon: <IconChart size={20} />,
        tono: 'sky',
    },
    {
        id: 'achievements',
        label: 'Logros',
        hint: 'Lo que has desbloqueado',
        icon: <IconTrophy size={20} />,
        tono: 'amber',
    },
    {
        id: 'catalog',
        label: 'Catálogos',
        hint: 'Calibre y OPDS',
        icon: <IconCloud size={20} />,
        tono: 'blue',
    },
    {
        id: 'import-folder',
        label: 'Importar una carpeta',
        hint: 'Todos los libros que contenga',
        icon: <IconFolder size={20} />,
        tono: 'green',
    },
    {
        id: 'import-files',
        label: 'Elegir libros',
        hint: 'Uno o varios ficheros',
        icon: <IconBook size={20} />,
        tono: 'pink',
    },
    {
        id: 'settings',
        label: 'Ajustes',
        hint: 'Lectura, respaldo, apariencia',
        icon: <IconSettings size={20} />,
        tono: 'slate',
    },
];

export default function SideMenu({ stats, books = [], onNavigate, onClose }) {
    useBackHandler(() => { onClose(); return true; }, true);

    const panelRef = useRef(null);
    const dragRef = useRef(null);

    // Arrastrar hacia la izquierda lo cierra, igual que el asa de las hojas cierra
    // una hoja. Ver `sheetDrag.js`: la misma decisión, girada un cuarto de vuelta.
    const handleDown = (event) => {
        dragRef.current = { x: event.clientX, time: Date.now() };
        event.currentTarget.setPointerCapture?.(event.pointerId);
    };

    const handleMove = (event) => {
        if (!dragRef.current || !panelRef.current) return;
        const dx = Math.min(0, event.clientX - dragRef.current.x);
        panelRef.current.style.transform = `translate3d(${Math.round(dx)}px,0,0)`;
    };

    const settle = () => {
        const node = panelRef.current;
        if (!node) return;
        node.classList.add('settling');
        node.style.transform = '';
        setTimeout(() => node.classList.remove('settling'), 220);
    };

    const handleUp = (event) => {
        const start = dragRef.current;
        if (!start) return;
        dragRef.current = null;
        // Se reutiliza la misma decisión que las hojas midiendo el eje contrario.
        const { close } = resolveSheetDrag(start.x - event.clientX, Date.now() - start.time);
        if (close) onClose();
        else settle();
    };

    const level = stats?.level;
    const streak = stats?.stats?.streak || 0;
    const minutes = stats?.stats?.timeRead || 0;
    const finished = books.filter((book) => book.isFinished).length;
    const logros = stats?.achievements ? Object.keys(stats.achievements).length : 0;
    const perfil = stats?.preferences?.profile || {};

    const go = (target) => { onNavigate(target); onClose(); };

    return (
        <div className="scrim left" onClick={onClose} role="presentation">
            <aside
                className="side"
                ref={panelRef}
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-label="Menú de SharkReader"
            >
                {/* ── Quién eres ───────────────────────────────────────────────
                    La cabecera es la única parte de la app que habla del usuario y
                    no de los libros. Sin ella el cajón era una lista de enlaces;
                    con ella el menú tiene dueño. */}
                <header
                    className="side-head"
                    onPointerDown={handleDown}
                    onPointerMove={handleMove}
                    onPointerUp={handleUp}
                    onPointerCancel={settle}
                >
                    {/* Sin botón de cerrar. El velo, el gesto hacia la izquierda
                        y el botón atrás del sistema ya lo cierran: un cuarto
                        camino solo añade un elemento que estorba en la esquina. */}

                    {/* Iniciales, no un emoji.
                        
                        Un emoji lo dibuja el sistema con su propia paleta y su
                        propio estilo, así que nunca se parece al resto de la app:
                        dentro de una interfaz de dos colores y una tipografía, un
                        dibujo de colores planos canta. Las iniciales están en
                        nuestra tipografía y son del usuario. */}
                    <span className="side-avatar">
                        {perfil.photo
                            ? <img src={perfil.photo} alt="" />
                            : <b aria-hidden="true">{iniciales(perfil.name)}</b>}
                    </span>

                    <p className="side-name">{perfil.name || 'Tu biblioteca'}</p>

                    {level && (
                        <>
                            <p className="side-level">
                                <b>Nivel {level.level}</b> · {level.name}
                            </p>
                            {/* La barra hasta el nivel siguiente. Es el único
                                sitio donde ese dato se ve sin entrar en Progreso,
                                y es lo que convierte el nivel en algo que sube. */}
                            <span className="side-xp" aria-hidden="true">
                                <i style={{ width: `${level.progress}%` }} />
                            </span>
                            <p className="side-xp-txt">
                                {level.current} / {level.xpPerLevel} para el nivel {level.level + 1}
                            </p>
                        </>
                    )}
                </header>

                {/* ── Tres cifras ──────────────────────────────────────────────
                    Racha, minutos y libros terminados. Están aquí porque son la
                    respuesta a «¿voy bien?», y esa pregunta se hace al abrir la
                    app, no entrando en una pantalla de estadísticas. */}
                <div className="side-cifras">
                    <span className="side-cifra">
                        <b>{streak}</b>
                        <i>{streak === 1 ? 'día' : 'días'}</i>
                    </span>
                    <span className="side-cifra">
                        <b>{minutes}</b>
                        <i>minutos</i>
                    </span>
                    <span className="side-cifra">
                        <b>{finished}</b>
                        <i>{finished === 1 ? 'libro' : 'libros'}</i>
                    </span>
                </div>

                <nav className="side-nav" aria-label="Ir a">
                    {DESTINOS.map((destino) => (
                        <button
                            key={destino.id}
                            type="button"
                            className="side-item"
                            onClick={() => go(destino.id)}
                        >
                            <span className={`side-icon ${destino.tono}`}>{destino.icon}</span>
                            <span className="side-txt">
                                <span className="side-label">{destino.label}</span>
                                <span className="side-hint">{destino.hint}</span>
                            </span>
                            {destino.id === 'achievements' && (
                                <span className="side-val">{logros}/59</span>
                            )}
                        </button>
                    ))}
                </nav>

                <p className="side-pie">SharkReader · tu biblioteca, en tu bolsillo</p>
            </aside>
        </div>
    );
}

/**
 * Iniciales del nombre, hasta dos.
 *
 * Sin nombre no se inventa nada: se usa la marca. Es lo que hace cualquier app
 * con cuentas, y no obliga a tener un nombre puesto para que la cabecera no se
 * vea vacía.
 */
const iniciales = (nombre) => {
    const partes = String(nombre || '').trim().split(/\s+/).filter(Boolean);
    if (partes.length === 0) return 'SR';
    return partes.slice(0, 2).map((parte) => parte[0].toUpperCase()).join('');
};
