import React, { useMemo } from 'react';
import qrcode from 'qrcode-generator';

/**
 * Un código QR en SVG.
 *
 * Se dibuja como un único `path` de cuadrados, sin antialias entre módulos
 * (`shape-rendering: crispEdges`): un QR con los bordes difuminados por el
 * escalado es justo el que la cámara del portátil no consigue leer.
 *
 * Va siempre en negro sobre blanco, con su margen blanco alrededor, sea cual
 * sea el tema: los lectores de QR esperan eso y un QR claro sobre oscuro falla
 * en muchas cámaras.
 */
export default function CodigoQr({ texto, tamano = 180, etiqueta }) {
    const { ruta, modulos } = useMemo(() => {
        const qr = qrcode(0, 'M');
        qr.addData(texto);
        qr.make();
        const n = qr.getModuleCount();
        let d = '';
        for (let fila = 0; fila < n; fila += 1) {
            for (let col = 0; col < n; col += 1) {
                if (qr.isDark(fila, col)) d += `M${col + 4},${fila + 4}h1v1h-1z`;
            }
        }
        return { ruta: d, modulos: n + 8 };
    }, [texto]);

    return (
        <svg
            className="codigo-qr"
            viewBox={`0 0 ${modulos} ${modulos}`}
            width={tamano}
            height={tamano}
            role="img"
            aria-label={etiqueta || `Código QR de ${texto}`}
            shapeRendering="crispEdges"
        >
            <rect width={modulos} height={modulos} fill="#fff" />
            <path d={ruta} fill="#0F172A" />
        </svg>
    );
}
