import { describe, it, expect } from 'vitest';
import { parseGoTo, goToHint } from './navigation.js';

describe('parseGoTo', () => {
    it('interpreta un número suelto como localización, contando desde 1', () => {
        // El usuario ve «120 / 340» abajo, así que 120 es la que ve, no la 121.
        expect(parseGoTo('120', 340)).toEqual({
            kind: 'location',
            value: 119,
            label: 'Posición 120 de 340',
        });
    });

    it('interpreta un porcentaje', () => {
        expect(parseGoTo('35%', 340)).toMatchObject({ kind: 'percent', value: 0.35 });
        expect(parseGoTo('35 %', 340)).toMatchObject({ kind: 'percent', value: 0.35 });
    });

    it('acepta la coma decimal, que es la que trae el teclado en español', () => {
        expect(parseGoTo('12,5%', 340)).toMatchObject({ kind: 'percent', value: 0.125 });
    });

    it('reescala «página de total» al mapa actual', () => {
        // 12 de 340 en la edición del usuario → mismo punto proporcional aquí,
        // aunque nuestro total sea otro.
        const result = parseGoTo('12/340', 500);
        expect(result.kind).toBe('percent');
        expect(result.value).toBeCloseTo(11 / 340, 5);
        expect(result.label).toBe('Página 12 de 340');
    });

    it('rechaza lo que no se entiende en vez de saltar a ciegas', () => {
        expect(parseGoTo('', 340)).toBeNull();
        expect(parseGoTo('capítulo tres', 340)).toBeNull();
        expect(parseGoTo('12abc', 340)).toBeNull();
    });

    it('rechaza porcentajes imposibles', () => {
        expect(parseGoTo('140%', 340)).toBeNull();
    });

    it('rechaza una localización mayor que el total', () => {
        expect(parseGoTo('900', 340)).toBeNull();
    });

    it('acepta cualquier localización si el mapa aún no está calculado', () => {
        // Durante los primeros segundos el total es 0; bloquear el campo ahí
        // sería castigar al usuario por una tarea de fondo que no ve.
        expect(parseGoTo('900', 0)).toMatchObject({ kind: 'location', value: 899 });
    });

    it('rechaza la posición cero: el usuario cuenta desde uno', () => {
        expect(parseGoTo('0', 340)).toBeNull();
    });

    it('rechaza una página fuera de su propio total', () => {
        expect(parseGoTo('400/340', 500)).toBeNull();
        expect(parseGoTo('12/0', 500)).toBeNull();
    });
});

describe('goToHint', () => {
    it('promete un rango solo cuando lo conoce', () => {
        expect(goToHint(340)).toContain('1–340');
        expect(goToHint(0)).not.toContain('–');
    });
});
