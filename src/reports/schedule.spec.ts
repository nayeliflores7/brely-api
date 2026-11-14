import { buildReport, scheduleInsights, type ReportSale } from './report.builder.js';

// Cuatro semanas completas, de lunes 12 de octubre a domingo 8 de noviembre, en la hora de México (UTC-6)
const options = {
  timeZone: 'America/Mexico_City',
  includeCosts: false,
  from: new Date('2026-10-12T06:00:00Z'),
  to: new Date('2026-11-09T05:59:59Z'),
  terminalLabel: () => 'Caja',
};

const sale = (soldAt: string, total: number, status = 'completed'): ReportSale => ({
  terminalId: 't1',
  soldAt: new Date(soldAt),
  status,
  subtotal: total,
  tax: 0,
  total,
  discount: 0,
  items: [],
  payments: [{ method: 'cash', amount: total }],
});

const schedule = (sales: ReportSale[], extra: object = {}) => buildReport(sales, [], { ...options, ...extra }).schedule;

describe('estadísticas de cuándo se vende', () => {
  it('cuenta el día y la hora en la zona horaria del negocio, no en UTC', () => {
    // Miércoles 4 de noviembre, 2:00 p. m. en México (20:00 UTC)
    const result = schedule([sale('2026-11-04T20:00:00Z', 100)]);

    expect(result.weekdays[2]).toMatchObject({ index: 2, count: 1, total: 100 });
    expect(result.hours[14]).toMatchObject({ hour: 14, count: 1, total: 100 });
    expect(result.heatmap[2][14]).toBe(100);
  });

  it('una venta de la noche UTC todavía es del día anterior en México', () => {
    // Jueves 5 a las 03:30 UTC son las 9:30 p. m. del miércoles 4 en México
    const result = schedule([sale('2026-11-05T03:30:00Z', 100)]);

    expect(result.weekdays[2].count).toBe(1);
    expect(result.weekdays[3].count).toBe(0);
    expect(result.hours[21].count).toBe(1);
  });

  it('el promedio de un día se saca entre las veces que ese día se repite, también las que no vendió', () => {
    // Cuatro sábados vendiendo $1,000 y un solo martes vendiendo $400 de los cuatro que hubo
    const sales = [
      ...['2026-10-17', '2026-10-24', '2026-10-31', '2026-11-07'].map((day) => sale(`${day}T19:00:00Z`, 1000)),
      sale('2026-10-13T16:00:00Z', 400),
    ];
    const result = schedule(sales);

    expect(result.days).toBe(28);
    expect(result.weekdays.map((d) => d.occurrences)).toEqual([4, 4, 4, 4, 4, 4, 4]);
    expect(result.weekdays[5]).toMatchObject({ total: 4000, averagePerDay: 1000 });
    expect(result.weekdays[1]).toMatchObject({ total: 400, averagePerDay: 100 });
    expect(result.weekdays[0]).toMatchObject({ total: 0, averagePerDay: 0 });
  });

  it('las ventas canceladas no cuentan', () => {
    const result = schedule([sale('2026-11-04T20:00:00Z', 100, 'cancelled')]);

    expect(result.hours.every((h) => h.count === 0)).toBe(true);
    expect(result.weekdays.every((d) => d.total === 0)).toBe(true);
  });

  it('un periodo de menos de una semana no inventa promedios de los días que no tuvo', () => {
    // Un solo día: miércoles 4 de noviembre
    const result = schedule([sale('2026-11-04T20:00:00Z', 100)], {
      from: new Date('2026-11-04T06:00:00Z'),
      to: new Date('2026-11-05T05:59:59Z'),
    });

    expect(result.days).toBe(1);
    expect(result.weekdays[2]).toMatchObject({ occurrences: 1, averagePerDay: 100 });
    expect(result.weekdays[0]).toMatchObject({ occurrences: 0, averagePerDay: null });
  });

  it('suma las ventas de la misma hora de distintos días en una sola barra', () => {
    const result = schedule([sale('2026-11-04T20:10:00Z', 100), sale('2026-11-02T20:50:00Z', 50), sale('2026-11-04T21:10:00Z', 70)]);

    expect(result.hours[14]).toMatchObject({ count: 2, total: 150 });
    expect(result.hours[15]).toMatchObject({ count: 1, total: 70 });
  });

  it('sin ventas todo queda en cero y no hay nada que concluir', () => {
    const result = schedule([]);

    expect(result.weekdays.every((d) => d.total === 0)).toBe(true);
    expect(result.insights).toEqual({ bestDay: null, quietestDays: null, busiestHour: null, window: null });
  });
});

describe('scheduleInsights', () => {
  const week = (averages: (number | null)[], occurrences = 4) =>
    averages.map((average, index) => ({
      index,
      occurrences: average === null ? 0 : occurrences,
      averagePerDay: average,
      total: (average ?? 0) * occurrences,
    }));
  const hours = (totals: Record<number, number>) => Array.from({ length: 24 }, (_, hour) => ({ hour, total: totals[hour] ?? 0 }));

  it('el día que más vende y el que menos, contra un día promedio', () => {
    // Promedio de un día: (100 + 200 + 300 + 400 + 500 + 600 + 700) / 7 = 400
    const result = scheduleInsights(week([100, 200, 300, 400, 500, 600, 700]), hours({ 10: 1 }));

    expect(result.bestDay).toEqual({ index: 6, averagePerDay: 700 });
    expect(result.quietestDays).toEqual({ indexes: [0], averagePerDay: 100, vsAverage: -75 });
  });

  it('si varios días empatan en lo más flojo, salen todos', () => {
    const result = scheduleInsights(week([0, 500, 0, 500, 500, 500, 0]), hours({ 10: 1 }));

    expect(result.quietestDays).toMatchObject({ indexes: [0, 2, 6], averagePerDay: 0 });
  });

  it('si todos los días venden igual, no hay día flojo que señalar', () => {
    expect(scheduleInsights(week([300, 300, 300, 300, 300, 300, 300]), hours({ 10: 1 })).quietestDays).toBeNull();
  });

  it('los días sin ocurrencias no cuentan', () => {
    const result = scheduleInsights(week([null, 100, null, 300, null, null, null]), hours({ 10: 1 }));

    expect(result.bestDay?.index).toBe(3);
    expect(result.quietestDays?.indexes).toEqual([1]);
  });

  it('la hora en que más se vende', () => {
    expect(scheduleInsights(week([100, 100, 100, 100, 100, 100, 100]), hours({ 9: 50, 13: 300, 18: 120 })).busiestHour).toEqual({ hour: 13, total: 300 });
  });

  it('el horario más corto de horas seguidas que reúne el 80 % de las ventas', () => {
    // 100 en total: de 9 a 12 caen 85
    const result = scheduleInsights(week([1, 1, 1, 1, 1, 1, 1]), hours({ 8: 5, 9: 20, 10: 30, 11: 25, 12: 10, 18: 10 }));

    expect(result.window).toEqual({ from: 9, to: 13, share: 85 });
  });

  it('si casi todo se vende en una hora, el horario es esa hora', () => {
    const result = scheduleInsights(week([1, 1, 1, 1, 1, 1, 1]), hours({ 13: 90, 14: 10 }));

    expect(result.window).toEqual({ from: 13, to: 14, share: 90 });
  });

  it('con dos tramos igual de cortos que llegan al 80 %, se queda con el que más vende', () => {
    // Tres horas seguidas bastan: de 9 a 11 caen 81 y de 10 a 12 caen 82
    const result = scheduleInsights(week([1, 1, 1, 1, 1, 1, 1]), hours({ 9: 18, 10: 31, 11: 32, 12: 19 }));

    expect(result.window).toEqual({ from: 10, to: 13, share: 82 });
  });

  it('si las ventas están muy repartidas, el horario es largo', () => {
    // Cada hora de 8 a 17 vende lo mismo: se necesitan 8 de las 10 horas para el 80 %
    const even = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [8 + i, 10]));
    const result = scheduleInsights(week([1, 1, 1, 1, 1, 1, 1]), hours(even));

    expect(result.window).toMatchObject({ from: 8, to: 16, share: 80 });
  });
});
