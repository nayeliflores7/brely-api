# brely-api

API del sistema Brely (NestJS + MongoDB). La usan el panel web (`brely-webadmin`) y las terminales POS (`brely-pos`).

- Prefijo de todas las rutas: `/api/v1` (por ejemplo `http://localhost:3000/api/v1/version`).
- Base de datos: MongoDB Atlas (clúster gratuito M0).
- Versión actual: ver `package.json` y [CHANGELOG.md](CHANGELOG.md).
- Reglas para agentes y para cambios de permisos y versiones: [AGENTS.md](AGENTS.md).

## Requisitos

- Node.js 22 o superior.
- Una base MongoDB (Atlas o local) y su cadena de conexión.
- Opcional: [mongosh](https://www.mongodb.com/docs/mongodb-shell/) para limpiar la base desde la terminal.

## Variables de entorno (`.env`)

El archivo `.env` va en la raíz del repo y **no se sube a git**. Crea uno con estas claves:

| Variable | Obligatoria | Para qué sirve |
|---|---|---|
| `MONGO_URI` | Sí | Cadena de conexión. El nombre de la base va en la ruta (`.../brely-business?...`). |
| `JWT_SECRET` | Sí | Secreto para firmar las sesiones. Una cadena larga y aleatoria; distinta en producción. |
| `PORT` | No | Puerto de la API. Por defecto `3000`. |
| `JWT_EXPIRES_IN_SECONDS` | No | Duración de la sesión del panel. Por defecto `86400` (24 h). |
| `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD`, `SUPERADMIN_NAME` | Solo la primera vez | Si no existe ningún super admin, la API lo crea al arrancar con estos datos. |
| `CORS_ORIGINS` | En producción | Dominios del panel separados por coma. Por defecto `http://localhost:4200`. |
| `PANEL_URL` | En producción | Dirección del panel para los enlaces de "recuperar contraseña". Si falta, usa el primer valor de `CORS_ORIGINS`. |
| `SMTP_USER`, `SMTP_APP_PASSWORD` | Para correo | Cuenta y contraseña de aplicación de Gmail. Sin ellas no se envían el reporte diario ni la recuperación de contraseña. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | No | Por defecto Gmail: `smtp.gmail.com`, `465`, seguro. Cámbialos para usar otro proveedor. |
| `MIN_POS_VERSION` | No | Versión mínima del POS aceptada. Un POS más viejo recibe 426 y muestra "Actualiza el POS". Sin definir, acepta todos. |
| `REPORT_EMAIL_TICK_MS` | No | Cada cuánto revisa si toca enviar el reporte diario. Por defecto `60000` (1 min). |

Ejemplo mínimo para desarrollo:

```env
PORT=3000
MONGO_URI=mongodb+srv://USUARIO:CONTRASENA@cluster0.xxxxx.mongodb.net/brely-business?retryWrites=true&w=majority
JWT_SECRET=cambia-esto-por-algo-largo-y-aleatorio
JWT_EXPIRES_IN_SECONDS=86400
SUPERADMIN_EMAIL=admin@ejemplo.com
SUPERADMIN_PASSWORD=una-contrasena-segura
SUPERADMIN_NAME=Administrador
```

## Desarrollo

Instalar dependencias:

```bash
npm install
```

Arrancar con recarga automática (http://localhost:3000/api/v1):

```bash
npm run start:dev
```

Comprobar que responde:

```bash
curl http://localhost:3000/api/v1/version
```

Al arrancar por primera vez sobre una base vacía, la API crea el super admin con los datos `SUPERADMIN_*`. Con él entras al panel, creas el negocio, sus usuarios y sus terminales.

### Seeder de permisos y roles

```bash
npm run seed
```

Compila y crea en cada negocio los permisos del catálogo y los roles base que falten. No modifica lo que ya existe. Ejecútalo después de agregar o renombrar un permiso (ver "Permisos" en [AGENTS.md](AGENTS.md)).

### Pruebas y calidad

| Comando | Qué hace |
|---|---|
| `npm test` | Pruebas unitarias (Vitest). |
| `npm run test:watch` | Pruebas en modo observación. |
| `npm run test:cov` | Pruebas con cobertura. |
| `npm run lint` | Revisión con oxlint. |
| `npm run format` | Formato con Prettier. |

`npm run test:e2e` aún tiene solo la prueba generada por Nest (`GET /`), que falla porque esa ruta no está registrada.

### Probar sin tocar la base real

Nunca hagas pruebas sobre la base del negocio. Para probar, cambia el nombre de la base en `MONGO_URI` por uno temporal (por ejemplo `brely-e2e-prueba`), arranca la API y bórrala al terminar (ver abajo).

## Borrar la base de datos

**Esto elimina todos los datos del negocio y no se puede deshacer.** Haz un respaldo antes si hay algo que conservar.

La cuenta de Atlas no tiene permiso para `dropDatabase`, así que se borran las colecciones. Con mongosh (reemplaza la cadena por la de la base que quieres vaciar):

```bash
mongosh "mongodb+srv://USUARIO:CONTRASENA@cluster0.xxxxx.mongodb.net/brely-e2e-prueba" --eval "db.getCollectionNames().forEach(c => db.getCollection(c).drop())"
```

También se puede hacer desde Atlas: **Data Explorer**, selecciona la base y elimina cada colección.

Después:

1. Arranca la API: vuelve a crear el super admin con `SUPERADMIN_*`.
2. Si borraste la base de un negocio que ya tenía terminales, borra también la base local de cada POS (`npm run db:reset` en `brely-pos`) y vuelve a activarlas.

## Respaldo

Atlas M0 no hace respaldos automáticos. Para exportar la base a una carpeta:

```bash
mongodump --uri "mongodb+srv://USUARIO:CONTRASENA@cluster0.xxxxx.mongodb.net/brely-business" --out ./respaldo
```

Y para restaurarla:

```bash
mongorestore --uri "mongodb+srv://USUARIO:CONTRASENA@cluster0.xxxxx.mongodb.net/brely-business" ./respaldo/brely-business
```

`mongodump` y `mongorestore` vienen en las [MongoDB Database Tools](https://www.mongodb.com/docs/database-tools/). La carpeta de respaldo contiene datos del negocio: no la subas a git.

## Compilar para producción

```bash
npm run build
```

```bash
npm run start:prod
```

`build` genera `dist/` y `start:prod` ejecuta `node dist/main`. En el servidor, define las variables de entorno en la plataforma en lugar de subir el `.env`. Incluye `NODE_ENV=production`. El ambiente que se ve junto a la versión sale de `APP_ENV`: `DEV` en pruebas; en producción se deja vacía u omitida (y sin `APP_ENV`, `NODE_ENV=production` cuenta como producción).

## Despliegue

`brely-api` y `brely-webadmin` se publican juntos.

## Ambiente de pruebas en la nube

La rama `develop` se despliega sola en Render (plan gratuito) con el archivo [render.yaml](render.yaml); `main` no se despliega todavía. El ambiente de nube de pruebas muestra **DEV** junto a la versión en el panel y en el POS (variable `APP_ENV=DEV`).

Primera vez, en este orden:

1. **Atlas:** en el mismo clúster, usa la base `brely-develop` (se crea sola al primer uso). Crea un usuario de base de datos exclusivo, con rol *readWrite* solo sobre esa base. En **Network Access** permite `0.0.0.0/0`: Render gratis no tiene IP fija.
2. **Render:** *New → Blueprint*, elige el repositorio `brely-api` y la rama `develop`. Render lee `render.yaml` y te pide los valores marcados `sync: false`:
   - `MONGO_URI`: la cadena de la base `brely-develop` con su usuario.
   - `CORS_ORIGINS` y `PANEL_URL`: la dirección del panel de pruebas (por ejemplo `https://brely-panel-dev.pages.dev`), sin diagonal final. Si aún no la tienes, déjalas con un valor provisional y corrígelas después.
   - `SUPERADMIN_EMAIL` y `SUPERADMIN_PASSWORD`: los de este ambiente, distintos a los locales.
3. **Comprobar:** abre `https://TU-SERVICIO.onrender.com/api/v1/version`. Debe responder las versiones y `"env":"DEV"`. La primera llamada tarda alrededor de un minuto si el servicio estaba dormido.
4. **Datos iniciales:** el super admin se crea solo al arrancar con `SUPERADMIN_*`. El catálogo de permisos y los roles base los crea `npm run seed`, que hay que correr **una vez, desde tu computadora y antes de crear el primer negocio**, apuntando a la base de pruebas. En PowerShell:

```powershell
$env:MONGO_URI = "mongodb+srv://USUARIO:CONTRASENA@cluster0.xxxxx.mongodb.net/brely-develop"
npm run seed
```

Cuando agregues permisos o roles nuevos en una versión, repite el seed contra esa base (y contra la de producción cuando exista).

Cosas de este ambiente:

- **Se duerme** tras 15 minutos sin tráfico, y no se mantiene despierto a propósito. Las terminales venden sin conexión y sincronizan cuando responde.
- **No envía correo** (Render gratis bloquea SMTP): el reporte diario y la recuperación de contraseña no funcionan aquí.
- Cada cambio en `develop` redespliega solo; si compila mal, Render conserva la versión anterior.

### Configuración de producción

- `MONGO_URI` de la base del negocio y un `JWT_SECRET` nuevo, distinto al de desarrollo.
- `CORS_ORIGINS` y `PANEL_URL` con la dirección pública del panel (por ejemplo `https://brely-panel.pages.dev`).
- En Atlas, **Network Access** debe permitir la IP del servidor. Las plataformas gratuitas no tienen IP fija, así que suele hacer falta permitir `0.0.0.0/0`; en ese caso usa un usuario de base con contraseña fuerte y solo los permisos necesarios.
- El panel se compila con la dirección pública de la API (ver el README de `brely-webadmin`).
- Las terminales POS deben apuntar a la API pública (ver "Dirección de la API" en el README de `brely-pos`).

### Plataformas gratuitas

| Plataforma | Comandos | Considera |
|---|---|---|
| Render (Web Service gratis) | Build `npm ci && npm run build`, Start `npm run start:prod` | Se apaga tras 15 min sin tráfico (la primera llamada tarda ~1 min). Bloquea el envío SMTP. |
| Koyeb | Los mismos | Se apaga tras 1 h sin tráfico. |
| Oracle Cloud Always Free | VM propia con Node y un administrador de procesos (por ejemplo pm2) | Siempre encendida, pero tú la administras. Bloquea SMTP. |
| Google Cloud Run | Contenedor | Pide tarjeta; se apaga sin tráfico salvo que pagues una instancia mínima. |

Dos funciones necesitan atención si la plataforma se apaga o bloquea SMTP:

- **Reporte diario por correo:** lo programa la propia API con un temporizador. Si el servidor está apagado a la hora del envío, no sale.
- **Correo (reporte y recuperación de contraseña):** usa Gmail por SMTP. Donde SMTP esté bloqueado hay que usar un proveedor de correo por HTTPS.

Las terminales no dependen de que la API esté siempre encendida: venden sin conexión y sincronizan cuando la API vuelve a responder.

### Publicar una versión

```bash
npm version patch
```

Usa `patch` para correcciones, `minor` para funciones nuevas y `major` para cambios incompatibles. Sube el número en `package.json` y crea la etiqueta `vX.Y.Z`. Luego:

1. Agrega lo que cambió a [CHANGELOG.md](CHANGELOG.md), en palabras de quien usa el sistema.
2. Sube los cambios y la etiqueta:

   ```bash
   git push --follow-tags
   ```

3. Despliega la API y el panel.

Reglas de compatibilidad con terminales: la API nueva convive con POS anteriores. Los cambios en la sincronización solo pueden agregar campos opcionales. Si un cambio no puede convivir con versiones viejas, primero se publica el POS que lo soporta y, cuando las terminales están actualizadas, se sube `MIN_POS_VERSION`.

## Estructura

| Carpeta | Contenido |
|---|---|
| `src/auth` | Inicio de sesión, JWT, recuperación de contraseña. |
| `src/tenants` | Negocios y su configuración (prefijo de códigos, etc.). |
| `src/terminals` | Alta, activación, desvinculación y recuperación de terminales. |
| `src/sync` | Rutas que usan las terminales (`/sync/*`, protegidas por `TerminalAuthGuard`). |
| `src/roles`, `src/permissions` | Catálogo de permisos y roles base. |
| `src/products`, `src/categories`, `src/units`, `src/stock`, `src/promotions` | Catálogo e inventario. |
| `src/sales`, `src/cash` | Ventas y caja. |
| `src/reports` | Dashboards y reporte diario por correo. |
| `src/mail` | Envío de correo. |
| `src/audit` | Bitácora de acciones. |
| `src/seed` | Seeder de permisos y roles. |
| `src/common` | Utilidades compartidas: dinero e IVA, versiones, decoradores. |
