"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  GripVertical,
  ListTree,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/kit/confirm-dialog";
import { SectionHeader } from "@/components/kit/section-header";
import { NavIcon } from "@/components/kit/nav-icon";
import { SectionEditDialog } from "@/modules/org/components/section-edit-dialog";
import { ItemEditDialog } from "@/modules/org/components/item-edit-dialog";
import type { ItemRow, SectionRow } from "@/modules/org/components/permission-manager";
import { reorder } from "@/lib/reorder";
import { apiMutate } from "@/lib/api-client";

type DragScope = "sections" | `items:${number}` | `children:${number}`;

/** Normalized per-section state: display/drag order of its top-level items,
 * the order of each top item's children, and which item ids are granted
 * (visible) for the role. Order alone encodes priority — a toggle never
 * needs to invent a priority number, it just adds/removes from `grants`. */
interface SectionEntry {
  topOrder: number[];
  childOrder: Map<number, number[]>;
  grants: Set<number>;
}

function defaultSectionOrder(sections: SectionRow[]): number[] {
  return [...sections].sort((a, b) => a.sort_order - b.sort_order).map((s) => s.section_id);
}

/** Builds the one normalized state map from scratch: `priorities` (item_id ->
 * per-role priority) both orders the items and marks them granted (presence
 * = granted). Ungranted items sort after granted ones, by their global
 * `sort_order`. */
function buildSectionState(
  sections: SectionRow[],
  items: ItemRow[],
  priorities: Map<number, number>,
): Map<number, SectionEntry> {
  const itemsById = new Map(items.map((i) => [i.item_id, i]));
  const rank = (id: number) => {
    const p = priorities.get(id);
    if (p !== undefined) return p;
    return 1_000_000 + (itemsById.get(id)?.sort_order ?? 0);
  };
  const state = new Map<number, SectionEntry>();
  for (const s of sections) {
    const tops = items
      .filter((i) => i.section_id === s.section_id && i.parent_item_id === null)
      .sort((a, b) => rank(a.item_id) - rank(b.item_id));
    const childOrder = new Map<number, number[]>();
    const grants = new Set<number>();
    for (const top of tops) {
      if (priorities.has(top.item_id)) grants.add(top.item_id);
      const children = items
        .filter((c) => c.parent_item_id === top.item_id)
        .sort((a, b) => rank(a.item_id) - rank(b.item_id));
      if (children.length > 0) {
        childOrder.set(top.item_id, children.map((c) => c.item_id));
        for (const c of children) if (priorities.has(c.item_id)) grants.add(c.item_id);
      }
    }
    state.set(s.section_id, { topOrder: tops.map((t) => t.item_id), childOrder, grants });
  }
  return state;
}

// ---------------------------------------------------------------------------
// Right panel: page-granular nav access + order tree (role_nav_item, ADR 0008)
// ---------------------------------------------------------------------------

export function NavAccessTree({
  sections,
  items,
  roleId,
  roleName,
  isAdminRole,
}: {
  sections: SectionRow[];
  items: ItemRow[];
  roleId: number | null;
  roleName: string | null;
  isAdminRole: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [dirty, setDirty] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [expandedSectionId, setExpandedSectionId] = React.useState<number | null>(
    sections[0]?.section_id ?? null,
  );
  const [drag, setDrag] = React.useState<{ scope: DragScope; id: number } | null>(null);

  const [sectionOrder, setSectionOrder] = React.useState<number[]>(() =>
    defaultSectionOrder(sections),
  );
  const [sectionState, setSectionState] = React.useState<Map<number, SectionEntry>>(() =>
    buildSectionState(sections, items, new Map()),
  );

  const itemsById = React.useMemo(() => new Map(items.map((i) => [i.item_id, i])), [items]);
  const sectionsById = React.useMemo(
    () => new Map(sections.map((s) => [s.section_id, s])),
    [sections],
  );

  // Reacts to `roleId`/`isAdminRole` AND to `items`/`sections` themselves —
  // both are legitimate: a nav edit (new/renamed page) calls `router.refresh()`,
  // which re-passes fresh arrays down and should rebuild the tree, not just a
  // role switch. No eslint-disable needed: nothing here is spuriously omitted.
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (roleId === null || isAdminRole) {
        setSectionState(buildSectionState(sections, items, new Map()));
        setSectionOrder(defaultSectionOrder(sections));
        return;
      }
      setLoading(true);
      setError(null);
      setDirty(false);
      setSaved(false);
      try {
        const [itemsRes, sectionsRes] = await Promise.all([
          fetch(`/api/org/roles/${roleId}/items`),
          fetch(`/api/org/roles/${roleId}/sections`),
        ]);
        if (!itemsRes.ok || !sectionsRes.ok) throw new Error();
        const itemsData = (await itemsRes.json()) as { grants?: { item_id: number; priority: number }[] };
        const sectionsData = (await sectionsRes.json()) as {
          grants?: { section_id: number; priority: number }[];
        };
        if (cancelled) return;
        const priorities = new Map((itemsData.grants ?? []).map((g) => [g.item_id, g.priority]));
        const secPrio = new Map((sectionsData.grants ?? []).map((g) => [g.section_id, g.priority]));
        setSectionState(buildSectionState(sections, items, priorities));
        setSectionOrder(
          [...sections]
            .sort((a, b) => {
              const pa = secPrio.get(a.section_id);
              const pb = secPrio.get(b.section_id);
              if (pa !== undefined && pb !== undefined) return pa - pb;
              if (pa !== undefined) return -1;
              if (pb !== undefined) return 1;
              return a.sort_order - b.sort_order;
            })
            .map((s) => s.section_id),
        );
      } catch {
        if (!cancelled) setError("No se pudo cargar la visibilidad del rol.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roleId, isAdminRole, sections, items]);

  // A page is visible if it's granted (admin sees everything).
  const isItemVisible = React.useCallback(
    (itemId: number) => {
      if (isAdminRole) return true;
      const item = itemsById.get(itemId);
      if (!item) return false;
      return sectionState.get(item.section_id)?.grants.has(itemId) ?? false;
    },
    [isAdminRole, itemsById, sectionState],
  );

  // A section is DERIVED-visible: ≥1 of its pages is visible.
  const isSectionVisible = React.useCallback(
    (sectionId: number) => isAdminRole || (sectionState.get(sectionId)?.grants.size ?? 0) > 0,
    [isAdminRole, sectionState],
  );

  // Display order of sections: visible first (in sectionOrder), ungranted last.
  const displaySectionOrder = React.useMemo(() => {
    return [...sectionOrder].sort((a, b) => {
      const va = isSectionVisible(a) ? 0 : 1;
      const vb = isSectionVisible(b) ? 0 : 1;
      if (va !== vb) return va - vb;
      return sectionOrder.indexOf(a) - sectionOrder.indexOf(b);
    });
  }, [sectionOrder, isSectionVisible]);

  // P{n} badge rank per visible section — computed once instead of an
  // O(n) filter+indexOf per row (which made the whole list O(n²)).
  const visibleRank = React.useMemo(() => {
    const map = new Map<number, number>();
    let rank = 0;
    for (const id of displaySectionOrder) {
      if (isSectionVisible(id)) map.set(id, ++rank);
    }
    return map;
  }, [displaySectionOrder, isSectionVisible]);

  function markDirty() {
    setDirty(true);
    setSaved(false);
  }

  function toggleItemVisible(itemId: number) {
    if (isAdminRole) return;
    const item = itemsById.get(itemId);
    if (!item) return;
    setSectionState((prev) => {
      const entry = prev.get(item.section_id);
      if (!entry) return prev;
      const grants = new Set(entry.grants);
      if (grants.has(itemId)) grants.delete(itemId);
      else grants.add(itemId);
      const next = new Map(prev);
      next.set(item.section_id, { ...entry, grants });
      return next;
    });
    markDirty();
  }

  // Toggle a whole section = grant/revoke ALL its pages for the role.
  function toggleSectionVisible(sectionId: number) {
    if (isAdminRole) return;
    setSectionState((prev) => {
      const entry = prev.get(sectionId);
      if (!entry) return prev;
      const anyVisible = entry.grants.size > 0;
      const grants = new Set<number>();
      if (!anyVisible) {
        for (const topId of entry.topOrder) {
          grants.add(topId);
          for (const childId of entry.childOrder.get(topId) ?? []) grants.add(childId);
        }
      }
      const next = new Map(prev);
      next.set(sectionId, { ...entry, grants });
      return next;
    });
    markDirty();
  }

  function onDragStart(scope: DragScope, id: number) {
    setDrag({ scope, id });
  }
  function onDragOverRow(scope: DragScope, id: number) {
    if (!drag || drag.scope !== scope || drag.id === id) return;
    if (scope === "sections") {
      setSectionOrder((prev) => reorder(prev, drag.id, id));
    } else if (scope.startsWith("items:")) {
      const sectionId = Number(scope.slice(6));
      setSectionState((prev) => {
        const entry = prev.get(sectionId);
        if (!entry) return prev;
        const next = new Map(prev);
        next.set(sectionId, { ...entry, topOrder: reorder(entry.topOrder, drag.id, id) });
        return next;
      });
    } else {
      const parentId = Number(scope.slice(9));
      const parentItem = itemsById.get(parentId);
      if (!parentItem) return;
      setSectionState((prev) => {
        const entry = prev.get(parentItem.section_id);
        if (!entry) return prev;
        const childOrder = new Map(entry.childOrder);
        childOrder.set(parentId, reorder(childOrder.get(parentId) ?? [], drag.id, id));
        const next = new Map(prev);
        next.set(parentItem.section_id, { ...entry, childOrder });
        return next;
      });
    }
    markDirty();
  }
  function onDragEndRow() {
    setDrag(null);
  }

  async function onSave() {
    if (roleId === null || isAdminRole) return;
    setBusy(true);
    setError(null);
    try {
      // Page grants: for each visible item, priority = its rank in the display
      // order (top items then their children), so per-role order round-trips.
      const grants: { item_id: number; priority: number }[] = [];
      let seq = 0;
      for (const sectionId of sectionOrder) {
        const entry = sectionState.get(sectionId);
        if (!entry) continue;
        for (const topId of entry.topOrder) {
          if (entry.grants.has(topId)) grants.push({ item_id: topId, priority: seq++ * 10 });
          for (const childId of entry.childOrder.get(topId) ?? []) {
            if (entry.grants.has(childId)) grants.push({ item_id: childId, priority: seq++ * 10 });
          }
        }
      }
      // Section order: only granted (derived-visible) sections, in display order.
      const sectionGrants = displaySectionOrder
        .filter((id) => isSectionVisible(id))
        .map((id, idx) => ({ section_id: id, priority: idx * 10 }));

      await Promise.all([
        apiMutate(`/api/org/roles/${roleId}/items`, {
          method: "PUT",
          body: { grants },
          fallback: "No se pudo guardar el acceso/orden.",
        }),
        apiMutate(`/api/org/roles/${roleId}/sections`, {
          method: "PUT",
          body: { grants: sectionGrants },
          fallback: "No se pudo guardar el acceso/orden.",
        }),
      ]);
      setDirty(false);
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setBusy(false);
    }
  }

  const [sectionDialogId, setSectionDialogId] = React.useState<number | null>(null);
  const [itemDialog, setItemDialog] = React.useState<{
    sectionId: number;
    parentItemId: number | null;
    editId: number | null;
  } | null>(null);
  const [deleteItemId, setDeleteItemId] = React.useState<number | null>(null);
  const [deleteItemBusy, setDeleteItemBusy] = React.useState(false);

  async function deleteItem() {
    if (deleteItemId === null) return;
    setDeleteItemBusy(true);
    await fetch(`/api/navigation/nav/items/${deleteItemId}`, { method: "DELETE" });
    setDeleteItemBusy(false);
    setDeleteItemId(null);
    router.refresh();
  }

  const visibleSectionCount = visibleRank.size;

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card shadow-sm">
      <SectionHeader
        variant="panel"
        icon={ListTree}
        title="Estructura del menú"
        description="Qué páginas ve el rol y en qué orden. Una sección sin páginas visibles se manda al
            final."
      />

      <div className="flex items-center gap-4 border-b bg-gray-50 px-4 py-2 text-[11.5px] text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-ezi-orange" />
          Página visible
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-gray-300 opacity-50" />
          Oculta para este rol
        </span>
        <span className="ml-auto font-mono">
          {roleId === null
            ? "—"
            : isAdminRole
              ? `admin · ve ${sections.length} secciones`
              : `${roleName ?? ""} · ve ${visibleSectionCount}/${sections.length} secciones`}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {loading ? (
          <p className="p-4 text-sm text-muted-foreground">Cargando…</p>
        ) : (
          displaySectionOrder.map((sectionId) => {
            const section = sectionsById.get(sectionId);
            const entry = sectionState.get(sectionId);
            if (!section || !entry) return null;
            const sectionVisible = isSectionVisible(sectionId);
            const expanded = expandedSectionId === sectionId;
            const topItems = entry.topOrder;
            return (
              <div key={sectionId}>
                <div
                  draggable={!isAdminRole}
                  onDragStart={() => onDragStart("sections", sectionId)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    onDragOverRow("sections", sectionId);
                  }}
                  onDrop={(e) => e.preventDefault()}
                  onDragEnd={onDragEndRow}
                  className={cn(
                    "flex items-center gap-2.5 border-b px-3.5 py-2.5",
                    expanded ? "bg-gray-50" : "bg-white",
                    !sectionVisible && "opacity-[0.42]",
                  )}
                >
                  {!isAdminRole ? (
                    <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-gray-300" />
                  ) : (
                    <span className="w-4 shrink-0" />
                  )}
                  <button
                    onClick={() => setExpandedSectionId(expanded ? null : sectionId)}
                    className="flex shrink-0 items-center justify-center rounded p-0.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                    aria-label="Expandir"
                  >
                    {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                  <NavIcon name={section.icon} className="h-[18px] w-[18px] shrink-0 text-ezi-orange" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold leading-tight">{section.label}</div>
                    <div className="font-mono text-[11px] text-gray-400">{section.base_path}</div>
                  </div>
                  {sectionVisible ? (
                    <Badge variant="muted" className="whitespace-nowrap font-mono text-[11px] font-semibold">
                      P{visibleRank.get(sectionId)}
                    </Badge>
                  ) : null}
                  <button
                    onClick={() => setSectionDialogId(sectionId)}
                    className="flex shrink-0 items-center justify-center rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-800"
                    aria-label={`Editar ${section.label}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  {isAdminRole ? (
                    <Eye className="h-[15px] w-[15px] shrink-0 text-gray-300" />
                  ) : (
                    <button
                      onClick={() => toggleSectionVisible(sectionId)}
                      className="flex shrink-0 items-center"
                      aria-label={sectionVisible ? "Ocultar toda la sección" : "Mostrar toda la sección"}
                      title={sectionVisible ? "Ocultar todas las páginas" : "Mostrar todas las páginas"}
                    >
                      {sectionVisible ? (
                        <Eye className="h-[15px] w-[15px] text-gray-300" />
                      ) : (
                        <EyeOff className="h-[15px] w-[15px] text-ezi-orange" />
                      )}
                    </button>
                  )}
                </div>

                {expanded ? (
                  <div className="border-b bg-gray-50">
                    {topItems.length === 0 ? (
                      <p className="py-3 pl-[46px] pr-3.5 text-xs italic text-gray-400">
                        Sin páginas de sidebar en esta sección.
                      </p>
                    ) : (
                      topItems.map((itemId) => {
                        const item = itemsById.get(itemId);
                        if (!item) return null;
                        const children = entry.childOrder.get(itemId) ?? [];
                        const itemVisible = isItemVisible(itemId);
                        return (
                          <div key={itemId}>
                            <div
                              draggable
                              onDragStart={() => onDragStart(`items:${sectionId}`, itemId)}
                              onDragOver={(e) => {
                                e.preventDefault();
                                onDragOverRow(`items:${sectionId}`, itemId);
                              }}
                              onDrop={(e) => e.preventDefault()}
                              onDragEnd={onDragEndRow}
                              className={cn(
                                "flex items-center gap-2 border-t py-2 pl-[46px] pr-3.5",
                                !itemVisible && "opacity-[0.45]",
                              )}
                            >
                              <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-gray-300" />
                              <NavIcon name={item.icon} className="h-4 w-4 shrink-0 text-gray-500" />
                              <div className="min-w-0 flex-1">
                                <div className="text-[13px] font-medium leading-tight text-gray-800">
                                  {item.label}
                                </div>
                                <div className="font-mono text-[10.5px] text-gray-400">{item.href}</div>
                              </div>
                              {!isAdminRole ? (
                                <button
                                  onClick={() => toggleItemVisible(itemId)}
                                  className="flex shrink-0 items-center"
                                  aria-label={itemVisible ? "Ocultar página" : "Mostrar página"}
                                  title={itemVisible ? "Ocultar página" : "Mostrar página"}
                                >
                                  {itemVisible ? (
                                    <Eye className="h-[15px] w-[15px] text-gray-300" />
                                  ) : (
                                    <EyeOff className="h-[15px] w-[15px] text-ezi-orange" />
                                  )}
                                </button>
                              ) : null}
                              <button
                                onClick={() => setItemDialog({ sectionId, parentItemId: null, editId: itemId })}
                                className="flex shrink-0 items-center justify-center rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-800"
                                aria-label={`Editar ${item.label}`}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => setItemDialog({ sectionId, parentItemId: itemId, editId: null })}
                                className="flex shrink-0 items-center justify-center rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-800"
                                aria-label={`Agregar hijo de ${item.label}`}
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => setDeleteItemId(itemId)}
                                className="flex shrink-0 items-center justify-center rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-destructive"
                                aria-label={`Eliminar ${item.label}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            {children.map((childId) => {
                              const child = itemsById.get(childId);
                              if (!child) return null;
                              const childVisible = isItemVisible(childId);
                              return (
                                <div
                                  key={childId}
                                  draggable
                                  onDragStart={() => onDragStart(`children:${itemId}`, childId)}
                                  onDragOver={(e) => {
                                    e.preventDefault();
                                    onDragOverRow(`children:${itemId}`, childId);
                                  }}
                                  onDrop={(e) => e.preventDefault()}
                                  onDragEnd={onDragEndRow}
                                  className={cn(
                                    "flex items-center gap-2 border-t py-1.5 pl-[72px] pr-3.5",
                                    !childVisible && "opacity-[0.45]",
                                  )}
                                >
                                  <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-gray-300" />
                                  <span className="h-[5px] w-[5px] shrink-0 rounded-full bg-gray-300" />
                                  <span className="min-w-0 flex-1 text-[12.5px] text-gray-700">
                                    {child.label}
                                  </span>
                                  {!isAdminRole ? (
                                    <button
                                      onClick={() => toggleItemVisible(childId)}
                                      className="flex shrink-0 items-center"
                                      aria-label={childVisible ? "Ocultar página" : "Mostrar página"}
                                      title={childVisible ? "Ocultar página" : "Mostrar página"}
                                    >
                                      {childVisible ? (
                                        <Eye className="h-[14px] w-[14px] text-gray-300" />
                                      ) : (
                                        <EyeOff className="h-[14px] w-[14px] text-ezi-orange" />
                                      )}
                                    </button>
                                  ) : null}
                                  <button
                                    onClick={() =>
                                      setItemDialog({ sectionId, parentItemId: itemId, editId: childId })
                                    }
                                    className="flex shrink-0 items-center justify-center rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-800"
                                    aria-label={`Editar ${child.label}`}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => setDeleteItemId(childId)}
                                    className="flex shrink-0 items-center justify-center rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-destructive"
                                    aria-label={`Eliminar ${child.label}`}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })
                    )}
                    <div className="py-2 pl-[46px] pr-3.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setItemDialog({ sectionId, parentItemId: null, editId: null })}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Nueva página
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t p-3">
        <div className="min-h-[18px] text-xs">
          {error ? (
            <span className="text-destructive" role="alert">
              {error}
            </span>
          ) : dirty ? (
            <span className="text-warning">Cambios sin guardar</span>
          ) : saved ? (
            <span className="text-success">Visibilidad y orden guardados.</span>
          ) : (
            <span className="text-muted-foreground">
              Oculta páginas o secciones; sin páginas visibles, la sección se manda al final.
            </span>
          )}
        </div>
        <Button variant="outline" onClick={() => void onSave()} disabled={busy || loading || isAdminRole}>
          {busy ? "Guardando…" : "Guardar visibilidad y orden"}
        </Button>
      </div>

      {sectionDialogId !== null ? (
        <SectionEditDialog
          section={sectionsById.get(sectionDialogId) ?? null}
          onOpenChange={(open) => !open && setSectionDialogId(null)}
          onSaved={() => {
            setSectionDialogId(null);
            router.refresh();
          }}
        />
      ) : null}

      {itemDialog ? (
        <ItemEditDialog
          sectionId={itemDialog.sectionId}
          section={sectionsById.get(itemDialog.sectionId) ?? null}
          parentItemId={itemDialog.parentItemId}
          topLevelItems={(sectionState.get(itemDialog.sectionId)?.topOrder ?? [])
            .map((id) => itemsById.get(id))
            .filter((i): i is ItemRow => Boolean(i))}
          item={itemDialog.editId !== null ? (itemsById.get(itemDialog.editId) ?? null) : null}
          onOpenChange={(open) => !open && setItemDialog(null)}
          onSaved={() => {
            setItemDialog(null);
            router.refresh();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={deleteItemId !== null}
        onOpenChange={(open) => !open && setDeleteItemId(null)}
        title="Eliminar página"
        description={`Esta acción no se puede deshacer. Se eliminará${
          deleteItemId !== null ? ` "${itemsById.get(deleteItemId)?.label ?? ""}"` : ""
        } del menú.`}
        confirmLabel="Eliminar"
        busy={deleteItemBusy}
        onConfirm={deleteItem}
      />
    </section>
  );
}
