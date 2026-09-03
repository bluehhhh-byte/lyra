$ErrorActionPreference = "Stop"

$repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$site = "https://lyracyno.vercel.app"
$workspaceBefore = (& git -C $repo status --porcelain=v1 --untracked-files=all) -join "`n"

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

Write-Host "Lyra production deployment verification"
Write-Host "1/4 Checking the file backup against the database..."
$backupCheckBefore = (& git -C $repo status --porcelain=v1 --untracked-files=all) -join "`n"
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
$backupCheckAfter = (& git -C $repo status --porcelain=v1 --untracked-files=all) -join "`n"
if ($backupCheckAfter -ne $backupCheckBefore) {
  throw "dump-content --check changed the working tree; refusing to deploy an impure check"
}

Write-Host "2/4 Fetching the latest GitHub main branch..."
Run "git" @("fetch", "origin", "main")
$targetSha = (& git -C $repo rev-parse "origin/main").Trim()
if ($LASTEXITCODE -ne 0 -or $targetSha -notmatch '^[0-9a-f]{40}$') {
  throw "Could not resolve origin/main commit SHA"
}

Write-Host "3/4 Waiting for the Vercel Git integration..."
# A push already starts one production build. Uploading the same tree with
# `vercel deploy --prod` created a second deployment for every release.
Run "node" @("scripts/wait-for-production.mjs", $site, $targetSha)

Write-Host "4/4 Verifying production..."
Run "node" @("scripts/verify-production.mjs", $site)
Write-Host "READY: $site @ $($targetSha.Substring(0, 7))"

$workspaceAfter = (& git -C $repo status --porcelain=v1 --untracked-files=all) -join "`n"
if ($workspaceAfter -ne $workspaceBefore) {
  Write-Warning "The local working tree changed while deployment was running. Only pushed origin/main was deployed."
}
