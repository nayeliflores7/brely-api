// Solo web admin
export const ADMIN_PERMISSIONS = [
  'admin.access', // entrar al web admin
  'users.manage',
  'roles.manage',
  'settings.manage', // datos del negocio
  'terminals.manage',
  'sales.create',
  'sales.view',
  'cash.manage',
] as const;

// Acciones del POS (los tuyos, sin cambios)
export const POS_PERMISSIONS = [
  'sales.cancel',
  'cash.movements',
  'products.manage',
  'stock.adjust',
  'catalogs.manage',
  'inventory.view',
  'products.create',
  'promotions.manage',
] as const;

export const PERMISSIONS = [...ADMIN_PERMISSIONS, ...POS_PERMISSIONS] as const;
export type Permission = (typeof PERMISSIONS)[number];
