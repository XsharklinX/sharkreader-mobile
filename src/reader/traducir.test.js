import { describe, it, expect, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({ registerPlugin: () => ({}) }));
const { idiomaDe, mensajeDeError, traducirParrafo } = await import('./traducir.js');

describe('traducir', () => {
    it('el idioma sale del texto y no de lo que declara el libro', () => {
        // Con la página entera, como en el lector: hacen falta unas treinta palabras.
        const pagina = 'It is a truth universally acknowledged, that a single man in possession of a good fortune must be in want of a wife. '
            + 'However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed in the minds of the surrounding families.';
        expect(idiomaDe(pagina, 'es')).toBe('en');
    });

    it('sin red para el modelo, lo explica', () => {
        expect(mensajeDeError(new Error('Failed to download model: no wifi'), 'en')).toMatch(/descargar ese idioma una vez/);
    });

    it('no traduce al mismo idioma', async () => {
        await expect(traducirParrafo({ traduccion: {}, texto: 'Hola', de: 'es', ajustes: { a: 'es' } }))
            .rejects.toThrow(/ya está en español/);
    });

    it('pide la traducción con los ajustes del usuario', async () => {
        const traduccion = { traducir: vi.fn(async () => ['Hola']) };
        const t = await traducirParrafo({ traduccion, texto: 'Hello', de: 'en', ajustes: { a: 'es', soloWifi: false } });
        expect(t).toBe('Hola');
        expect(traduccion.traducir).toHaveBeenCalledWith('en', 'es', ['Hello'], { soloWifi: false });
    });
});
