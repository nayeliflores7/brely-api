import { registerDecorator, type ValidationOptions } from 'class-validator';

/** Un bloque de atención dentro de un día, en horas del negocio: "09:00" a "15:00". */
export interface HoursBlock {
  from: string;
  to: string;
}

/** El horario de la semana: siete días, de lunes (0) a domingo (6), cada uno con sus bloques. Un día sin bloques es cerrado. */
export type BusinessHours = HoursBlock[][];

export const DAYS_PER_WEEK = 7;
export const MAX_BLOCKS_PER_DAY = 4;
export const MAX_WARNING_MINUTES = 60;
export const DEFAULT_WARNING_MINUTES = 5;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "15:30" → 930 minutos desde la medianoche. */
export const minutesOf = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

/**
 * Por qué un horario no sirve, en palabras para quien lo captura, o null si está bien. Reglas: siete días; cada
 * bloque dentro del mismo día (no hay horarios de madrugada), con la apertura antes del cierre; los bloques de un
 * día en orden y sin traslaparse.
 */
export function businessHoursProblem(value: unknown): string | null {
  if (!Array.isArray(value) || value.length !== DAYS_PER_WEEK) return 'El horario debe tener los siete días de la semana.';
  for (const [day, blocks] of value.entries()) {
    if (!Array.isArray(blocks)) return `El día ${day + 1} no tiene un formato válido.`;
    if (blocks.length > MAX_BLOCKS_PER_DAY) return `Un día puede tener hasta ${MAX_BLOCKS_PER_DAY} bloques de horario.`;
    let previousEnd = -1;
    for (const block of blocks) {
      const { from, to } = (block ?? {}) as Partial<HoursBlock>;
      if (typeof from !== 'string' || typeof to !== 'string' || !TIME.test(from) || !TIME.test(to)) {
        return 'Las horas deben escribirse como HH:MM, por ejemplo 09:00.';
      }
      if (minutesOf(from) >= minutesOf(to)) return 'Cada bloque debe cerrar después de abrir, dentro del mismo día.';
      if (minutesOf(from) < previousEnd) return 'Los bloques de un mismo día no pueden traslaparse y deben ir en orden.';
      previousEnd = minutesOf(to);
    }
  }
  return null;
}

/** Decorador de class-validator: el campo debe ser un horario válido. */
export function IsBusinessHours(options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'isBusinessHours',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate: (value: unknown) => businessHoursProblem(value) === null,
        defaultMessage: (args) => businessHoursProblem(args?.value) ?? 'Horario no válido.',
      },
    });
}
