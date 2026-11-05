import { HttpException } from '@nestjs/common';
import { assertPosVersion, compareVersions, minPosVersion } from './pos-version.js';

describe('compareVersions', () => {
  it.each([
    ['0.1.0', '0.1.0', 0],
    ['0.1.0', '0.2.0', -1],
    ['1.0.0', '0.9.9', 1],
    ['1.10.0', '1.9.0', 1], // por número, no por texto
    ['1.2.3-beta', '1.2.3', 0],
    [undefined, '0.0.0', 0],
    ['basura', '0.0.1', -1],
  ])('%s contra %s', (a, b, expected) => {
    expect(compareVersions(a as string, b)).toBe(expected);
  });
});

describe('assertPosVersion', () => {
  it('acepta la mínima y las más nuevas', () => {
    expect(() => assertPosVersion('0.2.0', '0.2.0')).not.toThrow();
    expect(() => assertPosVersion('1.0.0', '0.2.0')).not.toThrow();
  });

  it('rechaza con 426 una más vieja y dice cuál es la mínima', () => {
    try {
      assertPosVersion('0.1.0', '0.2.0');
      throw new Error('no rechazó');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(426);
      expect((error as HttpException).getResponse()).toMatchObject({ minVersion: '0.2.0' });
    }
  });

  it('sin versión mínima configurada, acepta todo, incluso un POS que no manda la suya', () => {
    const before = process.env['MIN_POS_VERSION'];
    delete process.env['MIN_POS_VERSION'];
    expect(minPosVersion()).toBe('0.0.0');
    expect(() => assertPosVersion(undefined)).not.toThrow();
    if (before !== undefined) process.env['MIN_POS_VERSION'] = before;
  });
});
