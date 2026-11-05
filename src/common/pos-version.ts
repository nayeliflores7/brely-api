import { HttpException } from '@nestjs/common';

/** El POS manda su versión en cada llamada; la API decide si la acepta. */
export const POS_VERSION_HEADER = 'x-brely-pos-version';

const parse = (version: string | undefined | null) => {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(String(version ?? '').trim());
  return match ? match.slice(1, 4).map(Number) : [0, 0, 0];
};

/** -1, 0 o 1, como cualquier comparación. Sin versión o con una ilegible cuenta como 0.0.0. */
export function compareVersions(a: string | undefined | null, b: string | undefined | null): number {
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i++) {
    if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  }
  return 0;
}

/** La mínima que acepta la API. Se sube en el .env cuando un cambio deja de servir a los POS anteriores. */
export function minPosVersion(): string {
  return process.env['MIN_POS_VERSION']?.trim() || '0.0.0';
}

/** 426: el POS es más viejo de lo que la API soporta. Sus datos se quedan en el equipo hasta que se actualice. */
export function assertPosVersion(version: string | undefined | null, min = minPosVersion()): void {
  if (compareVersions(version, min) < 0) {
    throw new HttpException({ message: 'POS update required', minVersion: min, statusCode: 426 }, 426);
  }
}
