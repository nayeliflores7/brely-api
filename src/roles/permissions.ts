// Catálogo base de permisos: lo siembra el seeder y el POS valida estas mismas claves.
// La clave es estable; el nombre y la descripción se pueden editar después en la BD.
export const PERMISSION_CATALOG = [
  // ── Panel web ──
  { key: 'admin.access', scope: 'admin', name: 'Entrar al panel web', description: 'Iniciar sesión en el panel de administración' },
  { key: 'users.manage', scope: 'admin', name: 'Administrar usuarios', description: 'Crear, editar y dar de baja usuarios' },
  { key: 'roles.manage', scope: 'admin', name: 'Administrar roles', description: 'Crear y editar roles y sus permisos' },
  { key: 'settings.manage', scope: 'admin', name: 'Configurar el negocio', description: 'Editar los datos del negocio' },
  { key: 'terminals.manage', scope: 'admin', name: 'Administrar terminales', description: 'Crear, deshabilitar y restablecer terminales' },
  { key: 'cash.manage', scope: 'admin', name: 'Cerrar cajas desde el panel', description: 'Cerrar una caja de cualquier terminal desde el panel web' },
  { key: 'audit.view', scope: 'admin', name: 'Ver la auditoría', description: 'Consultar quién hizo qué y cuándo en el negocio' },

  // ── Punto de venta ──
  { key: 'sales.create', scope: 'pos', name: 'Vender', description: 'Registrar ventas' },
  { key: 'sales.view', scope: 'pos', name: 'Ver todas las ventas', description: 'Consultar el historial completo; sin este permiso solo se ven las del turno actual' },
  { key: 'sales.cancel', scope: 'pos', name: 'Cancelar ventas', description: 'Cancelar una venta y devolver su stock' },
  { key: 'reports.view', scope: 'pos', name: 'Ver reportes', description: 'Ver ventas del día, productos más vendidos y estadísticas' },
  { key: 'costs.view', scope: 'pos', name: 'Ver costos y utilidad', description: 'Ver el costo de los productos y la utilidad de las ventas' },
  { key: 'cash.operate', scope: 'pos', name: 'Abrir y cerrar caja', description: 'Abrir un turno y hacer el corte de caja' },
  { key: 'cash.movements', scope: 'pos', name: 'Movimientos de efectivo', description: 'Registrar entradas y salidas de efectivo' },
  { key: 'products.create', scope: 'pos', name: 'Crear productos', description: 'Dar de alta productos nuevos' },
  { key: 'products.manage', scope: 'pos', name: 'Administrar productos', description: 'Editar y eliminar productos' },
  { key: 'stock.adjust', scope: 'pos', name: 'Ajustar inventario', description: 'Registrar compras, mermas y ajustes de stock' },
  { key: 'inventory.view', scope: 'pos', name: 'Ver inventario', description: 'Consultar existencias y movimientos' },
  { key: 'catalogs.manage', scope: 'pos', name: 'Administrar catálogos', description: 'Editar categorías y unidades' },
  { key: 'promotions.manage', scope: 'pos', name: 'Administrar promociones', description: 'Crear y editar promociones' },
  { key: 'terminal.unlink', scope: 'pos', name: 'Desvincular la terminal', description: 'Borrar los datos del equipo para activarlo con otro código' },
] as const;

export type Permission = (typeof PERMISSION_CATALOG)[number]['key'];

export const PERMISSIONS = PERMISSION_CATALOG.map((p) => p.key) as readonly Permission[];

const NOT_FOR_MANAGERS: readonly Permission[] = [
  'audit.view',
  'users.manage',
  'roles.manage',
  'settings.manage',
  'terminals.manage',
  'terminal.unlink', // borra el equipo: solo el propietario, salvo que lo active en Roles
];

export const OWNER_ROLE_NAME = 'Propietario';

// Roles base de cada negocio. El primero es el del propietario.
export const SYSTEM_ROLES: readonly {
  name: string;
  description: string;
  permissions: 'all' | readonly Permission[];
}[] = [
  { name: OWNER_ROLE_NAME, description: 'Acceso total', permissions: 'all' },
  {
    name: 'Encargado',
    description: 'Administra la tienda, sin usuarios, roles, terminales ni datos del negocio',
    permissions: PERMISSIONS.filter((key) => !NOT_FOR_MANAGERS.includes(key)),
  },
  {
    name: 'Cajero',
    description: 'Vende, cobra y hace el corte de caja',
    permissions: ['sales.create', 'sales.cancel', 'cash.operate', 'cash.movements', 'inventory.view'],
  },
];
