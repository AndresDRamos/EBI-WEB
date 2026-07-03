<!-- Título del PR en Conventional Commits (es el mensaje del squash-merge):
     tipo(ámbito): descripción — p. ej. feat(maintenance): calendario de órdenes de trabajo -->

## Plan

<!-- Enlace al plan que implementa este PR: docs/plans/<slug>.md
     Si no nace de un plan (chore/fix pequeño), di por qué. -->

## Qué cambia

<!-- 2-5 viñetas. Qué puede hacer ahora el portal / qué queda distinto. -->

## Verificación

- [ ] `pnpm lint && pnpm build` en verde local (CI lo re-verifica)
- [ ] Si toca esquema: `flyway info` limpio en `EBI_dev`, `docs-sync` ejecutado y sin colisión de versión `V{n}` contra `main`
- [ ] Docs afectados actualizados (`docs/STATE.md`, doc del módulo, `docs-routing`)
- [ ] Si cierra un plan: estado del plan actualizado y `prompts/<slug>.md` retirado de la rama

## Fuera de alcance

<!-- Qué se detectó pero NO entra aquí (candidato a plan/issue nuevo). -->
