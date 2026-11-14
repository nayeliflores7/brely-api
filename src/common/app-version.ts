import { readFileSync } from 'fs';

/**
 * El ambiente, para que se vea en las pantallas: vacío en producción y "DEV" en cualquier otro caso. Producción es
 * NODE_ENV=production; si no se define, se considera desarrollo y se nota.
 */
export const API_ENV: string = process.env['NODE_ENV'] === 'production' ? '' : 'DEV';

/** La versión de esta API, del package.json: no se escribe a mano en ningún otro lado. */
export const API_VERSION: string = (() => {
  try {
    return JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
})();
