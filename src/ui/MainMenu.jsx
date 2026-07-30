import React from 'react';
import Sheet, { Row } from './Sheet.jsx';
import {
    IconChart, IconSettings, IconCloud, IconTrophy, IconFolder, IconBook,
} from './icons.jsx';

/**
 * Menú de la aplicación.
 *
 * ## Por qué sustituye a la barra inferior
 *
 * La barra de pestañas tenía Biblioteca, Progreso y Ajustes, y ocupaba una franja
 * permanente en la pantalla más importante de la app. Pero las tres no son
 * hermanas: **la biblioteca es la aplicación** y las otras dos son sitios a los
 * que se va de vez en cuando. Una barra de pestañas dice «estos tres destinos
 * valen lo mismo», y no es verdad.
 *
 * Quitándola, la rejilla de portadas gana la franja de abajo, y el único destino
 * es la biblioteca. Lo demás vive aquí, detrás de un botón en la cabecera.
 *
 * ## Por qué las estadísticas se separan de los logros
 *
 * Estaban juntas en «Progreso» con un segmentado dentro. Son dos preguntas
 * distintas —«cuánto he leído» y «qué he desbloqueado»— y desde el menú se puede
 * ir directo a la que interesa en lugar de entrar y volver a elegir.
 */
export default function MainMenu({ stats, onNavigate, onClose }) {
    const go = (target) => {
        onNavigate(target);
        onClose();
    };

    const level = stats?.level;
    const streak = stats?.stats?.streak || 0;

    return (
        <Sheet
            title="SharkReader"
            subtitle={level ? `Nivel ${level.level} · ${level.name}` : undefined}
            onClose={onClose}
        >
            {() => (
                <div className="rows">
                    <Row
                        icon={<IconChart size={19} />}
                        label="Progreso"
                        hint="Minutos, rachas y ritmo de lectura"
                        value={streak > 0 ? `${streak} ${streak === 1 ? 'día' : 'días'}` : null}
                        onClick={() => go('progress')}
                    />
                    <Row
                        icon={<IconTrophy size={19} />}
                        label="Logros"
                        hint="Lo que has desbloqueado"
                        value={stats?.achievements
                            ? `${Object.keys(stats.achievements).length}/59`
                            : null}
                        onClick={() => go('achievements')}
                    />
                    <Row
                        icon={<IconCloud size={19} />}
                        label="Catálogos"
                        hint="Tu servidor de Calibre u otro catálogo OPDS"
                        onClick={() => go('catalog')}
                    />
                    <Row
                        icon={<IconFolder size={19} />}
                        label="Importar una carpeta"
                        hint="Todos los libros que contenga"
                        onClick={() => go('import-folder')}
                    />
                    <Row
                        icon={<IconBook size={19} />}
                        label="Elegir libros"
                        hint="Uno o varios ficheros sueltos"
                        onClick={() => go('import-files')}
                    />
                    <Row
                        icon={<IconSettings size={19} />}
                        label="Ajustes"
                        onClick={() => go('settings')}
                    />
                </div>
            )}
        </Sheet>
    );
}
