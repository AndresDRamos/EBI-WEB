"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Copy, Check } from "lucide-react";
import { EntityFormDialog } from "@/components/admin/entity-form-dialog";

export interface CatalogItem {
  id: number;
  label: string;
}

export interface UserFormInitial {
  user_id: number;
  username: string;
  email: string | null;
  display_name: string | null;
  all_plants: boolean;
  is_active: boolean;
  role_ids: number[];
  plant_ids: number[];
  department_ids: number[];
}

export interface UserFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: CatalogItem[];
  plants: CatalogItem[];
  departments: CatalogItem[];
  /**
   * Initial values when editing. When undefined, the dialog is a "create"
   * form (provisioned inactive, optional one-time invitation link).
   */
  initial?: UserFormInitial;
}

/** Multi-select for role/plant/department assignments (client component). */
function MultiSelect({
  label,
  items,
  selected,
  onChange,
  disabled,
}: {
  label: string;
  items: CatalogItem[];
  selected: number[];
  onChange: (ids: number[]) => void;
  disabled?: boolean;
}) {
  function toggle(id: number) {
    if (selected.includes(id)) onChange(selected.filter((x) => x !== id));
    else onChange([...selected, id]);
  }
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="max-h-44 overflow-auto rounded-sm border bg-white p-2">
        {items.length === 0 ? (
          <p className="px-1 py-1 text-sm text-muted-foreground">
            No hay elementos. Solicítelos al administrador del catálogo.
          </p>
        ) : (
          <ul className="space-y-1">
            {items.map((item) => (
              <li key={item.id}>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={selected.includes(item.id)}
                    onCheckedChange={() => toggle(item.id)}
                    disabled={disabled}
                  />
                  {item.label}
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * Usuarios create/edit modal body, lifted from the original `/admin/users/new`
 * and `/admin/users/[id]` page forms. The MultiSelect, payload assembly and
 * one-time invite-link panel are reused; the success path now closes the modal
 * and `router.refresh()`es, instead of `router.push`/`router.refresh` (the
 * modal replaces the dedicated create/edit pages).
 */
export function UserFormDialog({
  open,
  onOpenChange,
  roles,
  plants,
  departments,
  initial,
}: UserFormDialogProps) {
  const router = useRouter();
  const isEdit = Boolean(initial);

  const [username, setUsername] = React.useState(initial?.username ?? "");
  const [email, setEmail] = React.useState(initial?.email ?? "");
  const [displayName, setDisplayName] = React.useState(
    initial?.display_name ?? "",
  );
  const [allPlants, setAllPlants] = React.useState(initial?.all_plants ?? false);
  const [isActive, setIsActive] = React.useState(initial?.is_active ?? false);
  const [roleIds, setRoleIds] = React.useState<number[]>(initial?.role_ids ?? []);
  const [plantIds, setPlantIds] = React.useState<number[]>(initial?.plant_ids ?? []);
  const [departmentIds, setDepartmentIds] = React.useState<number[]>(
    initial?.department_ids ?? [],
  );
  const [invite, setInvite] = React.useState(true);
  const [invalidate, setInvalidate] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [inviteLink, setInviteLink] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  async function onSubmit() {
    setBusy(true);
    setError(null);
    setInviteLink(null);

    const usernameTrim = username.trim().toLowerCase();
    if (!isEdit && !usernameTrim) {
      setError("El usuario es obligatorio.");
      setBusy(false);
      return;
    }
    if (!isEdit && !/^[a-z0-9._-]{3,64}$/.test(usernameTrim)) {
      setError("Usuario inválido (3-64 chars: a-z 0-9 . _ -).");
      setBusy(false);
      return;
    }

    const payload = {
      username: usernameTrim,
      email: email.trim() || null,
      display_name: displayName.trim() || null,
      all_plants: allPlants,
      role_ids: roleIds,
      plant_ids: allPlants ? [] : plantIds,
      department_ids: departmentIds,
      ...(isEdit
        ? {
            is_active: isActive,
            invalidate_sessions: invalidate,
          }
        : { invite }),
    };

    try {
      if (isEdit) {
        const res = await fetch(`/api/users/${initial!.user_id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? "No se pudo actualizar.");
        }
        router.refresh();
        onOpenChange(false);
      } else {
        const res = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? "No se pudo crear.");
        }
        const data = (await res.json().catch(() => ({}))) as {
          invite_token?: string | null;
        };
        router.refresh();
        if (data.invite_token) {
          // Keep modal open so the admin can copy the one-time link; they close
          // manually once delivered (no email service in v1).
          const origin = window.location.origin;
          setInviteLink(`${origin}/invite/${data.invite_token}`);
        } else {
          onOpenChange(false);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <EntityFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Editar usuario" : "Nuevo usuario"}
      description={
        isEdit
          ? "Ajuste roles, plantas, departamentos y estado de la cuenta."
          : "Cree un usuario sin contraseña y opcionalmente genere una invitación de un solo uso."
      }
      submitLabel={isEdit ? "Guardar cambios" : "Crear usuario"}
      busy={busy}
      error={error}
      onSubmit={onSubmit}
      onCancel={() => onOpenChange(false)}
      sizeClassName="sm:max-w-3xl"
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="username">Usuario *</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              disabled={isEdit || busy}
              maxLength={64}
              autoCapitalize="none"
            />
            {isEdit ? (
              <p className="text-xs text-muted-foreground">
                El usuario no se puede cambiar una vez creado.
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="display_name">Nombre para mostrar</Label>
            <Input
              id="display_name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={busy}
              maxLength={160}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Correo (opcional)</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
            maxLength={256}
          />
        </div>

        <div className="grid gap-6 sm:grid-cols-3">
          <MultiSelect
            label="Roles"
            items={roles}
            selected={roleIds}
            onChange={setRoleIds}
            disabled={busy}
          />
          <div className="space-y-2">
            <MultiSelect
              label="Plantas"
              items={plants}
              selected={plantIds}
              onChange={setPlantIds}
              disabled={busy || allPlants}
            />
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={allPlants}
                onCheckedChange={setAllPlants}
                disabled={busy}
              />
              Todas las plantas (ignora la selección)
            </label>
          </div>
          <MultiSelect
            label="Departamentos"
            items={departments}
            selected={departmentIds}
            onChange={setDepartmentIds}
            disabled={busy}
          />
        </div>

        <div className="flex flex-wrap gap-6">
          {!isEdit ? (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={invite}
                onCheckedChange={setInvite}
                disabled={busy}
              />
              Generar invitación (enlace de un solo uso)
            </label>
          ) : (
            <>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={isActive}
                  onCheckedChange={setIsActive}
                  disabled={busy}
                />
                Cuenta activa
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={invalidate}
                  onCheckedChange={setInvalidate}
                  disabled={busy}
                />
                Invalidar sesiones activas (token_version)
              </label>
            </>
          )}
        </div>

        {inviteLink ? (
          <div className="rounded-lg border border-dashed bg-orange-50 p-4">
            <p className="text-sm font-semibold text-ezi-gray">
              Enlace de invitación (muéstrelo una sola vez al usuario):
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 truncate rounded-sm border bg-white px-2 py-1 text-xs">
                {inviteLink}
              </code>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={async () => {
                  await navigator.clipboard.writeText(inviteLink);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copiado" : "Copiar"}
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Mientras no haya servicio de correo, entréguelo manualmente. El
              enlace expira en 7 días y es de un solo uso. Cierre este diálogo
              una vez entregado.
            </p>
          </div>
        ) : null}
      </div>
    </EntityFormDialog>
  );
}