/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import PageFold, { withStyles } from './PageFold.jsx';

describe('withStyles', () => {
    it('mete el CSS al final de la cabecera', () => {
        const out = withStyles('<html><head><title>a</title></head><body>x</body></html>', 'p{color:red}');
        expect(out).toContain('<title>a</title><style>p{color:red}</style></head>');
    });

    it('gana sobre las hojas del EPUB: va después de ellas', () => {
        // El tema y la tipografía los elige el lector, así que sus reglas tienen
        // que aplicarse por encima de lo que traiga el libro.
        const out = withStyles('<html><head><link href="epub.css"></head><body></body></html>', 'body{font-size:20px}');
        expect(out.indexOf('epub.css')).toBeLessThan(out.indexOf('font-size:20px'));
    });

    it('sin cabecera lo pone antes del cuerpo', () => {
        const out = withStyles('<html><body>x</body></html>', 'p{color:red}');
        expect(out).toBe('<html><style>p{color:red}</style><body>x</body></html>');
    });

    it('tolera cabecera en mayúsculas', () => {
        const out = withStyles('<HTML><HEAD></HEAD><BODY></BODY></HTML>', 'a{}');
        expect(out).toContain('<style>a{}</style></HEAD>');
    });

    it('sin CSS devuelve el HTML tal cual', () => {
        expect(withStyles('<p>x</p>', '')).toBe('<p>x</p>');
    });

    it('un fragmento sin estructura recibe el estilo delante', () => {
        expect(withStyles('<p>x</p>', 'a{}')).toBe('<style>a{}</style><p>x</p>');
    });
});

describe('las copias del capítulo', () => {
    const montar = () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const root = createRoot(host);
        const controllerRef = { current: null };
        return { host, root, controllerRef };
    };

    const hoja = (offsetX) => ({
        html: '<html><body><p>capítulo</p></body></html>',
        css: 'p{color:#000}',
        offsetX,
        offsetY: 0,
        frameWidth: 30000,
        frameHeight: 600,
    });

    it('pasar de página solo las desplaza: no las vuelve a montar', () => {
        // **Esto es el pliegue en blanco.** El capítulo entero pesa más de un
        // mega en `srcdoc`; volver a montarlo en cada página dejaba las copias
        // sin pintar durante cientos de milisegundos, justo cuando el dedo se
        // apoya. Lo que cambia al pasar página no es el documento, es qué columna
        // se enseña.
        const { host, root, controllerRef } = montar();

        act(() => {
            root.render(<PageFold sheet={hoja(0)} width={400} height={600} controllerRef={controllerRef} />);
        });
        const antes = [...host.querySelectorAll('iframe')];
        expect(antes).toHaveLength(2);

        act(() => {
            root.render(<PageFold sheet={hoja(1200)} width={400} height={600} controllerRef={controllerRef} />);
        });
        const despues = [...host.querySelectorAll('iframe')];

        expect(despues[0]).toBe(antes[0]);
        expect(despues[1]).toBe(antes[1]);
        expect(despues[0].style.left).toBe('-1200px');

        act(() => root.unmount());
        host.remove();
    });

    it('cambiar de capítulo sí las monta de nuevo', () => {
        // Ahí el documento es otro y no hay nada que reaprovechar.
        const { host, root, controllerRef } = montar();

        act(() => {
            root.render(<PageFold sheet={hoja(0)} width={400} height={600} controllerRef={controllerRef} />);
        });
        const antes = [...host.querySelectorAll('iframe')];

        act(() => {
            root.render(<PageFold
                sheet={{ ...hoja(0), html: '<html><body><p>otro</p></body></html>' }}
                width={400}
                height={600}
                controllerRef={controllerRef}
            />);
        });
        const despues = [...host.querySelectorAll('iframe')];

        expect(despues[0]).not.toBe(antes[0]);
        expect(despues).toHaveLength(2);

        act(() => root.unmount());
        host.remove();
    });
});
