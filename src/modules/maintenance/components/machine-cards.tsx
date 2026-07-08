"use client";

import * as React from "react";
import { Factory, Boxes, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { EntityCard, EntityCardGrid } from "@/components/kit/entity-card";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { MachineRow } from "@/modules/maintenance/components/machines-cards-page";

export interface MachineCardsGridProps {
  machines: MachineRow[];
  /** Right-click actions. Each item renders only when its handler is
   * provided — the caller gates the handlers by permission. Desactivar shows
   * on active rows, Reactivar on inactive ones. */
  onEdit?: (m: MachineRow) => void;
  onDeactivate?: (m: MachineRow) => void;
  onRestore?: (m: MachineRow) => void;
}

/** Radix menu → dialog handoff: opening a dialog synchronously from a menu
 * item's `onSelect` races the menu's own close/unlock, and the body can be
 * left with `pointer-events: none` (page freezes). Defer to the next tick so
 * the menu finishes closing first. */
function afterMenuCloses(fn: () => void) {
  setTimeout(fn, 0);
}

/**
 * Equipos as cards — maps the machines rows onto the kit `EntityCard`
 * (design source: Equipos card, `design/` workflow). The connectivity status
 * is a fixed "Sin conexión" until asset telemetry exists.
 */
export function MachineCardsGrid({
  machines,
  onEdit,
  onDeactivate,
  onRestore,
}: MachineCardsGridProps) {
  const hasMenu = Boolean(onEdit || onDeactivate || onRestore);
  if (machines.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay equipos para mostrar.
      </p>
    );
  }
  return (
    <EntityCardGrid>
      {machines.map((m) => {
        const card = (
          <EntityCard
            code={m.code}
            title={m.name}
            href={`/maintenance/machines/${encodeURIComponent(m.code)}`}
            status={{ label: "Sin conexión", tone: "off" }}
            badges={[
              ...(m.type_name
                ? [
                    {
                      label: m.type_name,
                      className: "border-orange-200 bg-orange-50 text-ezi-orange",
                    },
                  ]
                : []),
              ...(m.category_name ? [{ label: m.category_name }] : []),
            ]}
            details={[
              { label: "Marca", value: m.brand },
              { label: "Modelo", value: m.model },
              { label: "N.º de serie", value: m.serial_number },
            ]}
            locations={[
              { icon: Factory, label: m.plant_name },
              {
                icon: Boxes,
                label:
                  m.cell_names.length > 0
                    ? m.cell_names.join(", ")
                    : "Sin celda asignada",
              },
            ]}
            inactive={!m.is_active}
          />
        );
        if (!hasMenu) return <React.Fragment key={m.asset_id}>{card}</React.Fragment>;
        return (
          <ContextMenu key={m.asset_id}>
            <ContextMenuTrigger asChild>
              <div className="h-full">{card}</div>
            </ContextMenuTrigger>
            <ContextMenuContent>
              {onEdit ? (
                <ContextMenuItem
                  onSelect={() => afterMenuCloses(() => onEdit(m))}
                >
                  <Pencil className="mr-2 h-3.5 w-3.5" />
                  Editar
                </ContextMenuItem>
              ) : null}
              {m.is_active && onDeactivate ? (
                <ContextMenuItem
                  onSelect={() => afterMenuCloses(() => onDeactivate(m))}
                  className="text-ezi-orange focus:text-ezi-orange"
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  Desactivar
                </ContextMenuItem>
              ) : null}
              {!m.is_active && onRestore ? (
                <ContextMenuItem
                  onSelect={() => afterMenuCloses(() => onRestore(m))}
                  className="text-green-700 focus:text-green-700"
                >
                  <RotateCcw className="mr-2 h-3.5 w-3.5" />
                  Reactivar
                </ContextMenuItem>
              ) : null}
            </ContextMenuContent>
          </ContextMenu>
        );
      })}
    </EntityCardGrid>
  );
}
