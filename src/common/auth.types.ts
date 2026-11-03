export interface AuthUser {
  id: string;
  tenantId: string | null;   // null para el super admin
  roleId: string | null;
  fullName: string;
  permissions: string[];
  isSuperAdmin: boolean;
}

export interface TerminalContext {
  id: string;
  tenantId: string;
}