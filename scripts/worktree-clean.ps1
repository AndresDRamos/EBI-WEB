<#
.SYNOPSIS
  Borra worktrees y branches de EBI-Web que ya están mergeados a origin/main,
  y limpia entradas fantasma (prunable) dejadas por borrados manuales.

.DESCRIPTION
  Seguro por diseño: solo toca una branch si `git merge-base --is-ancestor
  <branch> origin/main` confirma que ya está mergeada, y usa `git branch -d`
  (no -D), que Git rechaza si detecta commits no mergeados. Nunca toca
  worktrees con cambios sin commitear. No corre en modo silencioso: siempre
  reporta qué borró y qué se saltó (y por qué).

.USAGE
  pwsh scripts/worktree-clean.ps1          # limpia todo lo mergeado
  pwsh scripts/worktree-clean.ps1 -WhatIf  # solo reporta, no borra nada
#>

param(
    [switch]$WhatIf
)

$ErrorActionPreference = 'Stop'
$repoRoot = git rev-parse --show-toplevel
if (-not $repoRoot) { throw "No estás dentro de un repo git." }

Write-Host "== git fetch origin main --prune ==" -ForegroundColor Cyan
git fetch origin main --prune --quiet

Write-Host "== git worktree prune (limpia entradas fantasma) ==" -ForegroundColor Cyan
git worktree prune -v

function Parse-Worktrees {
    $raw = git worktree list --porcelain
    $entries = @()
    $current = $null
    foreach ($line in $raw) {
        if ($line -eq '') {
            if ($current) { $entries += $current }
            $current = $null
            continue
        }
        if (-not $current) { $current = [ordered]@{ Path = $null; Branch = $null; Detached = $false } }
        if ($line -like 'worktree *') { $current.Path = $line.Substring(9) }
        elseif ($line -like 'branch *') { $current.Branch = $line.Substring(7) -replace '^refs/heads/', '' }
        elseif ($line -eq 'detached') { $current.Detached = $true }
    }
    if ($current) { $entries += $current }
    return $entries
}

$removedWorktrees = 0
$removedBranches = 0
$skipped = @()

Write-Host "`n== Revisando worktrees ==" -ForegroundColor Cyan
$worktrees = Parse-Worktrees
foreach ($wt in $worktrees) {
    if ($wt.Path -eq $repoRoot) { continue }          # nunca tocar el checkout principal
    if ($wt.Detached -or -not $wt.Branch) {
        $skipped += "$($wt.Path): detached HEAD, revisar a mano"
        continue
    }

    $branch = $wt.Branch
    git merge-base --is-ancestor $branch origin/main 2>$null
    $merged = ($LASTEXITCODE -eq 0)
    if (-not $merged) {
        $skipped += "${branch}: no está mergeada a origin/main todavía"
        continue
    }

    $exists = Test-Path $wt.Path
    if ($exists) {
        $dirty = git -C $wt.Path status --porcelain 2>$null
        if ($dirty) {
            $skipped += "${branch}: tiene cambios sin commitear, no se toca"
            continue
        }
    }

    if ($WhatIf) {
        Write-Host "  [WhatIf] borraría worktree $($wt.Path) (branch $branch, mergeada)"
        continue
    }

    Write-Host "  Borrando worktree mergeada: $($wt.Path) ($branch)"
    git worktree remove $wt.Path --force
    $removedWorktrees++
}

Write-Host "`n== Revisando branches locales sin worktree ==" -ForegroundColor Cyan
$currentWorktreeBranches = @(Parse-Worktrees | Where-Object { $_.Branch } | ForEach-Object { $_.Branch })
$localBranches = git branch --format='%(refname:short)' | Where-Object { $_ -ne 'main' }

foreach ($branch in $localBranches) {
    if ($currentWorktreeBranches -contains $branch) { continue }  # todavía tiene worktree activo

    git merge-base --is-ancestor $branch origin/main 2>$null
    $merged = ($LASTEXITCODE -eq 0)
    if (-not $merged) {
        $skipped += "${branch}: branch huérfana sin worktree, pero no está mergeada — revisar a mano"
        continue
    }

    if ($WhatIf) {
        Write-Host "  [WhatIf] borraría branch $branch (mergeada, sin worktree)"
        continue
    }

    Write-Host "  Borrando branch mergeada sin worktree: $branch"
    git branch -d $branch   # -d (no -D): se niega si no está mergeada, doble seguro
    $removedBranches++
}

Write-Host ""
if ($WhatIf) {
    Write-Host "Modo -WhatIf: no se borró nada." -ForegroundColor Yellow
} else {
    Write-Host "Listo: $removedWorktrees worktree(s) y $removedBranches branch(es) borradas." -ForegroundColor Green
}
if ($skipped.Count -gt 0) {
    Write-Host "`nSe saltaron (revisar a mano si no es lo esperado):" -ForegroundColor Yellow
    $skipped | ForEach-Object { Write-Host "  - $_" }
}
