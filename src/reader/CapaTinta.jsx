import React, { useEffect, useRef } from 'react';
import { esPalma } from './palma.js';
import { HERRAMIENTAS, RADIO_GOMA, aLienzo, aPagina, anchoConPresion, cerrarTrazo, presionDe } from './tinta.js';

/**
 * Lo escrito a mano, encima del folio. Ver `tinta.js`.
 *
 * Un lienzo transparente del tamaño exacto de la página pintada. Con el lápiz
 * guardado no recibe ni un toque: la página se pasa como siempre.
 *
 * Con el lápiz sacado, **quién escribe** se decide por el tipo de puntero:
 *
 *  - El lápiz (`pen`) escribe siempre.
 *  - La palma que se apoya mientras se escribe no hace nada: ni escribe ni pasa
 *    la página. Se reconoce por el tamaño del contacto (`palma.js`) y porque
 *    llega mientras el lápiz está cerca o escribiendo.
 *  - El dedo escribe solo si se ha pedido. Si no, pasa la página como siempre,
 *    que es lo que se quiere con un lápiz en la otra mano.
 */

/** Tras ver el lápiz, cuánto tiempo se ignoran los dedos: la mano sigue ahí. */
const MANO_APOYADA_MS = 700;

const pintarTrazo = (ctx, trazo, lienzo, recorte, ratio) => {
    const { puntos } = trazo;
    if (!puntos.length) return;
    const estilo = HERRAMIENTAS[trazo.herramienta] || HERRAMIENTAS.boligrafo;
    const base = trazo.ancho * (lienzo.ancho / (recorte?.w || 1));
    ctx.save();
    ctx.globalAlpha = estilo.opacidad;
    ctx.strokeStyle = trazo.color;
    ctx.fillStyle = trazo.color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const enLienzo = puntos.map((p) => aLienzo(p, lienzo, recorte).map((n) => n * ratio));
    if (enLienzo.length === 1) {
        ctx.beginPath();
        ctx.arc(enLienzo[0][0], enLienzo[0][1], (anchoConPresion(base, puntos[0][2]) * ratio) / 2, 0, Math.PI * 2);
        ctx.fill();
    } else if (trazo.herramienta === 'marcador') {
        // Un solo camino: tramos sueltos se solaparían y se oscurecerían en
        // cada unión.
        ctx.lineWidth = base * ratio;
        ctx.beginPath();
        ctx.moveTo(...enLienzo[0]);
        enLienzo.slice(1).forEach((p) => ctx.lineTo(...p));
        ctx.stroke();
    } else {
        // Tramo a tramo, cada uno con su presión, y curvado por los puntos
        // medios para que no se vean los vértices.
        for (let i = 1; i < enLienzo.length; i += 1) {
            const a = enLienzo[i - 1];
            const b = enLienzo[i];
            const antes = i > 1 ? enLienzo[i - 2] : a;
            ctx.lineWidth = anchoConPresion(base, puntos[i][2]) * ratio;
            ctx.beginPath();
            ctx.moveTo((antes[0] + a[0]) / 2, (antes[1] + a[1]) / 2);
            ctx.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
            if (i === enLienzo.length - 1) ctx.lineTo(b[0], b[1]);
            ctx.stroke();
        }
    }
    ctx.restore();
};

export default function CapaTinta({
    activo, trazos = [], recorte = null, invertida = false,
    herramienta = 'boligrafo', color, conDedo = false, onTrazo, onBorrar,
}) {
    const lienzoRef = useRef(null);
    const enCurso = useRef(null);
    const lapizVisto = useRef(0);
    const datos = useRef({});
    datos.current = { trazos, recorte, herramienta, color, conDedo, onTrazo, onBorrar };

    const medidas = () => {
        const el = lienzoRef.current;
        return { ancho: el?.clientWidth || 1, alto: el?.clientHeight || 1 };
    };

    const repintar = () => {
        const el = lienzoRef.current;
        if (!el) return;
        const ratio = window.devicePixelRatio || 1;
        const { ancho, alto } = medidas();
        const w = Math.round(ancho * ratio);
        const h = Math.round(alto * ratio);
        if (el.width !== w || el.height !== h) { el.width = w; el.height = h; }
        const ctx = el.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, w, h);
        const lista = enCurso.current?.trazo ? [...datos.current.trazos, enCurso.current.trazo] : datos.current.trazos;
        lista.forEach((t) => pintarTrazo(ctx, t, { ancho, alto }, datos.current.recorte, ratio));
    };

    useEffect(repintar);

    useEffect(() => {
        const el = lienzoRef.current;
        if (!el || typeof ResizeObserver === 'undefined') return undefined;
        const observador = new ResizeObserver(() => repintar());
        observador.observe(el);
        return () => observador.disconnect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const puntoDe = (evento) => {
        const caja = lienzoRef.current.getBoundingClientRect();
        return aPagina(
            { x: evento.clientX - caja.left, y: evento.clientY - caja.top },
            { ancho: caja.width || 1, alto: caja.height || 1 },
            datos.current.recorte,
        );
    };

    /** ¿Este puntero escribe? Si no, ¿se tira o se deja pasar a la página? */
    const decidir = (evento) => {
        if (evento.pointerType === 'pen') return 'escribe';
        if (evento.pointerType === 'mouse') return 'escribe';
        const manoApoyada = enCurso.current || Date.now() - lapizVisto.current < MANO_APOYADA_MS;
        if (esPalma(evento) || manoApoyada) return 'tira';
        return datos.current.conDedo ? 'escribe' : 'pasa';
    };

    const empezar = (evento) => {
        const decision = decidir(evento);
        if (decision === 'pasa') return;
        evento.stopPropagation();
        if (decision === 'tira' || enCurso.current) return;
        if (evento.pointerType === 'pen') lapizVisto.current = Date.now();
        lienzoRef.current.setPointerCapture?.(evento.pointerId);
        const { herramienta: h, color: c } = datos.current;
        const p = puntoDe(evento);
        if (h === 'goma') {
            enCurso.current = { id: evento.pointerId, goma: true };
            datos.current.onBorrar?.(p, RADIO_GOMA);
            return;
        }
        enCurso.current = {
            id: evento.pointerId,
            trazo: { herramienta: h, color: c, ancho: HERRAMIENTAS[h].ancho, puntos: [[p.x, p.y, presionDe(evento)]] },
        };
        repintar();
    };

    const mover = (evento) => {
        if (evento.pointerType === 'pen') lapizVisto.current = Date.now();
        const curso = enCurso.current;
        if (!curso || curso.id !== evento.pointerId) {
            if (decidir(evento) !== 'pasa') evento.stopPropagation();
            return;
        }
        evento.stopPropagation();
        // Los eventos agrupados: a 240 Hz, el navegador junta varios en uno y
        // sin ellos una curva rápida sale a trozos rectos.
        const eventos = evento.nativeEvent?.getCoalescedEvents?.() || [evento];
        for (const e of (eventos.length ? eventos : [evento])) {
            const p = puntoDe(e);
            if (curso.goma) datos.current.onBorrar?.(p, RADIO_GOMA);
            else curso.trazo.puntos.push([p.x, p.y, presionDe(e.pointerType ? e : evento)]);
        }
        if (!curso.goma) repintar();
    };

    const terminar = (evento, cancelado = false) => {
        const curso = enCurso.current;
        if (!curso || curso.id !== evento.pointerId) {
            if (decidir(evento) !== 'pasa') evento.stopPropagation();
            return;
        }
        evento.stopPropagation();
        enCurso.current = null;
        if (evento.pointerType === 'pen') lapizVisto.current = Date.now();
        if (!curso.goma && !cancelado) datos.current.onTrazo?.(cerrarTrazo(curso.trazo));
        repintar();
    };

    return (
        <canvas
            ref={lienzoRef}
            className={`tinta${activo ? ' activa' : ''}${invertida ? ' inverted' : ''}`}
            aria-hidden="true"
            onPointerDown={activo ? empezar : undefined}
            onPointerMove={activo ? mover : undefined}
            onPointerUp={activo ? (e) => terminar(e) : undefined}
            onPointerCancel={activo ? (e) => terminar(e, true) : undefined}
        />
    );
}
