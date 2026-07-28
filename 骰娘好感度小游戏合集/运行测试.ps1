$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot
$workspaceRoot = Split-Path -Parent $projectRoot
$bundledModules = Get-ChildItem -LiteralPath $workspaceRoot -Directory | ForEach-Object {
    Join-Path $_.FullName 'application\node_modules'
} | Where-Object { Test-Path $_ } | Select-Object -First 1
$mainPlugin = Get-ChildItem -LiteralPath $projectRoot -File -Filter '*.js' | Select-Object -First 1

if (-not $mainPlugin) {
    throw 'Main plugin JavaScript file was not found.'
}

function Invoke-Node {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$NodeArgs)
    & node @NodeArgs
    if ($LASTEXITCODE -ne 0) {
        throw "Node command failed with exit code $LASTEXITCODE."
    }
}

Invoke-Node '--check' $mainPlugin.FullName
Invoke-Node '--check' 'renderer/server.js'
Invoke-Node '--test' 'tests/plugin.test.js'

$hasNapiCanvas = Test-Path 'renderer/node_modules/@napi-rs/canvas'
$hasLegacyCanvas = Test-Path 'renderer/node_modules/canvas'

if ($hasNapiCanvas -or $hasLegacyCanvas) {
    Invoke-Node '--test' 'tests/renderer.test.js'
} elseif ($bundledModules -and (Test-Path (Join-Path $bundledModules 'canvas'))) {
    $env:NODE_PATH = $bundledModules
    Invoke-Node '--test' 'tests/renderer.test.js'
} else {
    Write-Warning 'Canvas dependency not found; renderer tests were skipped.'
}
