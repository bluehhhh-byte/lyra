$ErrorActionPreference = "Stop"

$repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$tempRoot = [System.IO.Path]::GetTempPath()
$deployDir = Join-Path $tempRoot ("lyra-deploy-" + [guid]::NewGuid().ToString("N"))
$teamId = "team_vk8fZtA1YueBPh3dnFXZNj0H"
$projectId = "prj_NMnJerZFyg3lxOiHc3uOPHnT6xug"
$site = "https://lyracyno.vercel.app"
$beforeDeployment = $null
try {
  $beforeDeployment = (Invoke-RestMethod -Uri "$site/api/version" -Headers @{ "Cache-Control" = "no-cache" }).deploymentId
} catch {
  Write-Warning "Could not read the current production deployment ID; post-deploy verification will still run."
}

function Run([string]$command, [string[]]$arguments, [string]$cwd = $repo) {
  Push-Location $cwd
  try {
    & $command @arguments
    if ($LASTEXITCODE -ne 0) {
      throw "$command failed with exit code $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }
}

Write-Host "Lyra production deployment"
Write-Host "1/5 Checking the file backup against the database..."
Push-Location $repo
try {
  # songs/*.md is a backup, but lib/cache-size.test.mjs measures those files as a
  # stand-in for database rows when it checks the 2MiB Data Cache ceiling. A stale
  # backup means that gate is sizing yesterday's catalog. The site itself reads the
  # database, so this never blocks a deploy - it only says the estimate went stale.
  & node scripts/dump-content.mjs --check
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "songs/*.md is behind the database. Refresh it with: node scripts/dump-content.mjs"
  }
} finally { Pop-Location }

Write-Host "2/5 Fetching the latest GitHub main branch..."
Run "git" @("fetch", "origin", "main")

try {
  Write-Host "3/5 Creating an isolated deployment copy..."
  Run "git" @("worktree", "add", "--detach", $deployDir, "origin/main")

  Write-Host "4/5 Uploading origin/main to Vercel..."
  $env:VERCEL_ORG_ID = $teamId
  $env:VERCEL_PROJECT_ID = $projectId
  # Restored build cache has previously produced a READY deployment with a missing
  # server chunk. Production deploys favor a complete artifact over a short build.
  Run "pnpm" @("dlx", "vercel@59.1.3", "deploy", "--prod", "--force", "--yes", "--cwd", $deployDir)

  Write-Host "5/5 Verifying production..."
  Run "node" @("scripts/verify-production.mjs", $site, [string]$beforeDeployment)
  Write-Host "READY: $site"
} finally {
  # Windows may keep a freshly built file open for a moment. Cleanup must not
  # turn an already verified production deployment into a failed command.
  try { & git -C $repo worktree remove $deployDir --force 2>$null } catch {}
  try { & git -C $repo worktree prune 2>$null } catch {}
  if (Test-Path -LiteralPath $deployDir) {
    $resolved = (Resolve-Path -LiteralPath $deployDir).Path
    if (-not $resolved.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "Refusing to remove an unexpected path: $resolved"
    }
    $removed = $false
    for ($attempt = 0; $attempt -lt 5 -and -not $removed; $attempt++) {
      try {
        Remove-Item -LiteralPath $resolved -Recurse -Force
        $removed = -not (Test-Path -LiteralPath $resolved)
      } catch {
        Start-Sleep -Milliseconds 500
      }
    }
    if (-not $removed) {
      Write-Warning "Deployment succeeded, but the temporary folder could not be removed: $resolved"
    }
  }
}
