import { BadRequestException } from '@nestjs/common';
import { ProductsService } from './products.service.js';

const stored = {
  _id: 'p1',
  tenantId: 't',
  price: 100,
  cost: 60,
  unit: 'old',
  categoryId: 'oldcat',
};

function setUp() {
  const calls = { units: [] as string[], categories: [] as string[], applied: [] as any[] };
  const lean = (value: unknown) => ({
    lean: async () => value,
    session: () => ({ lean: async () => value }),
  });
  const model = {
    findOne: () => lean(stored),
    findById: () => ({ session: () => ({ lean: async () => ({ ...stored, stock: 5 }) }) }),
    findOneAndUpdate: (_f: unknown, update: { $set: object }) =>
      lean({ ...stored, ...update.$set }),
    create: async (docs: object[]) => [{ _id: 'p1', toObject: () => ({ _id: 'p1', ...docs[0] }) }],
  };
  const history = { create: async () => [] };
  const service = new ProductsService(
    model as never,
    history as never,
    {
      existsActive: async (_t: string, id: string) => {
        calls.categories.push(id);
        return true;
      },
    } as never,
    {
      exists: async (_t: string, code: string) => {
        calls.units.push(code);
        return true;
      },
    } as never,
    {} as never,
    {
      apply: async (movement: unknown) => {
        calls.applied.push(movement);
      },
    } as never,
    { transaction: (fn: (s: unknown) => unknown) => fn({}) } as never,
    {} as never,
    {} as never,
  );
  return { service, calls };
}

const base = { barcode: 'A', name: 'P', price: 100, cost: 60 };

describe('ProductsService', () => {
  it('rechaza crear con precio menor al costo', async () => {
    const { service } = setUp();

    await expect(service.create('t', { ...base, price: 50 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('valida precio contra el costo guardado al editar solo uno', async () => {
    const { service } = setUp();

    await expect(service.update('t', 'p1', { price: 50 })).rejects.toThrow('below cost');
    await expect(service.update('t', 'p1', { price: 70 })).resolves.toBeTruthy();
  });

  it('permite costo cero con cualquier precio', async () => {
    const { service } = setUp();

    await expect(service.create('t', { ...base, cost: 0, price: 1 })).resolves.toBeTruthy();
  });

  it('un producto conserva su unidad y categoría aunque estén inactivas', async () => {
    const { service, calls } = setUp();

    await service.update('t', 'p1', { name: 'X', unit: 'old', categoryId: 'oldcat' });

    expect(calls.units).toEqual([]);
    expect(calls.categories).toEqual([]);
  });

  it('valida la unidad y la categoría cuando cambian', async () => {
    const { service, calls } = setUp();

    await service.update('t', 'p1', { unit: 'new', categoryId: 'newcat' });

    expect(calls.units).toEqual(['new']);
    expect(calls.categories).toEqual(['newcat']);
  });

  it('registra el stock inicial como movimiento', async () => {
    const { service, calls } = setUp();

    await service.createWithStock('t', { ...base, initialStock: 5 }, 'u');

    expect(calls.applied).toHaveLength(1);
    expect(calls.applied[0]).toMatchObject({ type: 'initial', quantity: 5, createdBy: 'u' });
  });

  it.each([{ initialStock: 0 }, { initialStock: 5, trackStock: false }, {}])(
    'no registra movimiento con %o',
    async (extra) => {
      const { service, calls } = setUp();

      await service.createWithStock('t', { ...base, ...extra }, 'u');

      expect(calls.applied).toEqual([]);
    },
  );
});
