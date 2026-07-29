import { describe, it, expect } from 'vitest';
import { ACHIEVEMENTS, checkNewAchievements, isAchievementVisible } from '../core/achievements.js';
import { buildAchievementContext } from './achievementContext.js';

/**
 * Estos tests existen por un fallo concreto: el contexto se montaba a mano como
 * `{ books, stats }`, y las tres condiciones que leen `vocabulary.length`
 * lanzaban un TypeError dentro de un efecto de React. La aplicación se
 * desmontaba entera y quedaba una pantalla en oscuro, sin ningún mensaje.
 *
 * La comprobación importante es la primera: **todas** las condiciones tienen
 * que poder evaluarse con el contexto de una instalación recién estrenada.
 */

describe('contexto de logros', () => {
    it('ninguna de las 59 condiciones lanza con una app recién instalada', () => {
        const context = buildAchievementContext([], {});
        ACHIEVEMENTS.forEach((achievement) => {
            expect(
                () => achievement.condition(context),
                `la condición de "${achievement.id}" lanzó con el contexto vacío`
            ).not.toThrow();
        });
    });

    it('ninguna regla de visibilidad lanza con el contexto vacío', () => {
        const context = buildAchievementContext([], {});
        ACHIEVEMENTS.forEach((achievement) => {
            expect(
                () => isAchievementVisible(achievement, context, {}),
                `la visibilidad de "${achievement.id}" lanzó con el contexto vacío`
            ).not.toThrow();
        });
    });

    it('checkNewAchievements no lanza y no desbloquea nada al empezar', () => {
        const context = buildAchievementContext([], {});
        expect(() => checkNewAchievements(context, {})).not.toThrow();
        expect(checkNewAchievements(context, {})).toEqual([]);
    });

    it('aporta las claves que las condiciones necesitan', () => {
        const context = buildAchievementContext();
        expect(context).toMatchObject({
            books: [], vocabulary: [], addons: {}, addonConfig: {}, yearlyGoal: 0,
        });
        expect(context.stats).toEqual({});
    });

    it('tolera argumentos con el tipo equivocado', () => {
        const context = buildAchievementContext(null, null);
        expect(context.books).toEqual([]);
        expect(context.stats).toEqual({});
        expect(() => checkNewAchievements(context, {})).not.toThrow();
    });

    it('desbloquea con datos reales de lectura', () => {
        const context = buildAchievementContext(
            [{ id: '1', lastReadDate: Date.now(), isFinished: true }],
            { timeRead: 120, streak: 8 }
        );
        const unlocked = checkNewAchievements(context, {}).map((a) => a.id);

        expect(unlocked).toContain('first_open');
        expect(unlocked).toContain('first_finish');
        expect(unlocked).toContain('streak_7');
        expect(unlocked).toContain('time_60');
    });

    it('no vuelve a desbloquear lo que ya está conseguido', () => {
        const context = buildAchievementContext(
            [{ id: '1', lastReadDate: Date.now() }],
            { timeRead: 120 }
        );
        const unlocked = checkNewAchievements(context, { first_open: { unlockedAt: 1 } });
        expect(unlocked.map((a) => a.id)).not.toContain('first_open');
    });

    it('extra sobrescribe los valores por defecto de móvil', () => {
        const context = buildAchievementContext([], {}, { vocabulary: ['uno', 'dos'] });
        expect(context.vocabulary).toHaveLength(2);
    });
});
