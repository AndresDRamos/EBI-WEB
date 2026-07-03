---
id: 0006-rbac-actions
status: committed
created: 2026-07-02
touches:
  - docs/modules/rbac.md (new)
  - docs/modules/navigation.md (read)
  - docs/STATE.md
  - docs/architecture/module-blueprint.md (§3 🔜→✅)
  - docs/docs-routing.md (new row)
  - docs/architecture/adr/0004 (new)
migrations: [V8__rbac_permissions.sql]
supersedes: null
superseded_by: null
---

# 0006 — RBAC por recurso y acción (permisos administrables)

## Objective

Que cada acción sensible del portal (crear activo, invitar usuario, editar
navegación…) esté gateada por un permiso `<módulo>.<recurso>:<acción>`
asignable desde el panel admin al sujeto de acceso, sin tocar código ni DB.
El sujeto es el **perfil de acceso**: `auth.role` se redefine (misma tabla,
nueva semántica) con `department_id` opcional — NULL = perfil transversal
(como `admin`); un perfil departamental materializa el combo depto+puesto
("Técnico Mantenimiento" ≠ "Técnico Calidad"). `user_role` sigue siendo la
única arista de asignación (disuelve la trampa cartesiana: el perfil ya trae
su departamento); `user_department` queda como dimensión pura de data-scope
(RLS futura, ADR 0001 intacto). `admin` conserva el bypass app-layer sin
filas de grant (patrón V7/getNavForUser).

## Resolución de los puntos abiertos del prompt

1. **Modelo del sujeto:** opción (c) — dictamen dba: (a) rechazada (NULL en
   clave ternaria + la ambigüedad cartesiana se muda a cada query); (b)
   rechazada para v1 (normalización de libro con beneficio cero hoy; si RRHH
   pide catálogo de puestos, se introduce entonces con migración trivial).
   No se necesita la tripleta usuario–depto–puesto: queda materializada
   dentro del perfil. Sin rename de tabla (acople con kysely-codegen,
   PROTECTED_ROLE, session callbacks); la semántica la fija el ADR 0004.
2. **Overrides por usuario:** diferidos (YAGNI, sin tabla ni columnas
   preparadas — regla V7 "do not pre-add").
3. **Adopción:** completa en servidor (los ~30 gates de mutación
   `requireAnyRole(["admin"])` pasan a `requirePermission(...)`; con los
   datos de hoy el comportamiento efectivo no cambia porque el único usuario
   es admin). Los GET no cambian en v1. En UI, piloto `can()` en las
   pantallas de maintenance; el layout `/admin` conserva su gate admin en v1.
4. **Resolución:** consulta por request en `requirePermission` (el callback
   JWT ya toca la DB por request; el join nuevo son seeks sobre tablas de
   una página — dictamen dba). Nada de permisos dentro del JWT (evita
   staleness y el acople con token_version). El cliente recibe sus códigos
   cargados server-side en el layout del portal vía provider — sin endpoint
   nuevo de refresh (YAGNI).

## Steps

0. **Precondición (humano, tras /plan-save):**
   `flyway -configFiles=db/flyway.dev.conf migrate` (aplica V8) →
   `pnpm db:gen` (regenera types: `role.department_id`, `permission`,
   `role_permission`). `flyway info` limpio antes de construir.

1. **Slice de datos** — `src/modules/org/db/permissions.ts` (nuevo, bind
   `withSchema("auth")` como el resto del módulo):
   - `getPermissionCodesForRoles(roleNames: string[]): Promise<string[]>` —
     join role→role_permission→permission por nombre de rol (entrada = claim
     `roles` del JWT).
   - `listPermissions()` — catálogo completo ordenado por code.
   - `listRolePermissionIds(roleId)` / `setRolePermissions(roleId,
     permissionIds[])` — replace-set transaccional (patrón
     `setSectionGrants` de navigation/db.ts).

2. **Perfil de acceso en org** — `src/modules/org/db/org.ts`:
   - `createRole`/`updateRole` aceptan `department_id: number | null`
     (protección `admin` intacta: sin rename/desactivación, y además sin
     department_id — admin es transversal por definición).
   - `deleteRole`: en transacción, limpiar `role_permission` y
     `role_nav_section` (config del perfil) antes del delete; el 409 queda
     solo para `user_role` (usuarios asignados). Documentar en el handler.
   - `listRoles` devuelve `department_id` (+ join a nombre de depto para el
     panel).

3. **Server-side** — `src/lib/auth/rbac.ts`:
   - `requirePermission(code: string): Promise<SessionUser>` — requireUser;
     si `roles` incluye `admin` → pasa sin query; si no,
     `getPermissionCodesForRoles` y `ForbiddenError` si falta el código.
     (Precedente de import lib→modules/org: `getUserScope` ya lo hace.)
   - `requireAnyRole` no se elimina (lo usa el layout /admin); `isAdmin` y
     `assertAdminOrRedirect` intactos.

4. **Adopción en API routes** — sustitución mecánica en mutaciones (GETs
   intactos). Mapa route→permiso (los 35 códigos del seed V8):
   - `api/users` POST→`org.user:create` · `api/users/[id]` PATCH→
     `org.user:update` · `api/users/[id]/invite` POST→`org.user:invite`
   - `api/roles` POST→`org.role:create` · `api/roles/[id]` PATCH/DELETE→
     `org.role:update`/`org.role:delete`
   - `api/plants`, `api/departments` — ídem patrón `org.plant:*` /
     `org.department:*`
   - `api/reports` POST→`reports.report:create` · `api/reports/[id]`
     PUT/PATCH→`reports.report:update`, DELETE→`reports.report:delete` ·
     `api/reports/categories*` → `reports.category:*`
   - `api/nav/sections/[id]` PATCH/DELETE→`navigation.section:update|delete`
     · `api/nav/items*` → `navigation.item:*` ·
     `api/nav/sections/[id]/grants` PUT→`navigation.grants:update`
   - `api/maintenance/assets*` → `maintenance.asset:*` · `…/processes*` →
     `maintenance.process:*` · `…/documents*` →
     `maintenance.document:create|delete` · `…/restrictions*` →
     `maintenance.restriction:*`
   - Nota dba: no existe `org.user:delete` (la baja es PATCH de
     desactivación); no sembrar permisos muertos.

5. **Cliente** — `src/components/providers/permissions-provider.tsx`
   (nuevo): contexto `{ isAdmin, codes: Set<string> }` + hook
   `useCan(): (code: string) => boolean` (admin → siempre true). Se monta en
   `(portal)/layout.tsx` con los códigos cargados server-side
   (`getPermissionCodesForRoles` con los roles de la sesión) — sin fetch ni
   flash. Staleness aceptada: el servidor re-verifica siempre.

6. **Piloto UI (maintenance)** — gatear con `useCan`:
   - `machines-table-page`: botón "Nuevo equipo" ← `maintenance.asset:create`;
     editar/eliminar ← `:update`/`:delete`.
   - `machine-detail`: acciones de documentos/restricciones ← sus códigos.
   - `processes-table-page`: CRUD ← `maintenance.process:*`.
   - Retirar el prop `isAdmin` que las páginas server pasan hoy donde el
     hook lo sustituya.

7. **Panel admin** — asignación perfil↔permisos (patrón nav-grants-panel):
   - `modules/org/components/permission-grants-panel.tsx`: selector de
     perfil (excluye `admin` — grant sería no-op, mismo aviso que nav) →
     checkboxes agrupados por `módulo.recurso` → guardar (replace-set).
   - Página `(portal)/admin/permissions/page.tsx` + entrada "Permisos" en
     `admin-panel-sidebar.tsx`.
   - API: GET `/api/permissions` (catálogo; admin) · GET/PUT
     `/api/roles/[id]/permissions` (PUT gateado por `org.role:update` — la
     gestión de grants es edición del perfil; sin permiso meta nuevo).
   - Pantalla de roles: columna Departamento + selector en el form; relabel
     UI "Roles" → "Perfiles de acceso" (sidebar y títulos; el código no
     renombra nada).

8. **Docs** (docs-sync corre al final de /build-plan):
   - ADR 0004 — "role = perfil de acceso; department_id NULL = transversal;
     permisos sembrados por migración; admin bypass sin grants".
   - `docs/modules/rbac.md` (desde _module-template) + fila en
     docs-routing ("RBAC / acciones gateadas") + STATE (convención nueva:
     mutaciones gatean con requirePermission; puesto ≠ perfil) + blueprint
     §3 🔜→✅.

## Database impact

**V8 — `db/migrations/V8__rbac_permissions.sql`** (SQL del sub-agente dba,
enteramente aditiva, idempotente, seeds por código nunca por ID — los IDs
reales en EBI_dev son no contiguos: role_id 1,2,3,9; department_id 1,3,5):

- `auth.role` += `department_id INT NULL` FK→department NO ACTION (409 app),
  índice filtrado `IX_role_department`. Sin back-fill: los 3 puestos
  existentes quedan como perfiles transversales con sus grants de nav
  intactos.
- `auth.permission` — `code NVARCHAR(80)` único, CHECK de formato
  `<módulo>.<recurso>:<acción>` con collation binaria (minúsculas), sin
  `is_active` (retirar un permiso = migración que lo borra; grants cascadan).
- `auth.role_permission` — PK (role_id, permission_id); CASCADE desde
  permission (dueño de la config, análogo a nav_section en V7), NO ACTION a
  role; índice inverso `IX_role_permission_permission`.
- Seeds: **35 permisos** (org 12, reports 6, navigation 6, maintenance 11),
  validados 1:1 contra los endpoints de mutación reales (2026-07-02).
  `role_permission` nace **vacía** (preserva el acceso efectivo actual —
  único usuario: admin, con bypass).
- **Irreversibles (dictamen dba):** ninguna operación destructiva; el
  rollback físico es un DROP limpio. Dos matices de modelo aceptados en la
  aprobación: (1) la semántica de `auth.role` cambia de forma unidireccional
  — tras crear perfiles departamentales con grants, revertir el modelo es
  una migración de datos con decisiones humanas, no un rollback; (2) los
  grants de `role_permission` los crea el panel y no viven en ninguna
  migración — revertir la tabla con grants reales pierde configuración
  administrativa sin copia.
- Rendimiento: hot path = seeks por PK/UQ sobre tablas de una página
  (role por UQ_role_name → role_permission por prefijo de PK → permission);
  sin degradación medible. ERD delta (department→role scoping + permission +
  role_permission) listo para docs-sync.

## Acceptance checks (para /verify-plan)

- Perfil sin `maintenance.asset:create` → no ve "Nuevo equipo" y el POST
  directo devuelve 403.
- Dos perfiles "Técnico" de departamentos distintos reciben permisos
  distintos.
- Admin asigna/revoca desde /admin/permissions sin tocar código ni DB.
- `pnpm lint && pnpm build` verdes · `flyway info` limpio en EBI_dev ·
  el usuario admin actual conserva acceso total sin filas de grant.

## Amendments

- 2026-07-02 — **Ampliación de alcance pre-verificación (pedida por el
  usuario): fix de reactivación de navegación absorbido en este plan** (antes
  `prompts/nav-reactivation.md`, eliminado). Sin migraciones. Cambios: (1)
  prop opcional `onRestore` en el kit `DataTable` — acción "Reactivar" en
  filas inactivas, click directo sin confirm (reversible), diálogo solo para
  error; (2) cableada en los 8 consumidores: secciones/ítems de nav, perfiles,
  plantas, departamentos, usuarios (PATCH), equipos (PATCH →
  `maintenance.asset:update`) y procesos — todos los endpoints ya aceptaban
  `is_active: true`, cero cambios de API; en maintenance el botón se gatea
  con `can("…:update")`; (3) `getNavForUser` ya no filtra `is_active` para
  admin y `ResolvedNavSection` expone `is_active` (no-admin sigue recibiendo
  solo activas — regla que el plan portal-home-nav-authz reutilizará); el topbar pinta las
  secciones inactivas atenuadas con badge "oculta" (solo admins las reciben).
  Criterios añadidos: admin ve/reactiva secciones ocultas con un click;
  usuarios no-admin sin cambio; el confirm de desactivar ya no promete un
  camino inexistente. El Objective del plan sigue siendo exacto — esto
  extiende la superficie administrable, no la contradice.

- 2026-07-02 — **Verificación E2E completa (usuario de prueba `tester`,
  credenciales en `.env` — `TEST_PORTAL_*`).** Todos los criterios de
  aceptación pasaron contra el dev server con sesiones reales: 403 para
  perfil sin permiso + botón oculto en HTML; grant/revoke desde
  `/admin/permissions` con efecto inmediato (revocación por request, cache
  `"permissions"` invalidada); bypass admin sin filas de grant; ciclo
  sección oculta (badge "oculta" solo admin, invisible para no-admin) →
  reactivación con la llamada de `onRestore`; grants de nav a un perfil
  departamental (dept×puesto) funcionando. DB verificada: V8 success, 35
  permisos válidos, `role_permission` termina limpia (fixture QA creado y
  eliminado vía API — `deleteRole` limpió sus grants en camino real).
  **Hallazgo colateral pre-existente, fuera de alcance:** `PATCH
  /api/maintenance/assets/[id]` responde 200 con un id inexistente (debería
  404); no lo introdujo este plan.

- 2026-07-02 — **Segunda ampliación pre-commit (pedida por el usuario): UX de
  alta de usuarios.** Motivo: el admin creó un usuario sin marcar "Generar
  invitación" y quedó una cuenta no logueable sin camino visible; además el
  toggle "Cuenta activa" permitía "activar" cuentas sin contraseña (no-op
  confuso). Cambios: (1) la invitación se genera **siempre** al crear
  (checkbox eliminado; la API ya lo hacía por defecto — el gap era del
  form); (2) `getUserDetail` expone `has_password` (derivado; el hash nunca
  sale del módulo db) y el toggle "Cuenta activa" se deshabilita con hint
  "Se activará cuando el usuario acepte su invitación" mientras no haya
  contraseña; (3) botón "Generar enlace de invitación" en el modal de
  edición (POST `/api/users/[id]/invite`, endpoint que ya existía sin UI) —
  los tokens se guardan hasheados, así que el enlace no se puede "volver a
  ver": se regenera, que es el camino correcto y también sirve de reset de
  contraseña.
