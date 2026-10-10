import { geometriaPliegue, esquinaPara, recorridoDeToque } from './pliegueGeometria.js';

/**
 * El pliegue de papel, dibujado en la GPU.
 *
 * ## Qué cambia respecto al pliegue anterior
 *
 * El anterior doblaba **copias** de la página —iframes con el capítulo o una
 * foto recortada con `clip-path`— y debajo no había nada real: la página nueva
 * se cambiaba a ciegas por detrás. Necesitaba rescates y temporizadores para no
 * quedarse atascado, y aun así ha tenido que retirarse varias veces.
 *
 * Aquí:
 *
 *  - Lo que hay debajo es **la página siguiente de verdad**: la página sombra
 *    (`EpubEngine.crearSombra`). La hoja real se aparta al empezar y el lienzo
 *    dibuja solo la que se levanta.
 *  - Lo que se dobla es una imagen en una textura de WebGL, y un solo shader
 *    calcula para cada píxel si ve la hoja plana, el rollo por delante, el rollo
 *    por detrás, el dorso tumbado o la sombra sobre la página de abajo. No hay
 *    capas del DOM que el WebView tenga que componer a destiempo.
 *  - Si algo falla —sin WebGL, sin foto, un error al compilar—, `listo()` dice
 *    que no y el lector usa el deslizar. No hay estado intermedio que se pueda
 *    quedar a medias: el lienzo se oculta y la hoja real vuelve.
 */

const VERTICES = `
attribute vec2 aPos;
uniform vec2 uSize;
varying vec2 vPos;
void main() {
    vPos = aPos;
    gl_Position = vec4(aPos.x / uSize.x * 2.0 - 1.0, 1.0 - aPos.y / uSize.y * 2.0, 0.0, 1.0);
}`;

const FRAGMENTOS = `
precision highp float;
uniform sampler2D uTex;
uniform vec2 uSize;
uniform vec4 uRect;
uniform vec2 uN;
uniform vec2 uL;
uniform float uR;
uniform vec3 uPapel;
varying vec2 vPos;
const float PI = 3.14159265;

vec3 muestra(vec2 p) {
    return texture2D(uTex, uRect.xy + (p / uSize) * uRect.zw).rgb;
}

bool dentro(vec2 p) {
    return p.x >= 0.0 && p.y >= 0.0 && p.x <= uSize.x && p.y <= uSize.y;
}

// El dorso: papel con el texto del otro lado apenas transparentado.
vec4 dorso(vec2 s, float luz) {
    return vec4(mix(uPapel, muestra(s), 0.13) * luz, 1.0);
}

void main() {
    vec2 p = vPos;
    float d = dot(p - uL, uN);

    // 1. El dorso tumbado: lo más alto, va por encima de todo.
    if (d <= 0.0) {
        vec2 s = p + uN * (PI * uR - 2.0 * d);
        if (dentro(s)) { gl_FragColor = dorso(s, 0.97); return; }
    }

    if (d >= 0.0 && d <= uR && uR > 0.0) {
        float a = asin(clamp(d / uR, 0.0, 1.0));
        // 2. El rollo por detrás (la mitad de arriba del cilindro).
        vec2 s = p + uN * (uR * (PI - a) - d);
        if (dentro(s)) { gl_FragColor = dorso(s, 0.82 + 0.15 * cos(a)); return; }
        // 3. El rollo por delante: se oscurece al girar hacia fuera de la luz.
        s = p + uN * (uR * a - d);
        if (dentro(s)) {
            float luz = 1.0 - 0.38 * pow(d / uR, 2.0);
            gl_FragColor = vec4(muestra(s) * luz, 1.0);
            return;
        }
    }

    // 4. La hoja todavía plana, con la sombra que le echa el rollo encima.
    if (d < 0.0) {
        float sombra = 1.0 - 0.18 * exp(d / (uR + 4.0));
        gl_FragColor = vec4(muestra(p) * sombra, 1.0);
        return;
    }

    // 5. Nada de hoja: se ve la página de debajo, con la sombra del rollo.
    float alfa = 0.3 * exp(-(d - uR) / (uR * 2.5 + 8.0));
    gl_FragColor = vec4(0.0, 0.0, 0.0, alfa);
}`;

const compilar = (gl, tipo, fuente) => {
    const shader = gl.createShader(tipo);
    gl.shaderSource(shader, fuente);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const error = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(error || 'shader');
    }
    return shader;
};

const colorDe = (css) => {
    const m = String(css || '').match(/^#?([0-9a-f]{6})$/i);
    if (!m) return [0.94, 0.9, 0.82];
    const n = parseInt(m[1], 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/**
 * El dibujo: un lienzo, una textura y un shader.
 *
 * @param {HTMLCanvasElement} lienzo
 * @returns {null | {cargar: Function, dibujar: Function, destruir: Function}}
 */
export const crearDibujoPliegue = (lienzo) => {
    let gl;
    try {
        gl = lienzo.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: false });
    } catch {
        gl = null;
    }
    if (!gl) return null;

    let programa;
    try {
        programa = gl.createProgram();
        gl.attachShader(programa, compilar(gl, gl.VERTEX_SHADER, VERTICES));
        gl.attachShader(programa, compilar(gl, gl.FRAGMENT_SHADER, FRAGMENTOS));
        gl.linkProgram(programa);
        if (!gl.getProgramParameter(programa, gl.LINK_STATUS)) return null;
    } catch {
        return null;
    }
    gl.useProgram(programa);

    const u = (nombre) => gl.getUniformLocation(programa, nombre);
    const uSize = u('uSize');
    const uRect = u('uRect');
    const uN = u('uN');
    const uL = u('uL');
    const uR = u('uR');
    const uPapel = u('uPapel');
    const buffer = gl.createBuffer();
    const aPos = gl.getAttribLocation(programa, 'aPos');

    const textura = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, textura);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    let rect = [0, 0, 1, 1];
    let ancho = 0;
    let alto = 0;

    const medir = () => {
        const ratio = window.devicePixelRatio || 1;
        ancho = lienzo.clientWidth;
        alto = lienzo.clientHeight;
        const w = Math.max(1, Math.round(ancho * ratio));
        const h = Math.max(1, Math.round(alto * ratio));
        if (lienzo.width !== w || lienzo.height !== h) {
            lienzo.width = w;
            lienzo.height = h;
        }
        gl.viewport(0, 0, w, h);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, ancho, 0, 0, alto, 0, alto, ancho, 0, ancho, alto]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    };

    return {
        /**
         * Sube la foto de la página a la textura.
         *
         * @param {string} imagen data URL de la foto de pantalla
         * @param {[number, number, number, number]} recorte dónde está la hoja
         *   dentro de la foto, en proporciones (x, y, ancho, alto)
         */
        cargar(imagen, recorte) {
            return new Promise((listo, fallo) => {
                const img = new Image();
                img.onload = () => {
                    gl.bindTexture(gl.TEXTURE_2D, textura);
                    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
                    rect = recorte;
                    listo();
                };
                img.onerror = fallo;
                img.src = imagen;
            });
        },

        /** Dibuja la hoja con la esquina `c` levantada hasta el dedo `f`. */
        dibujar(f, c, papel) {
            medir();
            const g = geometriaPliegue(f, c, ancho);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            gl.uniform2f(uSize, ancho, alto);
            gl.uniform4f(uRect, rect[0], rect[1], rect[2], rect[3]);
            gl.uniform2f(uN, g.nx, g.ny);
            gl.uniform2f(uL, g.lx, g.ly);
            gl.uniform1f(uR, g.r);
            gl.uniform3fv(uPapel, colorDe(papel));
            gl.drawArrays(gl.TRIANGLES, 0, 6);
        },

        medidas: () => ({ ancho: lienzo.clientWidth, alto: lienzo.clientHeight }),

        destruir() {
            try {
                gl.deleteTexture(textura);
                gl.deleteBuffer(buffer);
                gl.deleteProgram(programa);
                gl.getExtension('WEBGL_lose_context')?.loseContext();
            } catch { /* ya perdido */ }
        },
    };
};

const fotograma = () => new Promise((listo) => requestAnimationFrame(() => listo()));

/**
 * Quien conduce el pliegue: empezar, seguir al dedo, confirmar o deshacer.
 *
 * @param {Object} opciones
 * @param {ReturnType<typeof crearDibujoPliegue>} opciones.dibujo
 * @param {HTMLCanvasElement} opciones.lienzo
 * @param {() => HTMLElement|null} opciones.hoja la página real
 * @param {() => Promise<unknown>} opciones.avanzar pasa la página real y espera a que se pinte
 * @param {() => string} opciones.papel color de fondo del tema, para el dorso
 * @param {() => void} [opciones.alTerminar]
 */
export const createPliegue = ({ dibujo, lienzo, hoja, avanzar, papel, alTerminar }) => {
    let estado = null;

    const esquinaPx = () => {
        const { ancho, alto } = dibujo.medidas();
        return { x: estado.esquina.x * ancho, y: estado.esquina.y * alto };
    };

    const pintar = () => dibujo.dibujar(estado.f, esquinaPx(), papel());

    const animar = async (desde, hasta, ms) => {
        const inicio = performance.now();
        for (;;) {
            const t = Math.min(1, (performance.now() - inicio) / ms);
            const s = 1 - (1 - t) ** 3;
            estado.f = { x: desde.x + (hasta.x - desde.x) * s, y: desde.y + (hasta.y - desde.y) * s };
            pintar();
            if (t >= 1) return;
            await fotograma();
        }
    };

    const ocultarHoja = (si) => {
        const nodo = hoja();
        if (nodo) nodo.style.transform = si ? 'translate3d(-300%,0,0)' : '';
    };

    const terminar = () => {
        lienzo.hidden = true;
        ocultarHoja(false);
        estado = null;
        alTerminar?.();
    };

    /** Se levanta la esquina del lado donde está el dedo. */
    const empezar = async (punto) => {
        // Visible antes de medir: oculto, el lienzo mide cero.
        lienzo.hidden = false;
        const { alto } = dibujo.medidas();
        estado = { esquina: esquinaPara(punto?.y ?? alto, alto), f: null };
        estado.f = esquinaPx();
        pintar();
        // La hoja real se aparta cuando el lienzo ya la está dibujando encima:
        // así no hay un fotograma en que no se vea ninguna de las dos.
        await fotograma();
        ocultarHoja(true);
    };

    const acabarPasando = async () => {
        const { ancho, alto } = dibujo.medidas();
        await animar(estado.f, { x: -ancho * 1.05, y: estado.f.y + (alto * 0.5 - estado.f.y) * 0.2 }, 220);
        try { await avanzar(); } finally { await fotograma(); terminar(); }
    };

    return {
        activo: () => Boolean(estado),

        /** Con el dedo: la primera llamada levanta la esquina. */
        async seguir(punto) {
            if (!estado) await empezar(punto);
            if (!estado) return;
            estado.f = { x: punto.x, y: punto.y };
            pintar();
        },

        async confirmar() {
            if (!estado) return;
            await acabarPasando();
        },

        async cancelar() {
            if (!estado) return;
            await animar(estado.f, esquinaPx(), 200);
            terminar();
        },

        /** Un toque en el borde: la hoja se pasa sola, desde la esquina tocada. */
        async toque(punto) {
            if (estado) return;
            await empezar(punto);
            const { ancho, alto } = dibujo.medidas();
            const inicio = performance.now();
            for (;;) {
                const t = Math.min(1, (performance.now() - inicio) / 380);
                estado.f = recorridoDeToque(t, ancho, alto, estado.esquina);
                pintar();
                if (t >= 1) break;
                await fotograma();
            }
            try { await avanzar(); } finally { await fotograma(); terminar(); }
        },
    };
};
