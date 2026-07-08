"use client";

import * as React from "react";
import { Factory, Boxes, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { EntityCard, EntityCardGrid } from "@/components/kit/entity-card";
import type { ExpandingModalRect } from "@/components/kit/expanding-modal";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { MachineRow } from "@/modules/maintenance/components/machines-cards-page";

export interface MachineCardsGridProps {
  machines: MachineRow[];
  /** Clicking a card expands it into the detail modal instead of navigating. */
  onOpen: (m: MachineRow, rect: ExpandingModalRect) => void;
  /** The asset whose card should hide its own content because its modal is open. */
  hiddenAssetId?: number | null;
  /** Right-click actions. Each item renders only when its handler is
   * provided — the caller gates the handlers by permission. Desactivar shows
   * on active rows, Reactivar on inactive ones. The rect is resolved from the
   * card's own element (not the menu click point) so "Editar" animates from
   * the same place a direct card click would; `null` if the ref is somehow
   * gone, which the modal degrades to a centered fade-in for. */
  onEdit?: (m: MachineRow, rect: ExpandingModalRect | null) => void;
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
  onOpen,
  hiddenAssetId = null,
  onEdit,
  onDeactivate,
  onRestore,
}: MachineCardsGridProps) {
  const hasMenu = Boolean(onEdit || onDeactivate || onRestore);
  const cardRefs = React.useRef(new Map<number, HTMLElement>());
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
            onExpand={(rect) => onOpen(m, rect)}
            sourceHidden={hiddenAssetId === m.asset_id}
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
              <div
                className="h-full"
                ref={(el) => {
                  if (el) cardRefs.current.set(m.asset_id, el);
                  else cardRefs.current.delete(m.asset_id);
                }}
              >
                {card}
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
              {onEdit ? (
                <ContextMenuItem
                  onSelect={() =>
                    afterMenuCloses(() => {
                      const el = cardRefs.current.get(m.asset_id);
                      onEdit(m, el ? el.getBoundingClientRect() : null);
                    })
                  }
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
