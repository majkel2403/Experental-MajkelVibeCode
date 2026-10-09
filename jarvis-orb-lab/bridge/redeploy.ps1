<#
.SYNOPSIS
  Wdrożenie zmian Jarvis OS bez restartu komputera: most MCP (:8651) i Hermes jarvis-desktop (:8643).

.DESCRIPTION
  1. Zatrzymuje most i uruchamia go ponownie zadaniem JarvisOS-Bridge (nowy kod Pythona, świeża migawka bridge\tools.json).
  2. Restartuje gateway Hermesa WYŁĄCZNIE przez zadanie JarvisOS-GatewayRestart (jedyna bezpieczna droga — patrz skill
     jarvis-operations; Hermes nie może zrestartować sam siebie z własnego terminala).
  3. Czeka, aż oba porty wstaną z nowymi procesami, i pokazuje stan mostu (karty, liczba narzędzi, bezpiecznik).
  Karta Jarvis OS w przeglądarce przeładuje się sama, gdy most zgłosi nowsze narzędzia (bridge.js: stale → reload).
  -NoGateway  tylko most (np. zmiana wyłącznie w bridge\*.py bez nowych narzędzi).
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File bridge\redeploy.ps1
#>
param([switch]$NoGateway, [int]$TimeoutSec = 120)
$ErrorActionPreference = 'Stop'
function Pid-On($port) { (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess }
function Wait-New($port, $old, $label) {
  $t0 = Get-Date
  while (((Get-Date) - $t0).TotalSeconds -lt $TimeoutSec) {
    $p = Pid-On $port
    if ($p -and $p -ne $old) { Write-Host "  ${label}: nowy proces $p" -ForegroundColor Green; return $true }
    Start-Sleep -Milliseconds 500
  }
  Write-Host "  ${label}: nie wstał w $TimeoutSec s (sprawdź %USERPROFILE%\.jarvis-os\logs)" -ForegroundColor Red; return $false
}

Write-Host 'Most MCP (:8651)…'
$old = Pid-On 8651
if ($old) { Stop-Process -Id $old -Force -Confirm:$false; Start-Sleep 2 }
Start-ScheduledTask -TaskName 'JarvisOS-Bridge'
$bridgeOk = Wait-New 8651 $old 'most'

$gwOk = $true
if (-not $NoGateway) {
  Write-Host 'Hermes jarvis-desktop (:8643)…'
  $oldGw = Pid-On 8643
  schtasks /Run /TN 'JarvisOS-GatewayRestart' | Out-Null
  $gwOk = Wait-New 8643 $oldGw 'gateway'
}

$tokFile = Join-Path $env:USERPROFILE '.jarvis-os\bridge-token'
if ($bridgeOk -and (Test-Path $tokFile)) {
  $tok = (Get-Content $tokFile -Raw).Trim()
  for ($i = 0; $i -lt 30; $i++) {
    try { $s = Invoke-RestMethod 'http://127.0.0.1:8651/bridge/status' -Headers @{ 'X-Bridge-Token' = $tok } -TimeoutSec 5; if ($s.clients -gt 0) { break } } catch { }
    Start-Sleep 1
  }
  if ($s) { Write-Host ("Stan: karty={0}, narzędzia={1}, bezpiecznik otwarty dla: {2}" -f $s.clients, $s.tools.Count, (($s.circuit_breaker.states.PSObject.Properties.Name) -join ', ')) }
  if ($s -and $s.clients -eq 0) { Write-Host 'Brak połączonej karty — Hermes otworzy ją narzędziem desktop_open, albo otwórz http://localhost:4000.' -ForegroundColor Yellow }
}
if ($bridgeOk -and $gwOk) { exit 0 } else { exit 1 }
