"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Plus, RefreshCw, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface AdminUserRow {
  user_id: number;
  username: string;
  display_name: string | null;
  email: string | null;
  all_plants: boolean;
  is_active: boolean;
  roles: string[];
  updated_at: string;
}

export interface AdminInvitationRow {
  invitation_id: number;
  username: string;
  expires_at: string;
}

export function AdminUsersTable({
  users,
  invitations,
}: {
  users: AdminUserRow[];
  invitations: AdminInvitationRow[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = React.useState<number | null>(null);

  async function invite(userId: number) {
    setBusyId(userId);
    try {
      const res = await fetch(`/api/users/${userId}/invite`, { method: "POST" });
      if (!res.ok) throw new Error("invite failed");
      router.refresh();
    } catch {
      // ignore
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-lg border bg-white">
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="font-semibold">Usuarios</h2>
          <Link
            href="/admin/users/new"
            className="inline-flex h-8 items-center gap-2 rounded-sm bg-ezi-orange px-3 text-xs font-medium text-white hover:bg-orange-600"
          >
            <Plus className="h-4 w-4" />
            Nuevo usuario
          </Link>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuario</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Plantas</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground">
                  No hay usuarios.
                </TableCell>
              </TableRow>
            ) : (
              users.map((row) => (
                <TableRow key={row.user_id}>
                  <TableCell className="font-medium">{row.username}</TableCell>
                  <TableCell>{row.display_name ?? "—"}</TableCell>
                  <TableCell>
                    {row.roles.length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      row.roles.map((r) => (
                        <Badge key={r} variant="muted" className="mr-1">
                          {r}
                        </Badge>
                      ))
                    )}
                  </TableCell>
                  <TableCell>
                    {row.all_plants ? (
                      <Badge variant="success">Todas</Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        por asignar
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {row.is_active ? (
                      <Badge variant="success">Activo</Badge>
                    ) : (
                      <Badge variant="muted">Inactivo</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/admin/users/${row.user_id}`}
                        className="inline-flex h-8 items-center gap-2 rounded-sm border px-3 text-xs font-medium hover:bg-gray-100"
                      >
                        <Pencil className="h-4 w-4" />
                        Editar
                      </Link>
                      {!row.is_active ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === row.user_id}
                          onClick={() => invite(row.user_id)}
                          title="Re-generar invitación"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {invitations.length > 0 ? (
        <div className="overflow-hidden rounded-lg border bg-white">
          <div className="border-b p-4">
            <h2 className="font-semibold">Invitaciones pendientes</h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuario</TableHead>
                <TableHead>Expira</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invitations.map((inv) => (
                <TableRow key={inv.invitation_id}>
                  <TableCell className="font-medium">{inv.username}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(inv.expires_at).toLocaleString("es-MX")}
                  </TableCell>
                  <TableCell>
                    <Badge variant="muted">Pendiente</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        <UserPlus className="h-3 w-3" />
        El aprovisionamiento es solo por invitación: el usuario se crea sin
        contraseña y se activa al aceptar el enlace de un solo uso.
      </p>
    </div>
  );
}