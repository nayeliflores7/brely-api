import { afterEach, describe, expect, it, vi } from 'vitest';

describe('API_ENV', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  const load = async () => (await import('./app-version.js')).API_ENV;

  it('en producción no muestra nada', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(await load()).toBe('');
  });

  it('en desarrollo muestra DEV', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(await load()).toBe('DEV');
  });

  it('sin definir se considera desarrollo, para que se note', async () => {
    vi.stubEnv('NODE_ENV', '');
    expect(await load()).toBe('DEV');
  });
});
