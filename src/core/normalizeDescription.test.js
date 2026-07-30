import { describe, it, expect } from 'vitest';
import { normalizeDescription } from './epubMeta.js';

describe('normalizeDescription', () => {
    it('no pega las frases de dos párrafos', () => {
        // El fallo tal como se vio en la ficha de un libro real: «Una familia
        // poderosa.Un asesino.Un culpable demasiado obvio.»
        const salida = normalizeDescription(
            '<p>Una familia poderosa.</p><p>Un asesino.</p><p>Un culpable demasiado obvio.</p>'
        );
        expect(salida).not.toContain('poderosa.Un');
        expect(salida.split('\n\n')).toEqual([
            'Una familia poderosa.',
            'Un asesino.',
            'Un culpable demasiado obvio.',
        ]);
    });

    it('resuelve las entidades numéricas', () => {
        // `&#160;` se leía tal cual en medio de la sinopsis. Y el espacio duro que
        // produce pasa a espacio normal: dentro de un resumen no significa nada y
        // estorba al repartir el texto en una hoja estrecha.
        const salida = normalizeDescription('oculta.&#160;El asesino');
        expect(salida).toBe(['oculta.', 'El', 'asesino'].join(' '));
        // Comparado por código, porque un espacio duro y uno normal se ven igual:
        // la primera versión de esta prueba tenía uno de los dos y fallaba sin que
        // se notara la diferencia en el mensaje de error.
        expect([...salida].map((c) => c.codePointAt(0))).not.toContain(160);
    });

    it('resuelve las entidades con nombre', () => {
        expect(normalizeDescription('Ni&ntilde;os &amp; libros')).toBe('Niños & libros');
    });

    it('una entidad que no conoce se deja tal cual antes que perder texto', () => {
        expect(normalizeDescription('&pizza; caliente')).toBe('&pizza; caliente');
    });

    it('un salto de línea es un salto, no un párrafo', () => {
        expect(normalizeDescription('Uno<br>Dos')).toBe('Uno\nDos');
    });

    it('las etiquetas de dentro de una frase dejan un espacio', () => {
        expect(normalizeDescription('el <em>Quijote</em> de Cervantes'))
            .toBe('el Quijote de Cervantes');
    });

    it('no deja tres líneas en blanco seguidas', () => {
        expect(normalizeDescription('<p>Uno</p><br><br><p>Dos</p>')).toBe('Uno\n\nDos');
    });

    it('una etiqueta escrita como texto no se convierte en etiqueta y desaparece', () => {
        // Las entidades se resuelven al final justo por esto: si se hiciera antes,
        // `&lt;script&gt;` pasaría a ser una etiqueta y el paso anterior lo
        // borraría, perdiendo texto que el autor escribió a propósito.
        expect(normalizeDescription('usa &lt;script&gt; con cuidado'))
            .toBe('usa <script> con cuidado');
    });

    it('sin sinopsis devuelve cadena vacía', () => {
        expect(normalizeDescription(null)).toBe('');
        expect(normalizeDescription('   ')).toBe('');
    });
});
