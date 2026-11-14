import { readFileSync } from 'fs';

/**
 * El ambiente, para que se vea en las pantallas: "DEV" en pruebas y vacío en producción.
 * APP_ENV lo fija explícitamente (en la nube de pruebas, DEV; en producción, vacía u omitida junto con
 * NODE_ENV=production). Sin APP_ENV, producción es NODE_ENV=production y todo lo demás es desarrollo, para que se note.
 */
export const API_ENV: string = (() => {
  const explicit = process.env['APP_ENV'];
  if (explicit !== undefined && explicit.trim() !== '') return explicit.trim().toUpperCase();
  return process.env['NODE_ENV'] === 'production' ? '' : 'DEV';
})();

/** La versión de esta API, del package.json: no se escribe a mano en ningún otro lado. */
export const API_VERSION: string = (() => {
  try {
    return JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
})();
