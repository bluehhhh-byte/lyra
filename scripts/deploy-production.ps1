$ErrorActionPreference = "Stop"

$repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$tempRoot = [System.IO.Path]::GetTempPath()
$deployDir = Join-Path $tempRoot ("lyra-deploy-" + [guid]::NewGuid().ToString("N"))
$teamId = "team_vk8fZtA1YueBPh3dnFXZNj0H"
$projectId = "prj_NMnJerZFyg3lxOiHc3uOPHnT6xug"
$site = "https://lyra-one-zeta.vercel.app"

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
Write-Host "1/4 Fetching the latest GitHub main branch..."
Run "git" @("fetch", "origin", "main")

try {
  Write-Host "2/4 Creating an isolated deployment copy..."
  Run "git" @("worktree", "add", "--detach", $deployDir, "origin/main")

  Write-Host "3/4 Uploading origin/main to Vercel..."
  $env:VERCEL_ORG_ID = $teamId
  $env:VERCEL_PROJECT_ID = $projectId
  Run "pnpm" @("dlx", "vercel@59.1.3", "deploy", "--prod", "--yes", "--cwd", $deployDir)

  Write-Host "4/4 Verifying production..."
  $version = Invoke-RestMethod -Uri "$site/api/version" -Headers @{ "Cache-Control" = "no-cache" }
  if (-not $version.deploymentId) {
    throw "Production did not return a deployment ID"
  }
  Write-Host "READY: $site"
  Write-Host "Deployment: $($version.deploymentId)"
} finally {
  & git -C $repo worktree remove $deployDir --force 2>$null
  & git -C $repo worktree prune 2>$null
  if (Test-Path -LiteralPath $deployDir) {
    $resolved = (Resolve-Path -LiteralPath $deployDir).Path
    if (-not $resolved.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "Refusing to remove an unexpected path: $resolved"
    }
    Remove-Item -LiteralPath $resolved -Recurse -Force
  }
}
