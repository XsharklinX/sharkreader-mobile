import React, { useEffect, useRef } from 'react';
import { cornerState, esquinaDe } from './pageCorner.js';

/**
 * Lo que se ve del pliegue mientras no se usa.
 *
 * No es cero y no es `visibility: hidden`: **lo que no se pinta no tiene
 * textura**. Con la hoja oculta, el WebView tenía que rasterizar dos iframes en
 * el primer fotograma del arrastre, y mientras tanto presentaba la capa vacía —
 * ese hueco es el fotograma en negro que se veía aguantando el dedo.
 *
 * Con un cuatro por mil el navegador la pinta y la promueve como cualquier otra
 * capa, así que la textura ya existe cuando el dedo se apoya. A ojo es invisible:
 * sobre el fondo de la página, cuatro milésimas de un texto no se distinguen del
 * ruido de la pantalla.
 */
const OPACIDAD_FRIA = 0.004;

/**
 * Cuánto puede estar el pliegue tapando la pantalla sin que nadie lo conduzca.
 *
 * Generoso a propósito: un gesto lento con el dedo apoyado es normal, y cortarlo
 * sería peor que el fallo que evita. Lo que no es normal es que pase un segundo y
 * medio sin un solo movimiento ni un remate.
 */
const ARMADO_MAX_MS = 1500;

/**
 * Mete el CSS del capítulo en su HTML.
 *
 * Va lo último del `<head>`, después de las hojas propias del EPUB: lo que trae
 * son el tema y la tipografía elegidos por el lector, y tienen que ganar igual que
 * ganan en la página real. Si el capítulo no declara cabecera —los hay— se pone
 * antes del cuerpo, que es donde el navegador la habría creado.
 */
export const withStyles = (html, css) => {
    if (!css) return html;
    const style = `<style>${css}</style>`;

    const head = html.search(/<\/head\s*>/i);
    if (head !== -1) return html.slice(0, head) + style + html.slice(head);

    const body = html.search(/<body[\s>]/i);
    if (body !== -1) return html.slice(0, body) + style + html.slice(body);

    return style + html;
};

/**
 * Las capas del doblado de hoja.
 *
 * ## Cómo se consigue el dorso
 *
 * La página que se va se dibuja **dos veces**: plana a un lado del doblez y
 * reflejada al otro. Un nodo del DOM no puede estar en dos sitios, así que hacen
 * falta dos copias del contenido.
 *
 * Las copias son dos iframes con el mismo HTML del capítulo, cada uno desplazado
 * para mostrar la página visible. El reflejo es `scaleX(-1)` con el origen en la
 * línea del doblez, que es exactamente lo que hace el papel al plegarse — de ahí
 * sale el texto al revés, y sale exacto.
 *
 * **Por qué iframes y no una imagen.** El primer intento rasterizaba la página
 * con html2canvas y devolvía siempre la primera del capítulo: su clon maqueta las
 * columnas CSS en otras coordenadas, y ni recortar con `x`, ni desplazar el clon,
 * ni `scrollX` conseguían moverlo. Con una copia propia el desplazamiento lo
 * ponemos nosotros. Además el texto sigue siendo texto: más nítido que un mapa de
 * bits y sin los 200 ms de rasterizado.
 *
 * ## Por qué el progreso no pasa por el estado de React
 *
 * Durante el arrastre esto se actualiza en cada fotograma. El componente se monta
 * una vez y luego los estilos se escriben directamente sobre los nodos: pasar por
 * un render sesenta veces por segundo para mover un recorte es tirar el
 * presupuesto de tiempo.
 */
export default function PageFold({
    sheet, width, height, controllerRef, tinte = '#000000', onStuck,
}) {
    const flatRef = useRef(null);
    const backRef = useRef(null);
    const shadeRef = useRef(null);
    const shadowRef = useRef(null);
    const creaseRef = useRef(null);
    const rootRef = useRef(null);

    // Las dos copias. Se montan a mano porque son iframes con `srcdoc` y hay que
    // colocarlas con el desplazamiento de columna, que React no puede expresar
    // como atributo.
    const framesRef = useRef([]);

    /**
     * Montar las copias y colocarlas son **dos cosas distintas**, y por eso son
     * dos efectos.
     *
     * Aquí estaba el pliegue en blanco. El capítulo entero pesa más de un mega
     * en `srcdoc`, y montarlo de nuevo cuesta cientos de milisegundos en los que
     * el iframe existe pero todavía no ha pintado nada. Como la hoja se preparaba
     * otra vez en **cada página** —el objeto era nuevo, así que el efecto volvía a
     * correr— arrastrar justo después de pasar página encontraba las copias aún
     * vacías: dos hojas de papel sin una letra, que es lo que se veía.
     *
     * Dentro de un capítulo el contenido no cambia; lo único que cambia es qué
     * columna toca enseñar. Así que el documento se monta una vez por capítulo y
     * el desplazamiento se escribe aparte, que es gratis.
     */
    useEffect(() => {
        if (!(sheet?.html || sheet?.image) || !flatRef.current || !backRef.current) return;

        /**
         * Con foto, una imagen; sin foto, la copia de HTML de siempre.
         *
         * **Por qué existe la foto.** La copia de HTML lleva la página sin sus
         * imágenes —se sustituyen por un hueco transparente para que el capítulo
         * quepa en memoria— y eso en una página de texto no se nota, pero en una
         * portada o en una lámina la página *es* la imagen: al apoyar el dedo, la
         * hoja se quedaba **completamente en blanco**. Ver `SharkCapturePlugin`.
         *
         * La foto es lo que hay en la pantalla, con todo dentro, y ocupa lo que
         * ocupa la pantalla y no lo que ocupa el libro. El camino de HTML se
         * queda porque en el navegador no hay plugin que haga fotos y porque una
         * foto puede fallar; sin él, el pliegue desaparecería en vez de perder
         * las ilustraciones.
         */
        const build = (host) => {
            host.replaceChildren();
            return sheet.image ? buildFoto(host) : buildFrame(host);
        };

        const buildFoto = (host) => {
            const img = document.createElement('img');
            img.setAttribute('alt', '');
            img.setAttribute('aria-hidden', 'true');
            img.setAttribute('draggable', 'false');
            img.style.position = 'absolute';
            img.style.willChange = 'transform';
            // Sin suavizado al ampliar: la foto es de media resolución y el
            // filtro por defecto le da un aspecto lavado al texto. El del
            // navegador para píxeles cercanos es más honesto en movimiento.
            img.style.imageRendering = 'auto';
            img.src = sheet.image;
            host.appendChild(img);
            return img;
        };

        const buildFrame = (host) => {
            const frame = document.createElement('iframe');
            // Sin scripts: es una copia del contenido de un EPUB y no hay razón
            // para ejecutar nada. Es la misma postura que en el iframe real.
            frame.setAttribute('sandbox', '');
            frame.setAttribute('aria-hidden', 'true');
            frame.setAttribute('tabindex', '-1');
            frame.style.position = 'absolute';
            frame.style.border = '0';
            // Se promueve a capa aquí, al montarse, y no cuando empieza a
            // moverse: promover a mitad del primer fotograma del gesto es
            // exactamente lo que se está evitando.
            frame.style.willChange = 'transform';
            frame.srcdoc = withStyles(sheet.html, sheet.css);

            host.appendChild(frame);
            return frame;
        };

        framesRef.current = [build(flatRef.current), build(backRef.current)];

        // Copias nuevas: cualquier pliegue que quedara a medias estaría mostrando
        // ya otra página. Se retira.
        controllerRef?.current?.hide?.();
    }, [sheet?.html, sheet?.css, sheet?.image, controllerRef]);

    /**
     * Coloca las copias sobre la página visible.
     *
     * Cada copia es el capítulo entero, mucho más ancho que la pantalla; se
     * mueve para que la columna que toca caiga en el origen del recuadro. Esto sí
     * corre en cada página, y no cuesta nada: son cuatro propiedades.
     */
    useEffect(() => {
        if (!sheet) return;

        // La foto es de la pantalla entera, así que lo que hay que descontar es
        // dónde empieza la hoja dentro de ella. La copia de HTML es el capítulo
        // entero, y lo que se descuenta es dónde empieza la columna. Son dos
        // orígenes distintos y por eso no se puede usar el mismo par de números.
        const ancho = sheet.image ? sheet.imageWidth : sheet.frameWidth;
        const alto = sheet.image ? sheet.imageHeight : sheet.frameHeight;
        const x = sheet.image ? sheet.imageOffsetX : sheet.offsetX;
        const y = sheet.image ? sheet.imageOffsetY : sheet.offsetY;

        framesRef.current.forEach((frame) => {
            if (!frame) return;
            frame.style.width = `${ancho}px`;
            frame.style.height = `${alto}px`;
            frame.style.left = `${-x}px`;
            frame.style.top = `${-y}px`;
        });
    }, [sheet]);

    // El tema se lee de una referencia: cambia muy de vez en cuando y el efecto
    // que registra el mando no debe volver a montarse por ello, que dejaría el
    // pliegue sin controlador a mitad de gesto.
    /**
     * Color del papel, para teñir el dorso.
     *
     * **El dorso no es oscuro: es del color de la página.** Lo que se ve al
     * volver una hoja es el reverso del mismo papel, con la tinta traspasando
     * apenas. Pintarlo de negro solo funcionaba con el tema oscuro puesto; con el
     * tema Papel se vería una mancha negra en mitad de la hoja.
     */
    const tinteRef = useRef(tinte);
    tinteRef.current = tinte;

    // Igual que el tema: por referencia, para que cambiar el aviso no vuelva a
    // montar el mando a mitad de gesto.
    const onStuckRef = useRef(onStuck);
    onStuckRef.current = onStuck;

    useEffect(() => {
        if (!controllerRef) return undefined;

        let frame = 0;
        let shown = 0;
        // Dónde está el dedo y qué esquina se agarró. El pliegue ya no se
        // describe con un número: se describe con un punto.
        let dedo = { x: width, y: height };
        let rincon = 'bottom-right';
        /**
         * Armado: la copia tapa la pantalla aunque no haya nada doblado.
         *
         * Es lo que permite cambiar de página **por debajo** sin que se vea. Sin
         * esto, bajo la hoja levantada aparecía la misma página que encima —con
         * un solo iframe, epub.js no tiene la página nueva hasta que el giro se
         * confirma— y el efecto era una página duplicada, la mitad al revés.
         */
        let armado = false;
        /**
         * Perro guardián del armado.
         *
         * Mientras el pliegue está armado, la copia **tapa la pantalla entera**.
         * Eso es lo que permite cambiar de página por debajo sin que se vea, y es
         * también lo que hace que un fallo aquí no se note como un fallo: se nota
         * como que el libro se ha congelado. Pasó —y había que salir del libro y
         * volver a entrar—, porque cualquier gesto que muriera sin avisar dejaba
         * la copia puesta para siempre.
         *
         * Así que el armado caduca. Si en este tiempo nadie ha rematado el gesto,
         * se destapa solo: peor es quedarse mirando una página que ya no existe.
         */
        let guardian = 0;
        const vigilar = () => {
            clearTimeout(guardian);
            guardian = setTimeout(() => {
                if (!armado) return;
                armado = false;
                /**
                 * **Aquí estaba el congelado.**
                 *
                 * Esto llamaba a `paint(0, 'next')`, de cuando el pliegue se
                 * describía con un número. Al pasar al doblado por esquina, `paint`
                 * empezó a esperar un punto, y ese `0` daba una geometría en `NaN`:
                 * un `clip-path` con `NaN` no es válido, el navegador lo ignora, y
                 * la copia se quedaba **sin recortar y a plena opacidad, tapando la
                 * pantalla entera**.
                 *
                 * Desde fuera eso es exactamente lo que se veía: el libro clavado
                 * en una página, sin responder al dedo, y había que salir y volver
                 * a entrar. No era el peso del capítulo: era el propio mecanismo de
                 * rescate el que dejaba el lector inservible.
                 */
                paint(reposo(rincon), rincon);
                onStuckRef.current?.();
            }, ARMADO_MAX_MS);
        };

        /**
         * Pinta el pliegue con el dedo en un punto.
         *
         * El estado ya no es «cuánto progreso», es **dónde está el dedo**: es lo
         * que permite que el doblez salga en diagonal y que la esquina acabe
         * justo debajo del dedo, como el papel. Ver `pageCorner.js`.
         */
        const paint = (punto, esquina) => {
            dedo = punto;
            rincon = esquina;
            const state = cornerState(punto, width, height, esquina);
            shown = state.progreso;

            if (rootRef.current) {
                // Ver `OPACIDAD_FRIA`: en reposo se queda casi transparente en vez
                // de oculto, para que el WebView ya lo haya rasterizado cuando el
                // dedo se apoye.
                rootRef.current.style.opacity = (armado || state.visible) ? '1' : String(OPACIDAD_FRIA);
            }
            if (flatRef.current) {
                flatRef.current.style.clipPath = state.flatClip;
            }
            if (backRef.current) {
                backRef.current.style.clipPath = state.backClip;
                backRef.current.style.transformOrigin = state.backOrigin;
                backRef.current.style.transform = state.backTransform;
            }
            if (shadeRef.current) {
                /**
                 * El reverso del papel, teñido y con su luz.
                 *
                 * Dos capas en el mismo elemento: encima el modelado —claro junto
                 * al doblez, que es lo más levantado, y oscuro hacia el filo
                 * suelto— y debajo el color de la página casi opaco. Ese tinte es
                 * lo que convierte el texto reflejado en tinta que traspasa: sin
                 * él, el dorso se lee tan bien como la página de debajo y el ojo
                 * ve dos textos peleándose en vez de una hoja volviéndose.
                 */
                shadeRef.current.style.clipPath = state.shadeClip;
                shadeRef.current.style.background = [
                    'linear-gradient(to bottom right,'
                        + ' rgba(255,255,255,.10) 0%, rgba(0,0,0,.05) 45%, rgba(0,0,0,.22) 100%)',
                    tinteRef.current,
                ].join(', ');
                shadeRef.current.style.opacity = state.visible ? '0.88' : '0';
            }
            if (creaseRef.current) {
                // El filo se pinta como una línea larga girada sobre el punto
                // medio: el recorte del dorso la corta donde tiene que acabar.
                const { crease } = state;
                if (crease) {
                    creaseRef.current.style.width = `${crease.largo}px`;
                    creaseRef.current.style.left = `${crease.x - crease.largo / 2}px`;
                    creaseRef.current.style.top = `${crease.y - 1.5}px`;
                    creaseRef.current.style.height = '3px';
                    creaseRef.current.style.transform = `rotate(${crease.angulo}deg)`;
                    creaseRef.current.style.background = crease.gradient;
                }
                creaseRef.current.style.opacity = state.visible ? '1' : '0';
            }
            if (shadowRef.current) {
                // La sombra que el triángulo levantado proyecta sobre la página
                // nueva: el mismo recorte, desplazado y difuminado.
                shadowRef.current.style.clipPath = state.shadeClip;
                shadowRef.current.style.opacity = state.visible ? '1' : '0';
            }
        };

        /**
         * Lleva el pliegue de donde está hasta el final y lo retira.
         *
         * Es lo que remata el gesto. La hoja no puede desaparecer a medio doblar
         * —eso es lo que se veía: un pliegue clavado en la pantalla— ni saltar de
         * golpe al otro lado. La página de debajo ya cambió antes de empezar
         * esto, y las copias siguen teniendo la página vieja, así que la
         * animación sigue contando la verdad mientras dura.
         */
        /**
         * Lleva el dedo imaginario de donde está hasta otro punto.
         *
         * Se interpola el **punto**, no el progreso: así la esquina recorre una
         * línea recta hasta su destino, que es lo que hace una hoja soltada, y no
         * una trayectoria rara que sale de mezclar ángulos.
         */
        const animate = (destino, esquina, done) => {
            cancelAnimationFrame(frame);
            const desde = dedo;
            const distancia = Math.hypot(destino.x - desde.x, destino.y - desde.y);
            const start = performance.now();
            const span = Math.max(90, Math.min(320, distancia * 0.55));

            const step = (now) => {
                const t = Math.min(1, (now - start) / span);
                // Desacelera al final: el papel no se para en seco.
                const eased = 1 - (1 - t) ** 3;
                paint({
                    x: desde.x + (destino.x - desde.x) * eased,
                    y: desde.y + (destino.y - desde.y) * eased,
                }, esquina);
                if (t < 1) { frame = requestAnimationFrame(step); return; }
                done?.();
            };

            frame = requestAnimationFrame(step);
        };

        /** La esquina de partida: con el dedo ahí, la hoja está entera y plana. */
        const reposo = (esquina) => {
            const puntos = {
                'bottom-right': { x: width, y: height },
                'top-right': { x: width, y: 0 },
                'bottom-left': { x: 0, y: height },
                'top-left': { x: 0, y: 0 },
            };
            return puntos[esquina] || puntos['bottom-right'];
        };

        /** El destino de una hoja del todo vuelta: la esquina opuesta. */
        const destinoFinal = (esquina) => {
            const opuestas = {
                'bottom-right': { x: -width * 0.1, y: height },
                'top-right': { x: -width * 0.1, y: 0 },
                'bottom-left': { x: width * 1.1, y: height },
                'top-left': { x: width * 1.1, y: 0 },
            };
            return opuestas[esquina] || opuestas['bottom-right'];
        };

        controllerRef.current = {
            /**
             * Tapa la pantalla con la página que se va, sin doblar nada todavía.
             *
             * Con el doblez en el borde, la copia plana ocupa la hoja entera: lo
             * que se ve es exactamente lo que ya había. A partir de aquí se puede
             * cambiar de página por debajo sin que se note, y al mover el dedo la
             * hoja se levanta y deja ver la nueva.
             */
            arm(direction, punto) {
                cancelAnimationFrame(frame);
                armado = true;
                const esquina = esquinaDe(direction, punto?.y ?? height, height);
                paint(reposo(esquina), esquina);
                vigilar();
            },
            /** ¿Está tapando la pantalla? */
            armed: () => armado,
            /** Sigue al dedo, fotograma a fotograma. */
            set(punto) {
                cancelAnimationFrame(frame);
                paint(punto, rincon);
                // Mientras el dedo se mueve, el gesto está vivo: el guardián
                // espera. Solo salta si de verdad nadie está conduciendo esto.
                if (armado) vigilar();
            },
            /** Remata el doblado y avisa al terminar. */
            finish(direction, done) {
                animate(destinoFinal(rincon), rincon, done);
            },
            /**
             * Devuelve la hoja a su sitio y avisa.
             *
             * Al llegar a cero la copia vuelve a tapar la pantalla entera, que es
             * cuando quien llama puede deshacer el cambio de página sin que se
             * vea nada.
             */
            cancel(direction, done) {
                animate(reposo(rincon), rincon, done);
            },
            /** Destapa la pantalla. Después de esto manda la página de verdad. */
            disarm() {
                cancelAnimationFrame(frame);
                clearTimeout(guardian);
                armado = false;
                paint(reposo(rincon), rincon);
            },
            /** La retira sin animar, para cuando la página cambia por otra vía. */
            hide() {
                cancelAnimationFrame(frame);
                clearTimeout(guardian);
                armado = false;
                paint(reposo(rincon), rincon);
            },
        };

        // El estado inicial se escribe también en el DOM, no solo en el atributo
        // `style` del JSX: al volver a montarse el nodo conserva lo que le
        // escribimos a mano la última vez, y React no lo reescribe porque para él
        // la propiedad no ha cambiado. Ahí se quedaba el pliegue clavado.
        paint(reposo('bottom-right'), 'bottom-right');

        return () => {
            cancelAnimationFrame(frame);
            clearTimeout(guardian);
            controllerRef.current = null;
        };
    }, [controllerRef, width, height]);

    return (
        <div className="fold" ref={rootRef} aria-hidden="true" style={{ opacity: OPACIDAD_FRIA }}>
            {/* Sombra que la hoja doblada proyecta sobre la página nueva. Va
                debajo de las copias: es lo que hay entre las dos hojas. */}
            <span className="fold-shadow" ref={shadowRef} />

            {/* La parte de la hoja vieja que sigue plana. */}
            <span className="fold-flat" ref={flatRef} style={{ width, height }} />

            {/* El dorso: la misma página reflejada sobre la línea del doblez. */}
            <span className="fold-back" ref={backRef} style={{ width, height }} />

            {/* Sombreado del dorso, encima del reflejo. */}
            <span className="fold-shade" ref={shadeRef} />

            {/* El filo del doblez, lo último: es lo que tiene que quedar por
                encima de todo, como la arista de una hoja doblada. */}
            <span className="fold-crease" ref={creaseRef} />
        </div>
    );
}
