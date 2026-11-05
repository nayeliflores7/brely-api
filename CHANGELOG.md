# Cambios de brely-api

Versiones con el formato MAYOR.MENOR.PARCHE. Cómo publicar una: ver "Versiones" en `AGENTS.md`.

## 0.1.0 · 2026-11-05

Primera versión con número. Lo que ya hace:

- **Negocios, usuarios, roles y permisos.** Super admin para dar de alta negocios; roles base (Propietario, Encargado, Cajero) y permisos con switch.
- **Terminales.** Activación con código de un solo uso, restablecer, deshabilitar, eliminar y restaurar. Una terminal puede desvincularse desde su POS.
- **Sincronización con el POS.** Envío y descarga por entidades, reporte de su estado y rechazo de operaciones inválidas.
- **Catálogo.** Productos, categorías, unidades, existencias, historial de precios y promociones (lleva y paga, paquete, porcentaje, monto).
- **Precios con IVA incluido.** El precio de venta es lo que paga el cliente; el IVA se desglosa por línea.
- **Ventas y caja.** Ventas, cancelaciones, turnos y cortes.
- **Reportes.** Ventas por periodo, terminal, forma de pago y producto; promociones; utilidad; exportación a Excel.
- **Dashboards.** Por negocio y para super admin.
- **Correo.** Reporte diario programable y recuperación de contraseña.
- **Bitácora** de lo que se hace en el panel y en los POS.
- **Prefijo de códigos de barras** por negocio.
- **Versión mínima del POS.** Cada llamada trae la versión del POS; si es menor que `MIN_POS_VERSION` responde 426 y el POS pide actualizarse.
