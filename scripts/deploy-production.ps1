$ErrorActionPreference = "Stop"

$repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$tempRoot = [System.IO.Path]::GetTempPath()
$deployDir = Join-Path $tempRoot ("lyra-deploy-" + [guid]::NewGuid().ToString("N"))
$teamId = "team_vk8fZtA1YueBPh3dnFXZNj0H"
$projectId = "prj_NMnJerZFyg3lxOiHc3uOPHnT6xug"
$site = "https://lyracyno.vercel.app"
$workspaceBefore = (& git -C $repo status --porcelain=v1 --untracked-files=all) -join "`n"
$mutex = New-Object System.Threading.Mutex($false, "Global\LyraProductionDeploy")
$locked = $false

function Run([string]$command, [string[]]$arguments, [string]$cwd = $repo) {
  Push-Location $cwd
  try {
    & $command @arguments
    if ($LASTEXITCODE -ne 0) { throw "$command failed with exit code $LASTEXITCODE" }
  } finally { Pop-Location }
}

try {
  $locked = $mutex.WaitOne(0)
  if (-not $locked) { throw "Another Lyra production deployment is already running; refusing to create a duplicate." }

  Write-Host "Lyra production deployment"
  Write-Host "1/5 Checking the file backup against the database..."
  $backupCheckBefore = (& git -C $repo status --porcelain=v1 --untracked-files=all) -join "`n"
  Push-Location $repo
  try {
    & node scripts/dump-content.mjs --check
    if ($LASTEXITCODE -ne 0) { Write-Warning "songs/*.md is behind the database. Refresh it with: node scripts/dump-content.mjs" }
  } finally { Pop-Location }
  $backupCheckAfter = (& git -C $repo status --porcelain=v1 --untracked-files=all) -join "`n"
  if ($backupCheckAfter -ne $backupCheckBefore) { throw "dump-content --check changed the working tree; refusing to deploy an impure check" }

  Write-Host "2/5 Fetching the latest GitHub main branch..."
  Run "git" @("fetch", "origin", "main")
  $targetSha = (& git -C $repo rev-parse "origin/main").Trim()
  if ($LASTEXITCODE -ne 0 -or $targetSha -notmatch '^[0-9a-f]{40}$') { throw "Could not resolve origin/main commit SHA" }

  $liveSha = ""
  try { $liveSha = (Invoke-RestMethod -Uri "$site/api/version?t=$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())" -Headers @{ "Cache-Control" = "no-cache" }).sha } catch {}
  if ($liveSha -eq $targetSha) {
    Write-Host "3/5 Already deployed; skipping duplicate upload."
  } else {
    Write-Host "3/5 Creating an isolated deployment copy..."
    Run "git" @("worktree", "add", "--detach", $deployDir, "origin/main")
    Write-Host "4/5 Uploading origin/main to Vercel exactly once..."
    $env:VERCEL_ORG_ID = $teamId
    $env:VERCEL_PROJECT_ID = $projectId
    Run "pnpm" @("dlx", "vercel@59.1.3", "deploy", "--prod", "--force", "--yes", "--env", "LYRA_COMMIT_SHA=$targetSha", "--build-env", "LYRA_COMMIT_SHA=$targetSha", "--cwd", $deployDir)
  }

  Write-Host "5/5 Waiting for the exact commit and verifying production..."
  Run "node" @("scripts/wait-for-production.mjs", $site, $targetSha)
  Run "node" @("scripts/verify-production.mjs", $site)
  Write-Host "READY: $site @ $($targetSha.Substring(0, 7))"
} finally {
  if (Test-Path -LiteralPath $deployDir) {
    try { & git -C $repo worktree remove $deployDir --force 2>$null } catch {}
    try { & git -C $repo worktree prune 2>$null } catch {}
  }
  if ($locked) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
  $workspaceAfter = (& git -C $repo status --porcelain=v1 --untracked-files=all) -join "`n"
  if ($workspaceAfter -ne $workspaceBefore) { Write-Warning "The local working tree changed while deployment was running. Only isolated origin/main was uploaded." }
}
