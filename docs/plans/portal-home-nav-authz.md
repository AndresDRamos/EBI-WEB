---
id: portal-home-nav-authz
status: committed            # draft -> approved -> built -> verified -> committed -> superseded
created: 2026-07-03
touches: [navigation, module-blueprint]   # docs/modules/* + blueprint this plan changes
migrations: [V9__maintenance_nav_items.sql, V10__drop_reports_powerbi.sql]
supersedes: null
superseded_by: null
---

# Autorización por sección, página de inicio y limpieza de Power BI

## Objective

Cerrar la desconexión entre **crear un módulo** (rutas en código) y **su mapeo en
el portal** (sección/ítems visibles, asignables y con acceso real). Con el plan 0006
y el fix de reactivación de navegación ya quedaron resueltos el contrato de seeds de
permisos (blueprint §1/§3), la autorización por acción y el admin que ve/reactiva
secciones inactivas. Este plan cierra los eslabones restantes:

1. Los grants de `role_nav_section` pasan de **cosméticos** (solo deciden qué se pinta)
   a **autorización real de páginas**: lo que se ve = lo que se puede entrar.
2. Retrofit de los `nav_item` de `maintenance` que V7 nunca sembró (V9), para que el
   módulo quede mapeado como exige el blueprint.
3. Página de inicio en `/`, libre de grant, que reemplaza a `/dashboards` como destino
   default post-login.
4. Purga de todo el código Power BI (no hay capa de embed real; se replaneará de cero).
5. Un solo componente de sidebar (`PortalSidebar`) para el portal y el panel admin.

## Steps

1. **Materializar y aplicar V9** (`db/migrations/V9__maintenance_nav_items.sql`, SQL ya
   dictaminado por el `dba` durante la planeación). Seed idempotente de los dos ítems
   reales del módulo: `Máquinas → /maintenance/machines` (icon `Wrench`, sort 10) y
   `Procesos → /maintenance/process` (icon `Factory`, sort 20 — `Settings2` no está en
   el mapa curado `icons.tsx`). No toca `is_active` ni `role_nav_section`; no-op si el
   admin ya capturó esos href a mano. **Humano:** `flyway migrate` en `EBI_dev` +
   `pnpm db:gen` antes del build.

2. **Purgar Power BI.** Eliminar `src/app/(portal)/dashboards/**` (2 páginas),
   `src/app/(portal)/admin/reports/**` (3 páginas), `src/app/api/reports/**` (4 routes:
   `route.ts`, `[id]/route.ts`, `categories/route.ts`, `categories/[id]/route.ts`) y
   `src/modules/reports/**` completo. Grep de cierre: cero imports de `modules/reports`,
   cero hrefs a `/dashboards` o `/admin/reports`. Las tablas `dbo.report*` y sus tipos
   generados en `types.ts` quedan intactos (el codegen los regenerará; no editar a mano).

3. **Compartir el resolver de nav cacheado.** Extraer `getCachedNav` (hoy privado en
   `src/app/(portal)/layout.tsx`) a `src/modules/navigation/cache.ts` (mismo
   `unstable_cache`, tag `"nav"`). Lo consumen el layout, la home (paso 4) y el guard
   (paso 6): una sola fuente, una sola invalidación. `getCachedPermissions` se queda
   donde está — no es de este plan.

4. **Página de inicio en `/`.** Borrar `src/app/page.tsx` (el redirect) y crear
   `src/app/(portal)/page.tsx`: server component con bienvenida EZI (Montserrat,
   `#373a36`/`#ff5c35`, sobrio industrial) + grid de tarjetas de las secciones que el
   usuario tiene (de `getCachedNav`; el admin ve también las inactivas, atenuadas —
   coherente con el fix de reactivación). Sin grant: cualquier autenticado la ve.

5. **Recablear defaults `/dashboards` → `/`** (puntos verificados 2026-07-03):
   `middleware.ts:32` (redirect post-login), `modules/org/components/login-form.tsx:20`
   (callbackUrl default), `src/app/not-found.tsx:11`,
   `src/app/(portal)/admin/layout.tsx:20` (rebote de no-admins),
   `modules/navigation/components/portal-topbar.tsx:54` (logo), y los comentarios doc
   (`middleware.ts:10`, `(auth)/login/page.tsx:8`). Además **generalizar la
   autenticación del middleware**: eliminar la lista `isPortal`
   (`/dashboards`||`/admin`, desactualizada) — toda ruta UI no pública (`PUBLIC_PATHS`)
   exige sesión; API igual que hoy. Cierra el hueco de `/maintenance` y `/profile` a
   nivel edge.

6. **Enforcement: grant de sección = acceso a la página.** Nuevo helper server-only
   `requireSectionOrRedirect(code)` en `modules/navigation` (compone `auth()` +
   `getCachedNav` y verifica que `code` esté entre las secciones resueltas del usuario;
   si no → `redirect("/")`). Crear `src/app/(portal)/maintenance/layout.tsx` que lo
   invoca con `"maintenance"`. Propiedad clave: usa exactamente la misma resolución que
   la visibilidad (bypass admin, `is_active`, cache tag `"nav"` incluidos) — una sección
   inactiva es inaccesible para todos, consistente con el dark launch. `/` y `/profile`
   quedan fuera del registro (solo autenticación); `/admin/*` conserva
   `assertAdminOrRedirect`.

7. **Sidebar único (portal + admin).** Definir `ADMIN_NAV_SECTION` construida en código
   (constante `ResolvedNavSection` con ids sintéticos negativos) en
   `src/components/layout/admin-nav.ts`: Usuarios (hijos: Usuarios, Perfiles de acceso,
   Plantas, Departamentos), Accesos a módulos (`/admin/access`), Permisos por acción
   (`/admin/permissions`) — el ejecutor reconcilia contra las páginas `/admin/*` reales.
   `src/app/(portal)/admin/layout.tsx` monta `<PortalSidebar section={ADMIN_NAV_SECTION}
   initialPinned={cookie}>` (lee `SIDEBAR_PIN_COOKIE` con `cookies()`). Eliminar
   `src/components/layout/admin-panel-sidebar.tsx`. `PortalShell` no cambia (sigue
   ocultando el rail global bajo `/admin`).

8. **ADR 0005 — "Section grants authorize pages."** Decisión permanente: `nav_section.code`
   es la unidad de autorización de páginas; cada módulo la aplica en su segment layout con
   `requireSectionOrRedirect`; complementa (no reemplaza) los permisos por acción de ADR
   0004. (0004 ya está tomado por RBAC; 0005 es el siguiente libre.)

9. **Docs de contrato** (además del `docs-sync` automático de `/build-plan`):
   `docs/modules/navigation.md` — reescribir la sección "Does not own: route protection"
   (ahora sí la posee vía el guard); `docs/architecture/module-blueprint.md` §5 — añadir
   el segment layout con `requireSectionOrRedirect` al recipe; fila "Layout / navigation"
   de `docs/docs-routing.md` — gotcha actualizado; `docs/STATE.md` — corregir líneas
   rancias detectadas al planear (convención de ramas `feat/m{n}` → slug; "maintenance
   still is_active=0"; "`page.tsx` → redirect `/dashboards`").

10. **Paso humano post-build (dato, no código):** en `/admin/access`, eliminar
    permanentemente la sección huérfana `Dashboards` (section_id 1). **Irreversible:**
    la cascada V7 borra su ítem y sus grants de rol — aceptado, la ruta ya no existirá.

## Database impact

**V9 — solo datos.** Dos `INSERT ... SELECT ... WHERE NOT EXISTS` idempotentes sobre
`auth.nav_item` (retrofit de los ítems de `maintenance`). Dictamen del `dba`:

- **Operaciones irreversibles:** ninguna (solo inserta, condicionado a ausencia; sin
  UPDATE/DELETE/DDL).
- **Delta de ERD:** ninguno — solo datos; los diagramas `docs/database/erd/` no cambian.
- **Índices/rendimiento:** ninguno; se apoya en `UQ_nav_section_code` y
  `UQ_nav_item_section_href` existentes; añade ≤2 filas a una tabla diminuta.

La eliminación de la sección `Dashboards` (paso 10) es un borrado de datos por la UI
existente (cascada diseñada en V7), no una migración.

## Amendments

<!-- Appended during /verify-plan, never edited into the sections above. -->

- 2026-07-03 (post-build, in scope) — **Completed the Power BI purge in the DB.**
  The original plan (step 2) deliberately left `dbo.report` / `dbo.report_category`
  and the `reports.%` permission codes intact ("se replaneará de cero"). On the
  user's call, we closed the two loose ends `docs-sync` flagged, in this session:
  **V10** (`V10__drop_reports_powerbi.sql`, authored by the `dba`) DROPs both
  now-orphan tables (0 rows, only internal FK) and DELETEs the 6 inert
  `reports.%` permission codes (0 grants). After apply, `pnpm db:gen` drops
  `Report`/`ReportCategory` from `types.ts`. **Irreversible** (DROP TABLE) but no
  data loss. `dbo` is left with no portal tables. When Power BI is actually built,
  its tables and permission codes get re-planned and re-migrated from scratch
  (ADR 0001 still governs auth). Objective unchanged — this tightens the purge, it
  does not alter the plan's direction.
- 2026-07-03 (/verify-plan) — **Verified. Gates green + one UI fix.**
  - `pnpm lint` clean; `pnpm build` **green** — route table confirms the purge
    (no `/dashboards`, `/admin/reports`, `/api/reports`) and the new routes
    (`/` home, `/maintenance/{machines,process}`, `/admin/permissions`). App
    boots; `/login` renders with no console errors; a protected route
    (`/maintenance/machines`) redirects when unauthenticated → middleware
    default-deny confirmed.
  - **Fix (code):** the shared `PortalSidebar` hover-overlay panel had no
    z-index, so `DataTable`'s `sticky top-0 z-10` header bled *over* the
    expanding rail (visible on `/admin`, first surfaced because the admin panel
    now uses `PortalSidebar`). Added `z-30` to the overlay panel
    (`portal-sidebar.tsx`) — below modals/dropdowns (z-50), above content. The
    pinned case already reflows content correctly (in-flow `w-60`), so no change
    there.
  - **Diagnosis (not a code defect):** "no sidebar on `/maintenance`" was a
    stale `unstable_cache` — V9 seeded the items via SQL, which fires no
    `revalidateTag("nav")`, so a dev server started before V9 served the old
    item-less resolution. DB verified correct (2 active items); a cold server
    (or any `/admin/access` edit) resolves it. Inherent to tag-invalidation vs.
    out-of-band DB seeds; production picks it up on deploy restart.
  - **Not done (no stored creds):** the authenticated click-through of the two
    sidebar behaviors — `.env` has no `TEST_PORTAL_*` this session. Delegated to
    the user's live session; the z-index fix is build-clean and applies via HMR.
