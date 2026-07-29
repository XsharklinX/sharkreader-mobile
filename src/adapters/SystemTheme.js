import { registerPlugin, Capacitor } from '@capacitor/core';

const SharkTheme = registerPlugin('SharkTheme');

/**
 * Material You: la interfaz sigue el fondo de pantalla del usuario.
 *
 * La paleta la calcula Android 12 y aquí solo se traduce a variables CSS. Es
 * opcional y viene apagado: la identidad de SharkReader es el azul, y cambiarla
 * sin permiso a quien no lo ha pedido no procede.
 *
 * **No se toca el lector.** Los temas de lectura —sepia, crema, papel— están
 * elegidos por contraste y fatiga visual, no por gusto. Que un fondo de
 * pantalla morado tiña la página del libro sería empeorar la lectura para
 * decorar, que es exactamente al revés de lo que queremos.
 */

/**
 * Variables que se sobrescriben.
 *
 * Solo superficies y acento. Los colores de texto se dejan en paz: los tonos
 * neutros del sistema no garantizan contraste contra nuestras superficies, y
 * un texto que no se lee es peor que un gris que no combina.
 */
export const cssVariablesFor = (colors, dark = true) => {
    if (!colors) return {};

    return dark ? {
        '--accent': colors.accent200,
        '--accent-strong': colors.accent100,
        '--accent-dim': colors.accent700,
        '--bg': colors.neutral900,
        '--surface': colors.neutral800,
        '--surface-2': colors.neutral800,
        '--surface-3': colors.neutral700,
    } : {
        '--accent': colors.accent600,
        '--accent-strong': colors.accent700,
        '--accent-dim': colors.accent100,
        '--bg': colors.neutral0,
        '--surface': colors.neutral50,
        '--surface-2': colors.neutral100,
        '--surface-3': colors.neutral200,
    };
};

/** Lee la paleta del sistema. `available: false` si no hay (Android < 12). */
export const readDynamicColors = async () => {
    if (Capacitor.getPlatform() !== 'android') return { available: false };
    try {
        return await SharkTheme.getDynamicColors();
    } catch {
        return { available: false };
    }
};

/**
 * Aplica o retira la paleta del sistema.
 *
 * Al desactivarla se **borran** las variables en lugar de escribir las nuestras
 * encima: así vuelven a mandar las de la hoja de estilos, incluidas las que
 * cambian con el tema claro u oscuro. Escribir valores fijos aquí congelaría la
 * app en el tema que hubiera en ese momento.
 */
export const applyDynamicColors = (colors, dark) => {
    const root = document.documentElement;
    const variables = cssVariablesFor(colors, dark);

    Object.keys(cssVariablesFor({ }, dark)).forEach((name) => root.style.removeProperty(name));

    Object.entries(variables).forEach(([name, value]) => {
        if (value) root.style.setProperty(name, value);
    });

    root.classList.toggle('material-you', Boolean(colors));
};

export const clearDynamicColors = () => {
    const root = document.documentElement;
    [
        '--accent', '--accent-strong', '--accent-dim',
        '--bg', '--surface', '--surface-2', '--surface-3',
    ].forEach((name) => root.style.removeProperty(name));
    root.classList.remove('material-you');
};
