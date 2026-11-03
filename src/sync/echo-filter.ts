// Baja todo lo que escribió el admin y lo de otras cajas; nunca lo que esta caja subió.
// Para entidades mutables usa 'lastWriteOrigin': si el admin cancela una venta de esta
// caja, la caja debe enterarse.
export const notMine = (
  c: { tenantId: string; terminalId: string },
  field: 'origin' | 'lastWriteOrigin' = 'origin',
) => ({
  tenantId: c.tenantId,
  $or: [{ [field]: 'admin' }, { terminalId: { $ne: c.terminalId } }],
});
