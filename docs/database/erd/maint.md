# ERD — esquema `maint`

> Generado a partir de las migraciones aplicadas `V5__maint_asset_catalog.sql`,
> `V6__maint_plans_workorders_spares.sql` y `V11__produccion_schema.sql` (columna
> `asset.asset_category`). No editar a mano; lo regenera el sub-agente
> `docs-sync` al cierre de cada `/build-plan`.
>
> Última sincronización: 2026-07-03. Refleja V5 + V6 + V11.

```mermaid
erDiagram

    process {
        int process_id PK
        nvarchar_32 code
        nvarchar_160 name
        nvarchar_512 description
        bit is_active
        datetime2 created_at
        datetime2 updated_at
    }

    asset {
        int asset_id PK
        nvarchar_32 code
        nvarchar_200 name
        nvarchar_120 brand
        nvarchar_120 model
        nvarchar_120 serial_number
        int plant_id FK
        nvarchar_160 location
        char_1 criticality
        nvarchar_20 status
        nvarchar_20 asset_category
        int parent_asset_id FK
        date acquisition_date
        nvarchar_2000 notes
        bit is_active
        datetime2 created_at
        datetime2 updated_at
    }

    asset_process {
        int asset_id PK,FK
        int process_id PK,FK
    }

    asset_restriction {
        int restriction_id PK
        int asset_id FK
        nvarchar_20 restriction_type
        nvarchar_max description
        bit is_active
        datetime2 created_at
        datetime2 updated_at
    }

    asset_document {
        int document_id PK
        int asset_id FK
        nvarchar_24 doc_type
        nvarchar_200 title
        nvarchar_400 blob_path
        nvarchar_120 content_type
        bigint file_size_bytes
        int version
        bit is_active
        int uploaded_by FK
        datetime2 uploaded_at
    }

    spare_part {
        int spare_part_id PK
        nvarchar_32 code
        nvarchar_200 name
        nvarchar_512 description
        nvarchar_10 uom
        decimal_9_2 min_stock
        decimal_12_2 unit_cost
        bit is_active
        datetime2 created_at
        datetime2 updated_at
    }

    maintenance_plan {
        int plan_id PK
        int asset_id FK
        nvarchar_20 plan_type
        nvarchar_200 name
        nvarchar_1000 description
        int frequency_value
        nvarchar_10 frequency_unit
        int estimated_minutes
        nvarchar_30 schedule_mode
        date next_due_date
        bit is_active
        datetime2 created_at
        datetime2 updated_at
    }

    plan_task {
        int plan_task_id PK
        int plan_id FK
        int seq
        nvarchar_200 title
        nvarchar_max instructions
        int visual_aid_document_id FK
    }

    plan_material {
        int plan_material_id PK
        int plan_id FK
        int spare_part_id FK
        decimal_9_2 quantity
    }

    work_order {
        int work_order_id PK
        nvarchar code "computed PERSISTED: WO-000001"
        int asset_id FK
        int plan_id FK
        nvarchar_20 wo_type
        nvarchar_20 status
        date scheduled_date
        datetime2 started_at
        datetime2 completed_at
        int assigned_to FK
        int completed_by FK
        int downtime_minutes
        nvarchar_2000 notes
        datetime2 created_at
        datetime2 updated_at
    }

    work_order_task {
        int work_order_task_id PK
        int work_order_id FK
        int seq
        nvarchar_200 title
        nvarchar_max instructions
        bit is_done
        int done_by FK
        datetime2 done_at
        nvarchar_1000 comment
    }

    work_order_material {
        int work_order_material_id PK
        int work_order_id FK
        int spare_part_id FK
        decimal_9_2 quantity
    }

    stock_movement {
        int stock_movement_id PK
        int spare_part_id FK
        nvarchar_20 movement_type
        decimal_9_2 quantity "signed: in>0, out<0"
        int work_order_id FK
        int moved_by FK
        datetime2 moved_at
        nvarchar_400 note
    }

    %% ── relaciones ──────────────────────────────────────────────────────────

    asset ||--o{ asset : "sub-ensamble (parent_asset_id)"

    asset   ||--o{ asset_process : "runs"
    process ||--o{ asset_process : "performed by"

    asset ||--o{ asset_restriction : "restricted by"
    asset ||--o{ asset_document    : "documented by"

    asset            ||--o{ maintenance_plan : "planned by"
    maintenance_plan ||--o{ plan_task        : "checklist"
    asset_document   ||--o{ plan_task        : "visual aid"
    maintenance_plan ||--o{ plan_material    : "plans usage of"
    spare_part       ||--o{ plan_material    : "planned in"

    asset            ||--o{ work_order          : "worked on"
    maintenance_plan ||--o{ work_order          : "generates"
    work_order       ||--o{ work_order_task     : "snapshot checklist"
    work_order       ||--o{ work_order_material : "consumes"
    spare_part       ||--o{ work_order_material : "consumed in"

    spare_part ||--o{ stock_movement : "ledger of"
    work_order ||--o{ stock_movement : "originates (out)"
```

## FKs hacia otros esquemas

- `asset.plant_id` → `auth.plant.plant_id` (sin cascade).
- `asset_document.uploaded_by` → `auth.app_user.user_id` (sin cascade).
- `work_order.assigned_to`, `work_order.completed_by` → `auth.app_user.user_id` (sin cascade).
- `work_order_task.done_by` → `auth.app_user.user_id` (sin cascade).
- `stock_movement.moved_by` → `auth.app_user.user_id` (sin cascade).

FK entrante desde otro esquema: `production.asset_cell_assignment.asset_id` →
`maint.asset.asset_id` (sin cascade; ver [production.md](production.md)).

## Notas de diseño (V5/V6)

- Enumeraciones vía `CHECK` constraints con nombre (sin tablas lookup).
- Soft-delete con `is_active`; `updated_at` lo mantiene la app (sin triggers).
- Stock = solo ledger (`stock_movement`, append-only, cantidad **con signo**);
  stock actual = `SUM(quantity)` por refacción (índice cubriente `IX_stock_movement_part`).
- `work_order.code` es columna calculada PERSISTED (`WO-` + identity a 6 dígitos)
  con índice único `UQ_work_order_code`.
- Las work orders son historia: sin cascades hacia ellas; solo sus filas hijas
  (`work_order_task`, `work_order_material`) cascadean desde su cabecera.
- Cascades restantes: `asset` → `asset_process`, `asset_restriction`;
  `maintenance_plan` → `plan_task`, `plan_material`.
- V11 añade `asset.asset_category` (`CHECK IN ('production_equipment',
  'material_handling')`, `DEFAULT 'production_equipment'`, índice
  `IX_asset_category`). La ubicación física del activo ahora la historiza
  `production.asset_cell_assignment` (esquema creado como `produccion` en V11
  y renombrado en V12); `asset.location` (texto libre) sigue
  existiendo hasta una decisión futura.
