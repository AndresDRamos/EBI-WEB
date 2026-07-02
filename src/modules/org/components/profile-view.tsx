"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChangePasswordForm } from "./change-password-form";

export interface ProfileViewUser {
  username: string;
  email: string | null;
  display_name: string | null;
  all_plants: boolean;
  is_active: boolean;
  roles: string[];
  plants: { code: string; name: string }[];
  departments: { name: string }[];
}

export function ProfileView({ user }: { user: ProfileViewUser }) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Datos de la cuenta</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre para mostrar">
            {user.display_name || "—"}
          </Field>
          <Field label="Usuario">
            <span className="font-mono">{user.username}</span>
          </Field>
          <Field label="Correo">{user.email || "—"}</Field>
          <Field label="Estado">
            {user.is_active ? (
              <Badge variant="success" style={{ backgroundColor: "var(--color-success)" }}>
                Activo
              </Badge>
            ) : (
              <Badge variant="muted">Inactivo</Badge>
            )}
          </Field>
          <div className="space-y-1 sm:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Roles
            </p>
            {user.roles.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin roles asignados.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {user.roles.map((r) => (
                  <Badge key={r} variant="muted">
                    {r}
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-1 sm:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Plantas
            </p>
            {user.all_plants ? (
              <p className="text-sm">
                <Badge variant="success" style={{ backgroundColor: "var(--color-success)" }}>
                  Todas las plantas
                </Badge>
              </p>
            ) : user.plants.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin plantas asignadas.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {user.plants.map((p) => (
                  <Badge key={p.code} variant="muted">
                    {p.name} <span className="ml-1 font-mono text-[10px] opacity-70">{p.code}</span>
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-1 sm:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Departamentos
            </p>
            {user.departments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin departamentos asignados.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {user.departments.map((d) => (
                  <Badge key={d.name} variant="muted">
                    {d.name}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cambiar contraseña</CardTitle>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-sm">{children}</p>
    </div>
  );
}