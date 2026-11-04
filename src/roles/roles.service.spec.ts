import { PERMISSION_CATALOG, PERMISSIONS, SYSTEM_ROLES } from './permissions.js';
import { RolesService } from './roles.service.js';

const roleNamed = (name: string) => SYSTEM_ROLES.find((role) => role.name === name)!;

function setUp(existing: string[] = [], stored?: Record<string, unknown>) {
  const created: Record<string, unknown>[] = [];
  const updated: { filter: unknown; update: Record<string, any> }[] = [];
  const model = {
    findOne: (filter: { name?: string; _id?: string }) => ({
      collation: () => ({
        lean: async () =>
          existing.includes(filter.name ?? '')
            ? { _id: filter.name, permissions: stored?.permissions ?? [], ...filter }
            : null,
      }),
      lean: async () => stored,
    }),
    findOneAndUpdate: (_filter: unknown, changes: Record<string, unknown>) => {
      updated.push({ filter: _filter, update: changes });
      return { lean: async () => ({ ...stored, ...changes }) };
    },
    updateOne: async (filter: unknown, update: Record<string, any>) => {
      updated.push({ filter, update });
    },
    findById: () => ({ lean: async () => ({ _id: 'x' }) }),
    create: async (data: Record<string, unknown>) => {
      created.push(data);
      return { toObject: () => data };
    },
  };
  const perms = { activeKeys: async () => [...PERMISSIONS], assertAllExist: async () => undefined };
  return { service: new RolesService(model as never, perms as never), created, updated };
}

describe('catálogo de permisos', () => {
  it('no repite claves y todas tienen nombre', () => {
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
    expect(PERMISSION_CATALOG.every((p) => p.name && p.description)).toBe(true);
  });

  it('el cajero puede vender y cancelar, pero no ver reportes ni costos', () => {
    const cajero = roleNamed('Cajero').permissions;

    expect(cajero).toContain('sales.cancel');
    expect(cajero).toContain('cash.operate');
    expect(cajero).not.toContain('reports.view');
    expect(cajero).not.toContain('costs.view');
    expect(cajero).not.toContain('sales.view');
  });

  it('el encargado administra la tienda, sin usuarios, roles, terminales ni negocio', () => {
    const encargado = roleNamed('Encargado').permissions;

    expect(encargado).toContain('reports.view');
    expect(encargado).toContain('products.manage');
    for (const key of ['users.manage', 'roles.manage', 'settings.manage', 'terminals.manage']) {
      expect(encargado).not.toContain(key);
    }
  });
});

describe('RolesService.seedSystemRoles', () => {
  it('crea los tres roles en un negocio nuevo, con el propietario primero', async () => {
    const { service, created } = setUp();

    const roles = await service.seedSystemRoles('t');

    expect(created.map((role) => role.name)).toEqual(['Propietario', 'Encargado', 'Cajero']);
    expect(created.every((role) => role.isSystem && role.tenantId === 't')).toBe(true);
    expect(roles[0].permissions).toEqual([...PERMISSIONS]);
  });

  it('en un negocio existente crea solo lo que falta y no cambia los otros roles', async () => {
    const { service, created, updated } = setUp(['Encargado', 'Cajero']);

    await service.seedSystemRoles('t');

    expect(created.map((role) => role.name)).toEqual(['Propietario']);
    expect(updated).toEqual([]);
  });

  it('el propietario existente recibe los permisos nuevos, sin quitarle ninguno', async () => {
    const { service, created, updated } = setUp(['Propietario', 'Encargado', 'Cajero']);

    await service.seedSystemRoles('t');

    expect(created).toEqual([]);
    expect(updated).toHaveLength(1);
    expect(updated[0].update.$addToSet.permissions.$each).toEqual([...PERMISSIONS]);
    expect(updated[0].update).not.toHaveProperty('$set');
    expect(updated[0].update).not.toHaveProperty('$pull');
  });

  it('no escribe nada si al propietario no le falta ningún permiso', async () => {
    const { service, updated } = setUp(['Propietario', 'Encargado', 'Cajero'], {
      permissions: [...PERMISSIONS],
    });

    await service.seedSystemRoles('t');

    expect(updated).toEqual([]);
  });
});

describe('RolesService: reglas de edición', () => {
  const cajero = { _id: 'r1', name: 'Cajero', isSystem: true, permissions: ['sales.create'] };
  const owner = { _id: 'r2', name: 'Propietario', isSystem: true, permissions: [...PERMISSIONS] };
  const custom = { _id: 'r3', name: 'Almacén', isSystem: false, permissions: [] };

  it('permite cambiar los permisos de un rol base', async () => {
    const { service, updated } = setUp([], cajero);

    await service.update('t', 'r1', { permissions: ['sales.create', 'sales.view'] });

    expect(updated[0].update).toEqual({ permissions: ['sales.create', 'sales.view'] });
  });

  it('no permite renombrar un rol base', async () => {
    const { service } = setUp([], cajero);

    await expect(service.update('t', 'r1', { name: 'Vendedor' })).rejects.toThrow('renamed');
  });

  it('acepta el mismo nombre en un rol base', async () => {
    const { service } = setUp([], cajero);

    await expect(service.update('t', 'r1', { name: 'Cajero' })).resolves.toBeTruthy();
  });

  it('no permite quitarle permisos al propietario', async () => {
    const { service } = setUp([], owner);

    await expect(service.update('t', 'r2', { permissions: [] })).rejects.toThrow('owner');
  });

  it('un rol personalizado sí se puede renombrar', async () => {
    const { service, updated } = setUp([], custom);

    await service.update('t', 'r3', { name: 'Bodega' });

    expect(updated[0].update).toEqual({ name: 'Bodega' });
  });

  it('ignora isSystem aunque venga en la petición', async () => {
    const { service, updated } = setUp([], custom);

    await service.update('t', 'r3', { name: 'Bodega', isSystem: true });

    expect(updated[0].update).not.toHaveProperty('isSystem');
  });

  it('no permite eliminar un rol base', async () => {
    const { service } = setUp([], cajero);

    await expect(service.softDelete('t', 'r1')).rejects.toThrow('cannot be deleted');
  });
});
