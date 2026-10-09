<#
.SYNOPSIS
  Autostart Jarvis OS przy logowaniu do Windows: strona :4000, most MCP i Hermes jarvis-desktop.

.DESCRIPTION
  Tworzy cztery zadania w Harmonogramie zadań bieżącego użytkownika (bez uprawnień administratora), każde przez
  bridge\run-service.ps1 w ukrytym oknie, z logami w %USERPROFILE%\.jarvis-os\logs:
    JarvisOS-Site            - strona Jarvis OS (python bridge\serve_site.py 4000, Host walidowany)
    JarvisOS-Bridge          - most MCP + agenci (bridge\jarvis_bridge.py, :8651)
    JarvisOS-DesktopGateway  - Hermes, profil jarvis-desktop (:8643), po starcie mostu
    JarvisOS-OpenTab         - jednorazowo otwiera kartę :4000, TYLKO gdy żadna nie jest połączona z mostem
                               (żeby polecenia pulpitu z Telegrama/API miały gdzie się wykonać)
  Strona, most i gateway mają też watchdog: wyzwalacz co 5 min podnosi padniętą usługę (działająca nie jest uruchamiana
  drugi raz). Piąte zadanie, JarvisOS-GatewayRestart, to bezpieczny restart gatewaya na żądanie (bridge\restart-gateway.ps1).
  Hermes działa natywnie w Windows (bez WSL). Usunięcie wszystkich zadań: -Remove.

.EXAMPLE
  .\bridge\install-autostart.ps1
  .\bridge\install-autostart.ps1 -Remove
#>
param([switch]$Remove)
$ErrorActionPreference = 'Stop'
$names = [ordered]@{ 'JarvisOS-Site' = 'site'; 'JarvisOS-Bridge' = 'bridge'; 'JarvisOS-DesktopGateway' = 'gateway'; 'JarvisOS-OpenTab' = 'tab' }
if ($Remove) { foreach ($n in @($names.Keys) + 'JarvisOS-GatewayRestart') { Unregister-ScheduledTask -TaskName $n -Confirm:$false -ErrorAction SilentlyContinue; Write-Host "Usunięto: $n" }; return }

$runner = Join-Path $PSScriptRoot 'run-service.ps1'
foreach ($f in $runner, (Join-Path $env:USERPROFILE '.hermes\hermes-agent\venv\Scripts\python.exe'), (Join-Path $env:USERPROFILE '.hermes\bin\hermes.exe')) { if (-not (Test-Path $f)) { throw "Brak pliku: $f" } }

$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
$logon    = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
# Watchdog: drugi wyzwalacz co 5 min bez końca. run-service.ps1 kończy się od razu, gdy usługa już nasłuchuje,
# a IgnoreNew blokuje drugą kopię — więc powtórka jest nieszkodliwa, a padnięta usługa wstaje w ≤ 5 min.
$watchdog = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
$ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'   # pełna ścieżka: Harmonogram bez niej zgłaszał 0x80070002
$repo = Split-Path -Parent $PSScriptRoot
foreach ($n in $names.Keys) {
  $a = New-ScheduledTaskAction -Execute $ps -WorkingDirectory $repo -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$runner`" -Service $($names[$n])"
  $triggers = if ($names[$n] -eq 'tab') { @($logon) } else { @($logon, $watchdog) }   # karta tylko przy logowaniu
  Register-ScheduledTask -TaskName $n -Action $a -Trigger $triggers -Settings $settings -Description "Jarvis OS: $($names[$n])" -Force | Out-Null
}
# Bezpieczny restart gatewaya na żądanie (schtasks /Run /TN JarvisOS-GatewayRestart) — poza drzewem procesów gatewaya,
# czeka na koniec rozmów w toku; jedyna droga restartu z Hermesa (hak blokuje `hermes gateway restart` w jego terminalu).
$restart = New-ScheduledTaskAction -Execute $ps -WorkingDirectory $repo -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$(Join-Path $PSScriptRoot 'restart-gateway.ps1')`""
Register-ScheduledTask -TaskName 'JarvisOS-GatewayRestart' -Action $restart -Settings $settings -Description 'Jarvis OS: bezpieczny restart gatewaya Hermesa' -Force | Out-Null
Write-Host "Zarejestrowano zadania: $($names.Keys -join ', '), JarvisOS-GatewayRestart — ruszą przy następnym logowaniu (watchdog co 5 min)."
Write-Host "Uruchomić teraz:  $(($names.Keys | ForEach-Object { "Start-ScheduledTask -TaskName $_" }) -join '; ')"
Write-Host "Usunąć:           .\bridge\install-autostart.ps1 -Remove"
