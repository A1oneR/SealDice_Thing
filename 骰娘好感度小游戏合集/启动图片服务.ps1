$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$rendererDir = Join-Path $projectRoot 'renderer'
$workspaceRoot = Split-Path -Parent $projectRoot
$bundledModules = Get-ChildItem -LiteralPath $workspaceRoot -Directory | ForEach-Object {
    Join-Path $_.FullName 'application\node_modules'
} | Where-Object { Test-Path $_ } | Select-Object -First 1

$hasNapiCanvas = Test-Path (Join-Path $rendererDir 'node_modules\@napi-rs\canvas')
$hasLegacyCanvas = Test-Path (Join-Path $rendererDir 'node_modules\canvas')

if (-not $hasNapiCanvas -and -not $hasLegacyCanvas -and $bundledModules -and (Test-Path (Join-Path $bundledModules 'canvas'))) {
    $env:NODE_PATH = $bundledModules
} elseif (-not $hasNapiCanvas -and -not $hasLegacyCanvas) {
    throw 'Renderer dependency is missing. Run npm install in the renderer directory.'
}

Set-Location $rendererDir
node server.js
