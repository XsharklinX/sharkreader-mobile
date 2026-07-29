import { LocalNotifications } from '@capacitor/local-notifications';

/**
 * Notificaciones locales: recordatorio diario y resumen semanal.
 *
 * Sin servidor y sin push — todo se programa en el dispositivo, que es lo
 * coherente con una app que no tiene cuentas ni manda nada a ningún sitio.
 *
 * Desde Android 13 el permiso hay que pedirlo explícitamente. Se pide **cuando
 * el usuario activa los recordatorios**, no al arrancar: un diálogo de permisos
 * nada más abrir una app es la forma más rápida de que te lo denieguen para
 * siempre.
 */

export const REMINDER_ID = 1001;
export const WEEKLY_SUMMARY_ID = 1002;

export const createLocalNotifier = () => ({
    async requestPermission() {
        try {
            const status = await LocalNotifications.checkPermissions();
            if (status.display === 'granted') return true;
            const result = await LocalNotifications.requestPermissions();
            return result.display === 'granted';
        } catch {
            return false;
        }
    },

    /**
     * @param {{id: number, title: string, body: string, at?: Date, every?: string}} options
     */
    async schedule({ id, title, body, at, every }) {
        await LocalNotifications.schedule({
            notifications: [{
                id,
                title,
                body,
                // Sin smallIcon explícito: el plugin cae al icono de la app, que
                // es lo que queremos. Referenciar un drawable que no existe haría
                // fallar la notificación en tiempo de ejecución.
                schedule: at ? { at, every, allowWhileIdle: true } : undefined,
            }],
        });
    },

    async cancel(id) {
        await LocalNotifications.cancel({ notifications: [{ id }] }).catch(() => {});
    },

    /** Recordatorio diario a la hora elegida. */
    async scheduleDailyReminder(hour = 21, minute = 0) {
        const at = new Date();
        at.setHours(hour, minute, 0, 0);
        // Si la hora de hoy ya pasó, el primero es mañana.
        if (at <= new Date()) at.setDate(at.getDate() + 1);

        await this.cancel(REMINDER_ID);
        await this.schedule({
            id: REMINDER_ID,
            title: 'Un rato de lectura',
            body: 'Tu racha sigue viva si lees hoy.',
            at,
            every: 'day',
        });
    },

    /** Resumen semanal, los domingos por la tarde. */
    async scheduleWeeklySummary(hour = 19) {
        const at = new Date();
        const daysUntilSunday = (7 - at.getDay()) % 7 || 7;
        at.setDate(at.getDate() + daysUntilSunday);
        at.setHours(hour, 0, 0, 0);

        await this.cancel(WEEKLY_SUMMARY_ID);
        await this.schedule({
            id: WEEKLY_SUMMARY_ID,
            title: 'Tu semana de lectura',
            body: 'Mira cuánto has leído estos siete días.',
            at,
            every: 'week',
        });
    },

    async cancelAll() {
        await this.cancel(REMINDER_ID);
        await this.cancel(WEEKLY_SUMMARY_ID);
    },
});
