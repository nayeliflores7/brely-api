import { ConflictException } from '@nestjs/common';
import { AuthService } from './auth.service.js';

const owner = { fullName: 'Ana', email: 'ana@example.com', password: 'secreto-123', pin: '123456' };

function setUp(opts: { emailTaken?: boolean; userFails?: boolean } = {}) {
  const calls = { tenants: [] as unknown[], users: [] as unknown[], removed: [] as string[] };
  const tenant = { _id: 't1', toObject: () => ({ _id: 't1', name: 'Tienda' }) };
  const service = new AuthService(
    {
      emailExists: async () => !!opts.emailTaken,
      create: async (_tenantId: string, data: unknown) => {
        if (opts.userFails) throw new Error('fallo');
        calls.users.push(data);
        return { _id: 'u1', fullName: 'Ana' };
      },
    } as never,
    { emailExists: async () => false } as never,
    { seedSystemRoles: async () => [{ _id: 'owner', permissions: ['admin.access'] }] } as never,
    {
      create: async (data: unknown) => {
        calls.tenants.push(data);
        return tenant;
      },
      remove: async (id: string) => {
        calls.removed.push(id);
      },
    } as never,
    { signAsync: async () => 'token' } as never,
    { record: async () => undefined } as never,
  );
  return { service, calls };
}

describe('AuthService.createTenant', () => {
  it('crea el negocio con su propietario, sin emitir una sesión', async () => {
    const { service, calls } = setUp();

    const result = await service.createTenant({ name: 'Tienda', taxId: 'XAXX', owner });

    expect(result).toEqual({ _id: 't1', name: 'Tienda' });
    expect(result).not.toHaveProperty('accessToken');
    expect(calls.tenants).toEqual([{ name: 'Tienda', taxId: 'XAXX' }]);
    expect(calls.users).toEqual([{ ...owner, roleId: 'owner' }]);
  });

  it('no crea nada si el correo ya está en uso', async () => {
    const { service, calls } = setUp({ emailTaken: true });

    await expect(service.createTenant({ name: 'Tienda', owner })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(calls.tenants).toEqual([]);
  });

  it('deshace el negocio si no se pudo crear el propietario', async () => {
    const { service, calls } = setUp({ userFails: true });

    await expect(service.createTenant({ name: 'Tienda', owner })).rejects.toThrow('fallo');
    expect(calls.removed).toEqual(['t1']);
  });
});
