"use client";

import * as React from "react";
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ActionsCell,
  ActiveInactiveToggle,
} from "@/components/kit/data-table";
import { cn } from "@/lib/utils";

export interface GroupedChildColumn<C> {
  key: string;
  header: string;
  render: (row: C) => React.ReactNode;
  className?: string;
}

type ActionResult = Promise<{ ok?: boolean; error?: string }>;

export interface GroupedDataTableProps<G, C> {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
  groups: G[];
  getGroupId: (g: G) => string | number;
  renderGroupTitle: (g: G) => React.ReactNode;
  groupIsActive: (g: G) => boolean;
  childrenOf: (g: G) => C[];
  getChildId: (c: C) => string | number;
  childIsActive: (c: C) => boolean;
  childColumns: GroupedChildColumn<C>[];
  /** Singular noun for children ("rol") — drives counts and empty text. */
  childNoun: string;
  /** Plural override; defaults to Spanish rules (vowel → +s, else +es). */
  childNounPlural?: string;
  onAddGroup?: () => void;
  addGroupLabel?: string;
  onAddChild?: (g: G) => void;
  /** Tooltip/aria-label of the per-group "+" row action (e.g. "Agregar rol"). */
  addChildLabel?: string;
  /** Groups answering `false` render no actions cell at all (synthetic
   * groups like "Sin departamento"). */
  hasGroupActions?: (g: G) => boolean;
  canAddChild?: (g: G) => boolean;
  onEditGroup?: (g: G) => void;
  onSoftDeleteGroup?: (g: G) => ActionResult;
  onHardDeleteGroup?: (g: G) => ActionResult;
  onRestoreGroup?: (g: G) => ActionResult;
  canDeleteGroup?: (g: G) => boolean;
  onEditChild?: (c: C) => void;
  onSoftDeleteChild?: (c: C) => ActionResult;
  onHardDeleteChild?: (c: C) => ActionResult;
  onRestoreChild?: (c: C) => ActionResult;
  canDeleteChild?: (c: C) => boolean;
  onAfterChange?: () => void;
}

/**
 * Parent/child admin table: collapsible groups with their own CRUD and child
 * rows with their own CRUD + a per-group "add child" button — for entities
 * that only exist inside a parent (roles inside a department). Shares the
 * DataTable look (header band, Activos/Inactivos toggle, row actions) but not
 * pagination or per-column filters: grouped catalogs are dozens of rows.
 *
 * Mode semantics: Activos shows active groups with their active children;
 * Inactivos shows inactive groups plus active groups that contain inactive
 * children (children filtered to the inactive ones), so a deactivated child
 * is always findable under its parent.
 */
export function GroupedDataTable<G, C>({
  icon: Icon,
  title,
  subtitle,
  groups,
  getGroupId,
  renderGroupTitle,
  groupIsActive,
  childrenOf,
  getChildId,
  childIsActive,
  childColumns,
  childNoun,
  childNounPlural,
  onAddGroup,
  addGroupLabel = "Nuevo",
  onAddChild,
  addChildLabel = "Agregar",
  hasGroupActions,
  canAddChild,
  onEditGroup,
  onSoftDeleteGroup,
  onHardDeleteGroup,
  onRestoreGroup,
  canDeleteGroup,
  onEditChild,
  onSoftDeleteChild,
  onHardDeleteChild,
  onRestoreChild,
  canDeleteChild,
  onAfterChange,
}: GroupedDataTableProps<G, C>) {
  const [showInactive, setShowInactive] = React.useState(false);
  // Groups start collapsed; ids created after mount (router.refresh) are not
  // in the set, so a freshly created group conveniently renders expanded.
  const [collapsed, setCollapsed] = React.useState<Set<string | number>>(
    () => new Set(groups.map(getGroupId)),
  );

  function toggleCollapsed(id: string | number) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const visible = React.useMemo(() => {
    return groups
      .map((group) => {
        const all = childrenOf(group);
        const children = all.filter((c) =>
          showInactive ? !childIsActive(c) : childIsActive(c),
        );
        const groupVisible = showInactive
          ? !groupIsActive(group) || children.length > 0
          : groupIsActive(group);
        return { group, children, groupVisible };
      })
      .filter((v) => v.groupVisible);
  }, [groups, childrenOf, childIsActive, groupIsActive, showInactive]);

  const activeCount = React.useMemo(
    () => groups.filter((g) => groupIsActive(g)).length,
    [groups, groupIsActive],
  );
  const inactiveCount = React.useMemo(
    () =>
      groups.filter(
        (g) =>
          !groupIsActive(g) || childrenOf(g).some((c) => !childIsActive(c)),
      ).length,
    [groups, groupIsActive, childrenOf, childIsActive],
  );

  const totalCols = childColumns.length + 1; // + actions column

  const nounPlural =
    childNounPlural ??
    (/[aeiouáéíóú]$/i.test(childNoun) ? `${childNoun}s` : `${childNoun}es`);

  const anyExpanded = visible.some((v) => !collapsed.has(getGroupId(v.group)));
  function toggleAll() {
    setCollapsed(anyExpanded ? new Set(groups.map(getGroupId)) : new Set());
  }

  return (
    <div className="flex flex-col rounded-lg border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <div className="flex items-center gap-3">
          {Icon ? <Icon className="h-5 w-5 text-ezi-orange" /> : null}
          <div>
            <h2 className="font-semibold leading-tight">{title}</h2>
            {subtitle ? (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ActiveInactiveToggle
            showInactive={showInactive}
            onChange={setShowInactive}
            activeCount={activeCount}
            inactiveCount={inactiveCount}
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={toggleAll}
                aria-label={anyExpanded ? "Colapsar todo" : "Expandir todo"}
              >
                {anyExpanded ? (
                  <ChevronsDownUp className="h-4 w-4" />
                ) : (
                  <ChevronsUpDown className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              {anyExpanded ? "Colapsar todo" : "Expandir todo"}
            </TooltipContent>
          </Tooltip>
          {onAddGroup ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" onClick={onAddGroup} aria-label={addGroupLabel}>
                  <Plus className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{addGroupLabel}</TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      </div>

      <div className="flex max-h-[calc(100vh-14rem)] flex-col overflow-auto">
        <Table className="table-fixed">
          <TableHeader className="sticky top-0 z-10 bg-gray-50 shadow-[0_1px_0_var(--border)]">
            <TableRow>
              {childColumns.map((col) => (
                <TableHead
                  key={col.key}
                  className={cn(
                    "text-xs font-semibold uppercase tracking-wide",
                    col.className,
                  )}
                >
                  {col.header}
                </TableHead>
              ))}
              <TableHead className="w-20 px-2 text-right" aria-label="Acciones" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={totalCols} className="text-muted-foreground">
                  No hay registros para mostrar.
                </TableCell>
              </TableRow>
            ) : (
              visible.map(({ group, children }) => {
                const gid = getGroupId(group);
                const isCollapsed = collapsed.has(gid);
                const gActive = groupIsActive(group);
                const showActions = hasGroupActions ? hasGroupActions(group) : true;
                const allowAddChild =
                  Boolean(onAddChild) &&
                  gActive &&
                  !showInactive &&
                  (canAddChild ? canAddChild(group) : true);
                return (
                  <React.Fragment key={String(gid)}>
                    <TableRow className="bg-gray-50/80 hover:bg-gray-100/80">
                      <TableCell colSpan={childColumns.length} className="py-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => toggleCollapsed(gid)}
                            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-gray-200"
                            aria-label={isCollapsed ? "Expandir grupo" : "Colapsar grupo"}
                            aria-expanded={!isCollapsed}
                          >
                            {isCollapsed ? (
                              <ChevronRight className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </button>
                          {renderGroupTitle(group)}
                          {!gActive ? <Badge variant="muted">inactivo</Badge> : null}
                          <span className="text-xs text-muted-foreground">
                            {children.length}{" "}
                            {children.length === 1 ? childNoun : nounPlural}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="px-2">
                        <div className="flex items-center justify-end gap-1">
                          {allowAddChild ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={() => onAddChild?.(group)}
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-orange-50 hover:text-ezi-orange"
                                  aria-label={addChildLabel}
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top">{addChildLabel}</TooltipContent>
                            </Tooltip>
                          ) : null}
                          {showActions ? (
                            <ActionsCell<G>
                              row={group}
                              isActive={groupIsActive}
                              onEdit={onEditGroup}
                              onSoftDelete={onSoftDeleteGroup}
                              onHardDelete={onHardDeleteGroup}
                              onRestore={onRestoreGroup}
                              canDelete={canDeleteGroup}
                              onAfterChange={onAfterChange}
                            />
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                    {!isCollapsed
                      ? children.map((child) => (
                          <TableRow key={String(getChildId(child))}>
                            {childColumns.map((col, i) => (
                              <TableCell
                                key={col.key}
                                className={cn(i === 0 && "pl-10", col.className)}
                              >
                                {col.render(child)}
                              </TableCell>
                            ))}
                            <TableCell className="px-2">
                              <ActionsCell<C>
                                row={child}
                                isActive={childIsActive}
                                onEdit={onEditChild}
                                onSoftDelete={onSoftDeleteChild}
                                onHardDelete={onHardDeleteChild}
                                onRestore={onRestoreChild}
                                canDelete={canDeleteChild}
                                onAfterChange={onAfterChange}
                              />
                            </TableCell>
                          </TableRow>
                        ))
                      : null}
                    {!isCollapsed && children.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={totalCols}
                          className="pl-10 text-xs text-muted-foreground"
                        >
                          Sin {nounPlural} en este grupo.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </React.Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
