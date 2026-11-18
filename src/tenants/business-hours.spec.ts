import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { businessHoursProblem, minutesOf, type BusinessHours } from './business-hours.js';
import { TenantSettingsDto } from './dto/tenant-settings.dto.js';

const week = (monday: { from: string; to: string }[] = []): BusinessHours => [monday, [], [], [], [], [], []];

describe('businessHoursProblem', () => {
  it('acepta bloques separados en un mismo día', () => {
    expect(
      businessHoursProblem(week([{ from: '09:00', to: '15:00' }, { from: '16:00', to: '19:00' }])),
    ).toBeNull();
  });

  it('acepta una semana sin ningún horario (todo cerrado)', () => {
    expect(businessHoursProblem(week())).toBeNull();
  });

  it('exige los siete días', () => {
    expect(businessHoursProblem([[], []])).toContain('siete días');
    expect(businessHoursProblem(null)).toContain('siete días');
    expect(businessHoursProblem('x')).toContain('siete días');
  });

  it('rechaza horas mal escritas', () => {
    for (const from of ['9:00', '24:00', '09:60', '09-00', '']) {
      expect(businessHoursProblem(week([{ from, to: '19:00' }]))).toContain('HH:MM');
    }
    expect(businessHoursProblem(week([{ from: '09:00', to: 1900 as unknown as string }]))).toContain('HH:MM');
  });

  it('cada bloque cierra después de abrir y no pasa de medianoche', () => {
    expect(businessHoursProblem(week([{ from: '19:00', to: '09:00' }]))).toContain('después de abrir');
    expect(businessHoursProblem(week([{ from: '09:00', to: '09:00' }]))).toContain('después de abrir');
    expect(businessHoursProblem(week([{ from: '20:00', to: '02:00' }]))).toContain('después de abrir');
  });

  it('los bloques de un día van en orden y sin traslaparse', () => {
    expect(businessHoursProblem(week([{ from: '09:00', to: '15:00' }, { from: '14:00', to: '19:00' }]))).toContain('traslapar');
    expect(businessHoursProblem(week([{ from: '16:00', to: '19:00' }, { from: '09:00', to: '15:00' }]))).toContain('orden');
  });

  it('un bloque puede empezar justo cuando termina el anterior', () => {
    expect(businessHoursProblem(week([{ from: '09:00', to: '15:00' }, { from: '15:00', to: '19:00' }]))).toBeNull();
  });

  it('limita los bloques por día', () => {
    const blocks = ['06:00', '08:00', '10:00', '12:00', '14:00'].map((from, i) => ({ from, to: `${7 + i * 2}:30`.padStart(5, '0') }));
    expect(businessHoursProblem(week(blocks))).toContain('hasta 4');
  });

  it('minutesOf', () => {
    expect(minutesOf('00:00')).toBe(0);
    expect(minutesOf('19:05')).toBe(1145);
  });
});

describe('TenantSettingsDto: horario y aviso de cierre', () => {
  const check = async (settings: object) =>
    (await validate(plainToInstance(TenantSettingsDto, settings), { whitelist: true })).map((e) => e.property);

  it('acepta un horario válido y los minutos de aviso', async () => {
    expect(
      await check({ businessHours: week([{ from: '09:00', to: '19:00' }]), closingWarningMinutes: 5 }),
    ).toEqual([]);
  });

  it('rechaza un horario inválido', async () => {
    expect(await check({ businessHours: week([{ from: '19:00', to: '09:00' }]) })).toEqual(['businessHours']);
  });

  it('los minutos de aviso van de 0 a 60, enteros', async () => {
    expect(await check({ closingWarningMinutes: 0 })).toEqual([]);
    expect(await check({ closingWarningMinutes: 60 })).toEqual([]);
    expect(await check({ closingWarningMinutes: 61 })).toEqual(['closingWarningMinutes']);
    expect(await check({ closingWarningMinutes: -1 })).toEqual(['closingWarningMinutes']);
    expect(await check({ closingWarningMinutes: 2.5 })).toEqual(['closingWarningMinutes']);
  });

  it('ambos son opcionales', async () => {
    expect(await check({})).toEqual([]);
  });
});
