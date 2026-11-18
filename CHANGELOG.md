# Cambios de brely-api

Versiones con el formato MAYOR.MENOR.PARCHE. Cómo publicar una: ver "Versiones" en `AGENTS.md`.

## Sin publicar

- **Horario de atención y aviso de cierre.** Los ajustes del negocio guardan el horario de cada día de la semana, con varios bloques por día, y los minutos de aviso antes del cierre. Se validan (siete días, el cierre después de la apertura dentro del mismo día, bloques en orden y sin traslaparse) y llegan a las terminales al sincronizar.
- **El ambiente en `/version`.** Responde también `env`: lo que diga `APP_ENV` ("DEV" en la nube de pruebas) y, sin ella, "DEV" salvo que `NODE_ENV=production`. Vacío en producción.
- **Despliegue de pruebas en Render.** `render.yaml` despliega la rama `develop` con el plan gratuito, con `APP_ENV=DEV` y sus propias variables.
- **Rol Empaquetador y permiso "Ajustar precios".** Nuevo rol base para quien prepara paquetes de producto a granel: da de alta productos con precio y costo, cambia precios, ajusta el inventario, ve los costos e imprime etiquetas; no vende ni ve reportes. Cambiar el precio, el costo o el IVA es ahora un permiso propio (`products.price`) que no deja editar ni eliminar productos; quien administra productos sigue pudiendo. Ruta nueva `PATCH /products/:id/price`. Después de actualizar, reiniciar la API y ejecutar `npm run seed`: crea el rol Empaquetador en cada negocio. Al Encargado y a otros roles ya existentes se les activa "Ajustar precios" en Roles si lo necesitan.
- **Gastos fijos por semana o quincena.** Dos frecuencias nuevas: una semana pesa 4.33 veces al mes (52 semanas ÷ 12 meses) y una quincena, 2 veces.
- **Cuándo se vende más.** El reporte de ventas trae el promedio por día de la semana y las ventas por hora (en la zona horaria del negocio), con el mejor día, los días más flojos, la hora más fuerte y la franja que concentra el 80 % de las ventas. El Excel agrega las hojas "Por día de la semana" y "Por hora".
- **Utilidad por producto.** `GET /finance/products?period=month|last30|lastMonth` (permiso de ver las finanzas): cuánto vendió y cuánto dejó cada producto, su margen y su parte de la utilidad total; marca los que se vendieron por debajo de su costo y los que no tienen costo capturado.
- **Finanzas.** Gastos fijos del negocio (renta, luz, sueldos...) con su frecuencia de pago, y un resumen con el punto de equilibrio (gastos fijos ÷ margen de utilidad de los últimos 30 días), el avance del mes, la utilidad estimada del mes y el valor del inventario. Dos permisos nuevos, **Ver las finanzas** y **Administrar gastos fijos**, solo para el Propietario por defecto: después de actualizar, reiniciar la API y ejecutar `npm run seed`. Los cambios a los gastos quedan en la auditoría.
- **La lista de resurtido sugiere cuánto comprar** (parámetro `days`, de 1 a 90, 14 por defecto): lo que alcanza para esos días de ventas más el mínimo; los productos sin ventas recientes, el doble del mínimo.
- **Lista de resurtido en PDF.** `GET /stock/restock` (la lista) y `GET /stock/restock/export` (el PDF) con el permiso de ver el inventario: los productos en alerta y los que están por agotarse, por categoría, con casilla para marcar y espacio para anotar cuánto comprar.
- **Descuentos en los reportes.** Los reportes, el Excel y el resumen del día separan lo que quitaron las promociones de lo que descontó el cajero, con quién lo dio y por qué. El correo diario agrega la sección solo si hubo descuentos. "Utilidad sin promociones" ya no resta los descuentos de caja y se agrega "utilidad sin ningún descuento".
- **Descuentos dados en caja.** Las ventas guardan cuánto del descuento dio el cajero y por qué. Permiso nuevo **Dar descuentos** (`sales.discount`): lo tienen Propietario y Encargado; a los demás roles se les activa en Roles. Después de actualizar, ejecutar `npm run seed`.

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
