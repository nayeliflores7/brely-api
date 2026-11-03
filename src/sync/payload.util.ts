import { HttpException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RejectedOpError } from './sync.types.js';

// Valida el payload del outbox con los mismos DTOs que usa el REST
export async function parsePayload<T extends object>(cls: new () => T, payload: unknown): Promise<T> {
  const obj = plainToInstance(cls, payload as object);
  const errors = await validate(obj, { whitelist: true });
  if (errors.length) {
    throw new RejectedOpError(errors.flatMap((e) => Object.values(e.constraints ?? {})).join('; '));
  }
  return obj;
}

// Errores 4xx del servicio (duplicado, no existe...) = rechazo permanente
export async function asRejection<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof HttpException && e.getStatus() < 500) throw new RejectedOpError(e.message);
    throw e;
  }
}