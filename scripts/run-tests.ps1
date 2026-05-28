$ErrorActionPreference = "Stop"

$healthUrl = "http://127.0.0.1:5000/"
$startedProcess = $null
$reuseExistingServer = $false

function Test-Health {
  try {
    $response = Invoke-WebRequest -UseBasicParsing $healthUrl -TimeoutSec 5
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

if (Test-Health) {
  $reuseExistingServer = $true
} else {
  $startedProcess = Start-Process -FilePath "node" -ArgumentList "src/server.js" -WorkingDirectory (Resolve-Path "$PSScriptRoot\..") -WindowStyle Hidden -PassThru

  $ready = $false
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 500
    if (Test-Health) {
      $ready = $true
      break
    }
  }

  if (-not $ready) {
    throw "Backend server did not become healthy on $healthUrl"
  }
}

try {
  node --test tests/rbac.integration.test.js
  exit $LASTEXITCODE
} finally {
  if (-not $reuseExistingServer -and $startedProcess) {
    Stop-Process -Id $startedProcess.Id -Force -ErrorAction SilentlyContinue
  }
}
