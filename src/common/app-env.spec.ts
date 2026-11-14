import { afterEach, describe, expect, it, vi } from 'vitest';

describe('API_ENV', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  const load = async () => (await import('./app-version.js')).API_ENV;

  it('en producción no muestra nada', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_ENV', '');
    expect(await load()).toBe('');
  });

  it('APP_ENV manda sobre NODE_ENV: la nube de pruebas corre en production y dice DEV', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_ENV', 'dev');
    expect(await load()).toBe('DEV');
  });

  it('en desarrollo muestra DEV', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('APP_ENV', '');
    expect(await load()).toBe('DEV');
  });

  it('sin definir se considera desarrollo, para que se note', async () => {
    vi.stubEnv('NODE_ENV', '');
    vi.stubEnv('APP_ENV', '');
    expect(await load()).toBe('DEV');
  });
});
