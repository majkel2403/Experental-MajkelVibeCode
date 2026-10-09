<#
.SYNOPSIS
  Uruchamia jedną usługę Jarvis OS (używane przez autostart z install-autostart.ps1; można też ręcznie).

.DESCRIPTION
  -Service site     strona Jarvis OS: python bridge\serve_site.py 4000 (katalog repozytorium, Host walidowany)
  -Service bridge   most MCP + agenci: bridge\jarvis_bridge.py (port 8651)
  -Service gateway  Hermes, profil jarvis-desktop (port 8643); czeka, aż most wystartuje
  -Service tab      jednorazowe: czeka na most, i TYLKO gdy żadna karta nie jest połączona (clients==0),
                     otwiera http://localhost:4000 w domyślnej przeglądarce — żeby polecenia z Telegrama/API
                     dotyczące pulpitu (okna, notatki, agent WWW) miały gdzie się wykonać. Nie duplikuje karty.
  Gdy port już nasłuchuje, nic nie robi (bez drugiej kopii). Logi: %USERPROFILE%\.jarvis-os\logs\<usługa>.*.log
.EXAMPLE
  powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File bridge\run-service.ps1 -Service bridge
#>
param([Parameter(Mandatory)][ValidateSet('site', 'bridge', 'gateway', 'tab')][string]$Service)
$ErrorActionPreference = 'Stop'
$repo   = Split-Path -Parent $PSScriptRoot
$py     = Join-Path $env:USERPROFILE '.hermes\hermes-agent\venv\Scripts\python.exe'
$hermes = Join-Path $env:USERPROFILE '.hermes\bin\hermes.exe'
$root   = Join-Path $env:USERPROFILE '.jarvis-os'
$logs   = Join-Path $root 'logs'
New-Item -ItemType Directory -Force $logs | Out-Null
function Listening($p) { [bool](Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue) }

if ($Service -eq 'tab') {
  for ($i = 0; $i -lt 60 -and -not (Listening 8651); $i++) { Start-Sleep 2 }   # czekaj na most
  if (-not (Listening 8651)) { "$(Get-Date -Format s) most nie wystartował — pomijam otwarcie karty" | Out-File (Join-Path $logs 'tab.out.log') -Append; exit 0 }
  Start-Sleep 3   # daj karcie, ktora moze wlasnie startowac z przegladarka, szanse sie sparowac
  $token = if (Test-Path (Join-Path $root 'bridge-token')) { (Get-Content (Join-Path $root 'bridge-token') -Raw).Trim() } else { '' }
  try {
    $s = Invoke-RestMethod 'http://127.0.0.1:8651/bridge/status' -Headers @{ 'X-Bridge-Token' = $token } -TimeoutSec 5
    if ($s.clients -gt 0) { "$(Get-Date -Format s) karta już połączona (clients=$($s.clients)) — nie otwieram drugiej" | Out-File (Join-Path $logs 'tab.out.log') -Append; exit 0 }
  } catch { "$(Get-Date -Format s) /bridge/status niedostępny: $($_.Exception.Message) — mimo to otwieram kartę" | Out-File (Join-Path $logs 'tab.out.log') -Append }
  Start-Process 'http://localhost:4000'
  "$(Get-Date -Format s) otwarto http://localhost:4000 (brak połączonej karty)" | Out-File (Join-Path $logs 'tab.out.log') -Append
  exit 0
}

$port = @{ site = 4000; bridge = 8651; gateway = 8643 }[$Service]
if (Listening $port) { exit 0 }

switch ($Service) {
  'site'    { $exe = $py; $argv = @("`"$(Join-Path $repo 'bridge\serve_site.py')`"", '4000'); $cwd = $repo }   # walidacja Host — patrz bridge\serve_site.py
  'bridge'  { $exe = $py; $argv = @("`"$(Join-Path $repo 'bridge\jarvis_bridge.py')`""); $cwd = $repo }
  'gateway' {
    for ($i = 0; $i -lt 60 -and -not (Listening 8651); $i++) { Start-Sleep 2 }   # gateway łączy się z mostem przy starcie (narzędzia MCP)
    $exe = $hermes; $argv = @('-p', 'jarvis-desktop', 'gateway', 'run'); $cwd = $env:USERPROFILE
  }
}
# poprzedni log zostaje jako .1 — wcześniej każdy start nadpisywał przyczynę ostatniej awarii
foreach ($kind in 'out', 'err') { $lf = Join-Path $logs "$Service.$kind.log"; if ((Test-Path $lf) -and (Get-Item $lf).Length -gt 0) { Move-Item $lf "$lf.1" -Force -ErrorAction SilentlyContinue } }
$p = Start-Process -FilePath $exe -ArgumentList $argv -WorkingDirectory $cwd -WindowStyle Hidden -PassThru `
  -RedirectStandardOutput (Join-Path $logs "$Service.out.log") -RedirectStandardError (Join-Path $logs "$Service.err.log")
$p.WaitForExit()   # zadanie Harmonogramu trwa tak długo jak usługa
