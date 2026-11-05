# AGENTS.md

## Production data: NestJS Observe

This app's production telemetry - traces, errors, logs and metrics - goes to [NestJS Observe](https://observe.nestjs.com). Until `ObserveModule` is registered in `src/app.module.ts`, nothing is sent: `npx @nestjs/observe link` sets it up in one step - it installs `@nestjs/observe`, wires it into the app, and writes the key pair (`OBSERVE_APP_KEY`, `OBSERVE_APP_SECRET`) to `.env`.

When a task depends on how the app behaves in production - an error users hit, a slow endpoint, a failing job, whether a release made things worse - work from that data, not from the code alone:

- The Observe MCP server answers those questions directly: errors with their traces and logs, slow operations, jobs, and what a release changed (`find_regressions`, `diff_release`). It is included on the Pro plan and above. In Claude Code: `claude mcp add observe --transport http https://observe-api.nestjs.com/mcp`, and the client opens a browser to approve. Other clients: https://www.observe.nestjs.com/documentation/mcp
- Without it, the user can open the request or error in the Observe dashboard and click **Copy agent prompt**, which hands over that page's trace, stack and logs as text.

## Permisos

Las claves de permisos se escriben a mano en tres lugares y deben coincidir. Al agregar, renombrar o quitar un permiso, actualiza todos:

- `brely-api/src/roles/permissions.ts`: catálogo (`PERMISSION_CATALOG`) y roles base (`SYSTEM_ROLES`).
- `brely-pos/electron/ipc/auth.ts`: lista `ALL_PERMISSIONS`.
- `brely-pos/src/app/core/auth/permissions.ts`: tipo `Permission`.

Si el permiso solo aplica al panel web, el POS no necesita conocerlo: basta con el catálogo. Si controla una pantalla del panel, revisa también `brely-webadmin/src/app/layout/nav-items.ts`.

Después ejecuta `npm run seed` en `brely-api`. El seeder solo crea lo que falta y no cambia lo que ya existe en la BD: un permiso nuevo llega al rol Propietario de cada negocio, y a los demás roles se les activa con su switch en la pantalla de Roles.

## Versiones

Cada repo tiene su versión en `package.json` (MAYOR.MENOR.PARCHE) y su `CHANGELOG.md`. `brely-api` y `brely-webadmin` se publican juntos; cada POS se actualiza cuando alguien lo instala, así que una API nueva convive con POS anteriores.

- El POS manda su versión en el encabezado `X-Brely-Pos-Version` en cada llamada a la API.
- La API rechaza con 426 a un POS con versión menor que `MIN_POS_VERSION` (en el `.env` de la API; sin definir, acepta todos). El POS muestra "Actualiza el POS" y conserva lo que no ha enviado.
- Cambios en la sincronización o en lo que el POS envía y recibe: solo aditivos (campos nuevos opcionales; nunca quitar ni cambiar lo que usa un POS anterior). Si un cambio no puede ser aditivo, se publica primero el POS que lo soporta y después se sube `MIN_POS_VERSION` a esa versión.
- Para publicar: `npm version patch|minor|major` en el repo (sube el número y crea la etiqueta `vX.Y.Z`) y agrega lo que cambió al `CHANGELOG.md`, en palabras de quien usa el sistema.
- La base local del POS cambia con migraciones numeradas (`brely-pos/electron/db/migrations.ts`): nunca editar una que ya se publicó; agregar una nueva.
