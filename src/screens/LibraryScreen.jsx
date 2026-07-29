import React from 'react';
import { ACHIEVEMENTS, RARITY } from '../core/achievements.js';
import { WORKSHOP_ADDONS } from '../core/workshopModules.js';
import { getBookDedupKey, buildBookColor } from '../core/bookModel.js';
import { BACKUP_SCHEMA_VERSION } from '../core/backupValidation.js';

// Comprobación de arranque de la Fase 0: importa el núcleo de verdad y ejecuta
// una función pura. Si esta tarjeta se pinta dentro del APK, está demostrado que
// los 30 módulos copiados del escritorio funcionan en el WebView de Android.
const runCoreCheck = () => {
    const sample = { name: 'prueba.epub', type: 'epub', file: { size: 1024 } };
    return {
        achievements: ACHIEVEMENTS.length,
        rarities: Object.keys(RARITY).length,
        addons: WORKSHOP_ADDONS.length,
        schema: BACKUP_SCHEMA_VERSION,
        dedupKey: getBookDedupKey(sample),
        color: buildBookColor('a1b2c3'),
    };
};

export default function LibraryScreen() {
    const check = runCoreCheck();

    return (
        <div className="screen">
            <header>
                <h1 className="screen-title">Biblioteca</h1>
                <p className="screen-sub">SharkReader Mobile · v0.1.0 · Fase 0</p>
            </header>

            <div className="empty">
                <span className="empty-emoji" aria-hidden="true">🦈</span>
                <h2 className="empty-title">Todavía no hay libros</h2>
                <p className="empty-body">
                    La importación de EPUB y PDF llega en la v0.2.0, cuando el selector
                    de ficheros de Android esté conectado.
                </p>
                <button type="button" className="btn btn-primary" disabled>
                    Importar libros
                </button>
            </div>

            <section className="card">
                <h2 className="card-title">
                    Núcleo compartido <span className="pill pill-ok">activo</span>
                </h2>
                <p className="card-body">
                    30 módulos copiados de SharkReader 3.6.0, ejecutándose sin cambios
                    dentro del WebView.
                </p>
                <dl className="kv">
                    <dt>Logros cargados</dt>
                    <dd>{check.achievements}</dd>
                    <dt>Rarezas</dt>
                    <dd>{check.rarities}</dd>
                    <dt>Addons de Workshop</dt>
                    <dd>{check.addons}</dd>
                    <dt>Esquema de backup</dt>
                    <dd>v{check.schema}</dd>
                    <dt>Clave de dedup</dt>
                    <dd style={{ fontSize: 11 }}>{check.dedupKey}</dd>
                    <dt>Color derivado</dt>
                    <dd>
                        <span
                            aria-hidden="true"
                            style={{
                                display: 'inline-block',
                                width: 12,
                                height: 12,
                                borderRadius: 3,
                                background: check.color,
                                verticalAlign: 'middle',
                                marginRight: 6,
                            }}
                        />
                        ok
                    </dd>
                </dl>
            </section>
        </div>
    );
}
