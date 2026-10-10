import React, { useEffect, useRef, useState } from 'react';
import { usePorts } from '../ports/index.js';
import { useBackHandler } from '../ui/useBackHandler.js';
import CodigoQr from '../ui/CodigoQr.jsx';
import { IconArrowLeft, IconCheck, IconWifi } from '../ui/icons.jsx';

const tamanoLegible = (bytes = 0) => (bytes > 1048576
    ? `${(bytes / 1048576).toFixed(1).replace('.', ',')} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`);

const ESTADOS = {
    llegando: 'llegando…',
    añadido: 'en la biblioteca',
    repetido: 'ya lo tenías',
    fallo: 'no se pudo leer',
};

/**
 * Recibir libros desde el ordenador por la wifi.
 *
 * Mientras esta pantalla está abierta, el móvil sirve una página en la red de
 * casa. En el ordenador se abre esa dirección —o se escanea el QR— y se
 * arrastran los libros. Cada uno entra en la biblioteca en cuanto llega, por la
 * misma importación que cualquier otro, con portada, metadatos y detección de
 * duplicados.
 *
 * La pantalla no se apaga mientras está abierta: si se apagara, el sistema
 * acabaría cortando la conexión a mitad de un libro.
 */
export default function RecibirScreen({ library, onClose }) {
    const ports = usePorts();
    const [estado, setEstado] = useState('arrancando');
    const [servidor, setServidor] = useState(null);
    const [error, setError] = useState(null);
    const [llegados, setLlegados] = useState([]);
    const cola = useRef(Promise.resolve());

    useBackHandler(() => { onClose(); return true; });

    useEffect(() => {
        let vivo = true;
        let quitar = null;
        ports.awake?.set(true).catch(() => {});

        (async () => {
            try {
                const datos = await ports.servidor.iniciar();
                if (!vivo) return;
                setServidor(datos);
                setEstado('listo');

                quitar = await ports.servidor.alRecibir({
                    alEmpezar: ({ nombre, tamano }) => setLlegados((lista) => [
                        { clave: `${nombre}-${Date.now()}`, nombre, tamano, estado: 'llegando' },
                        ...lista,
                    ]),
                    alTerminar: (libro) => {
                        // De uno en uno: dos importaciones a la vez se pisarían
                        // la detección de duplicados.
                        cola.current = cola.current.then(async () => {
                            const resultado = await library.importarRecibido(libro);
                            setLlegados((lista) => {
                                const i = lista.findIndex((l) => l.nombre === libro.name && l.estado === 'llegando');
                                const actualizado = { nombre: libro.name, tamano: libro.size, ...resultado, clave: `${libro.id}` };
                                if (i < 0) return [actualizado, ...lista];
                                const copia = [...lista];
                                copia[i] = { ...copia[i], ...actualizado };
                                return copia;
                            });
                        });
                    },
                });
            } catch (fallo) {
                if (!vivo) return;
                setError(fallo?.message || 'No se pudo abrir la conexión.');
                setEstado('error');
            }
        })();

        return () => {
            vivo = false;
            quitar?.();
            ports.servidor?.parar();
            ports.awake?.set(false).catch(() => {});
        };
        // El servidor vive lo que vive la pantalla.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const añadidos = llegados.filter((l) => l.estado === 'añadido').length;

    return (
        <div className="recibir">
            <header className="recibir-cabecera">
                <button type="button" className="icon-btn" onClick={onClose} aria-label="Volver">
                    <IconArrowLeft size={22} />
                </button>
                <h1 className="section-title">Recibir libros</h1>
            </header>

            <div className="recibir-cuerpo">
                {estado === 'arrancando' && <p className="card-body">Preparando la conexión…</p>}

                {estado === 'error' && (
                    <div className="empty">
                        <span className="empty-art" aria-hidden="true"><IconWifi size={30} /></span>
                        <h2 className="empty-title">Sin wifi</h2>
                        <p className="empty-body">{error}</p>
                    </div>
                )}

                {estado === 'listo' && servidor && (
                    <>
                        <div className="recibir-codigo">
                            <CodigoQr texto={servidor.direccion} tamano={176} etiqueta="Código QR con la dirección para enviar libros" />
                            <div className="recibir-pasos">
                                <span className="recibir-paso">En el ordenador, abre en el navegador</span>
                                <span className="recibir-direccion">{servidor.direccion.replace(/^http:\/\//, '')}</span>
                                <span className="recibir-paso">y arrastra tus libros a la página.</span>
                            </div>
                        </div>
                        <p className="recibir-nota">
                            El móvil y el ordenador tienen que estar en la misma wifi. Los libros van directos,
                            sin pasar por internet. Deja esta pantalla abierta hasta que terminen.
                        </p>
                    </>
                )}

                {llegados.length > 0 && (
                    <section className="recibir-lista" aria-label="Libros recibidos">
                        <h2 className="recibir-titulo">
                            {añadidos > 0 ? `${añadidos} ${añadidos === 1 ? 'libro nuevo' : 'libros nuevos'}` : 'Recibiendo'}
                        </h2>
                        <ul>
                            {llegados.map((libro) => (
                                <li key={libro.clave} className="recibir-libro" data-estado={libro.estado}>
                                    <span className="recibir-marca" aria-hidden="true">
                                        {libro.estado === 'añadido' && <IconCheck size={15} />}
                                    </span>
                                    <span className="recibir-nombre">{libro.titulo || libro.nombre}</span>
                                    <span className="recibir-estado">
                                        {ESTADOS[libro.estado]}{libro.estado === 'llegando' ? ` · ${tamanoLegible(libro.tamano)}` : ''}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </section>
                )}
            </div>
        </div>
    );
}
