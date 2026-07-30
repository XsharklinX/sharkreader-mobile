import { describe, it, expect } from 'vitest';
import { withStyles } from './PageFold.jsx';

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
