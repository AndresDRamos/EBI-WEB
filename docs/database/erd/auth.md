# ERD — esquema `auth`

> Generado desde el esquema vivo (`ebi-sql-dev`, read-only). No editar a mano; lo regenera
> el sub-agente `docs-sync` al cierre de cada `/build-plan`.
>
> Última sincronización: 2026-07-14. Refleja V1 + V2 + V3 + V4 + V7 + V8 + V15 +
> V16 (+ semillas de V20) (V5/V6 pertenecen al esquema `maint`, ver
> `docs/database/erd/maint.md`). V15 transfirió `auth.plant` → `org.plant` (ver
> `docs/database/erd/org.md`); `user_plant` permanece en `auth`. V16 añadió
> `role_nav_item` (visibilidad de navegación POR PÁGINA, ADR 0008) y redujo la
> semántica de `role_nav_section` a solo orden de secciones por rol. **V20 (plan
> laser-cut-sequencing) no cambió la estructura de `auth`**: solo insertó
> semillas (ver "Semillas de V20" más abajo).

```mermaid
erDiagram

    app_user {
        int user_id PK
        nvarchar_64 username
        nvarchar_256 email
        nvarchar_160 display_name
        nvarchar_256 password_hash
        bit all_plants
        bit is_active
        int token_version
        datetime2 created_at
        datetime2 updated_at
    }

    role {
        int role_id PK
        nvarchar_40 name
        nvarchar_256 description
        bit is_active
        int department_id FK
    }

    permission {
        int permission_id PK
        nvarchar_80 code
        nvarchar_256 description
        datetime2 created_at
        datetime2 updated_at
    }

    role_permission {
        int role_id PK,FK
        int permission_id PK,FK
    }

    department {
        int department_id PK
        nvarchar_160 name
        bit is_active
        datetime2 created_at
        datetime2 updated_at
        nvarchar_256 description
    }

    user_role {
        int user_id PK,FK
        int role_id PK,FK
    }

    user_plant {
        int user_id PK,FK
        int plant_id PK,FK
    }

    user_department {
        int user_id PK,FK
        int department_id PK,FK
    }

    invitation {
        int invitation_id PK
        int user_id FK
        nvarchar_128 token_hash
        datetime2 expires_at
        datetime2 accepted_at
        int created_by FK
        datetime2 created_at
    }

    nav_section {
        int section_id PK
        nvarchar_40 code
        nvarchar_80 label
        nvarchar_64 icon
        nvarchar_120 base_path
        int sort_order
        bit is_active
        datetime2 created_at
        datetime2 updated_at
    }

    nav_item {
        int item_id PK
        int section_id FK
        int parent_item_id FK
        nvarchar_80 label
        nvarchar_64 icon
        nvarchar_200 href
        int sort_order
        bit is_active
        datetime2 created_at
        datetime2 updated_at
    }

    role_nav_section {
        int role_id PK,FK
        int section_id PK,FK
        int priority
    }

    role_nav_item {
        int role_id PK,FK
        int item_id PK,FK
        int priority
    }

    %% ── relaciones ──────────────────────────────────────────────────────────

    app_user ||--o{ user_role : "assigned"
    role      ||--o{ user_role : "assigned to"

    app_user ||--o{ user_plant : "has access to"
    %% user_plant.plant_id is a cross-schema FK to org.plant (moved in V15).

    app_user   ||--o{ user_department : "belongs to"
    department ||--o{ user_department : "contains"

    app_user ||--o{ invitation : "receives"
    app_user ||--o{ invitation : "issues (created_by)"

    nav_section ||--o{ nav_item : "contains"
    nav_item    ||--o{ nav_item : "parent of (same section)"

    role        ||--o{ role_nav_section : "section order per role"
    nav_section ||--o{ role_nav_section : "ordered via"

    role     ||--o{ role_nav_item : "page visibility (ADR 0008)"
    nav_item ||--o{ role_nav_item : "visible via"

    department ||--o{ role : "scopes (NULL = transversal)"
    role       ||--o{ role_permission : "granted"
    permission ||--o{ role_permission : "granted via"
```

## FKs hacia otros esquemas

- `auth.user_plant.plant_id` → `org.plant.plant_id` (sin cascade). La tabla
  `user_plant` (scope de identidad: qué plantas ve un usuario) sigue en `auth`;
  su FK cruza a `org` desde V15, cuando `plant` se transfirió a `org` (ver
  `docs/database/erd/org.md`).

## FKs entrantes desde otros esquemas (V20)

- `planning.machine_program.created_by` → `auth.app_user.user_id` (sin cascade;
  se preserva la autoría del programa de secuenciación). Ver
  `docs/database/erd/planning.md`.

## Semillas de V20 (plan laser-cut-sequencing)

No hay cambios de DDL en `auth`; V20 solo siembra filas (patrón guardado,
idempotente, precedente V7/V8/V9/V19):

- `nav_section`: sección `planning` (label `Planeación`, icon `ClipboardCheck`,
  `base_path = /planning`, `sort_order = 40`, **`is_active = 0` — dark launch**,
  precedente V7 con `maintenance`).
- `nav_item`: `Secuenciación láser` → `/planning/laser-sequencing`
  (`sort_order = 10`, icon `Layers`) bajo la sección `planning`.
- `permission`: 4 códigos `planning.*` — `planning.program:create`,
  `planning.program:update`, `planning.program:delete`,
  `planning.station_link:manage` (nota: el formato de código rechaza el guión,
  por eso `station_link`, no `station-link`). No se siembra ningún
  `role_permission` (admin bypass, ADR 0004).
