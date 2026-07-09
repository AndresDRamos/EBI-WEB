<#
.SYNOPSIS
  Muestra de un vistazo en qué worktree/branch/plan está cada sesión paralela.

.DESCRIPTION
  Lee `git worktree list --porcelain`, cruza cada branch con el slug del plan
  (`<type>/<slug>` -> docs/plans/<slug>.md) y reporta estado ahead/behind vs
  origin/main, si tiene cambios sin commitear, y si ya está mergeada.

.USAGE
  pwsh scripts/worktree-status.ps1
#>

$ErrorActionPreference = 'Stop'

$repoRoot = git rev-parse --show-toplevel
if (-not $repoRoot) { throw "No estás dentro de un repo git." }

git fetch origin main --quiet 2>$null

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
        if (-not $current) { $current = [ordered]@{ Path = $null; Head = $null; Branch = $null; Detached = $false; Prunable = $false } }
        if ($line -like 'worktree *') { $current.Path = $line.Substring(9) }
        elseif ($line -like 'HEAD *') { $current.Head = $line.Substring(5) }
        elseif ($line -like 'branch *') { $current.Branch = $line.Substring(7) -replace '^refs/heads/', '' }
        elseif ($line -eq 'detached') { $current.Detached = $true }
        elseif ($line -like 'prunable*') { $current.Prunable = $true }
    }
    if ($current) { $entries += $current }
    return $entries
}

function Get-PlanSlug($branch) {
    if (-not $branch) { return $null }
    $parts = $branch -split '/', 2
    if ($parts.Count -lt 2) { return $null }
    return $parts[1]
}

$worktrees = Parse-Worktrees
$rows = @()

foreach ($wt in $worktrees) {
    $isMain = ($wt.Path -eq $repoRoot)
    $branch = $wt.Branch
    $exists = Test-Path $wt.Path

    $merged = $null
    $ahead = $null
    $behind = $null
    $dirty = $null
    $planStatus = $null

    if ($branch -and -not $isMain) {
        git merge-base --is-ancestor $branch origin/main 2>$null
        $merged = ($LASTEXITCODE -eq 0)

        if ($exists) {
            $counts = git rev-list --left-right --count "origin/main...$branch" 2>$null
            if ($counts) {
                $parts = $counts -split '\s+'
                $behind = $parts[0]
                $ahead = $parts[1]
            }
            $dirty = [bool](git -C $wt.Path status --porcelain 2>$null)
        }

        $slug = Get-PlanSlug $branch
        if ($slug) {
            $planFile = Join-Path $repoRoot "docs/plans/$slug.md"
            if (Test-Path $planFile) {
                $statusLine = Select-String -Path $planFile -Pattern '^status:\s*(.+)$' | Select-Object -First 1
                if ($statusLine) { $planStatus = $statusLine.Matches[0].Groups[1].Value.Trim() }
            }
        }
    }

    $rows += [pscustomobject]@{
        Path      = $wt.Path.Replace($repoRoot, '.')
        Branch    = if ($isMain) { '[main]' } elseif ($wt.Detached) { '(detached)' } else { $branch }
        Plan      = if ($planStatus) { $planStatus } else { '-' }
        'A/B'     = if ($ahead -ne $null) { "+$ahead/-$behind" } else { '-' }
        Dirty     = if ($dirty -eq $true) { 'sí' } elseif ($dirty -eq $false) { 'no' } else { '-' }
        Merged    = if ($merged -eq $true) { 'sí' } elseif ($merged -eq $false) { 'no' } else { '-' }
        Ghost     = if ($wt.Prunable -or -not $exists) { 'sí (prunable)' } else { 'no' }
    }
}

$rows | Format-Table -AutoSize

$ghostCount = ($rows | Where-Object { $_.Ghost -like 'sí*' }).Count
$mergedCount = ($rows | Where-Object { $_.Merged -eq 'sí' }).Count
if ($ghostCount -gt 0 -or $mergedCount -gt 0) {
    Write-Host ""
    Write-Host "Hay $mergedCount worktree(s) mergeada(s) y $ghostCount fantasma(s)/prunable. Corre 'pwsh scripts/worktree-clean.ps1' para limpiar." -ForegroundColor Yellow
}
