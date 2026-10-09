# =====================================================================
#  Bezpieczny restart gatewaya jarvis-desktop (Telegram + api_server :8643).
#  Uruchamiany przez zadanie Harmonogramu JarvisOS-GatewayRestart (rejestruje bridge\install-autostart.ps1):
#      schtasks /Run /TN JarvisOS-GatewayRestart
#  Dziala POZA drzewem procesow gatewaya, wiec zatrzymanie gatewaya go nie zabija
#  (w przeciwienstwie do `hermes gateway restart` odpalonego z terminala agenta).
#  Log: %USERPROFILE%\.jarvis-os\logs\restart.log
# =====================================================================
$ErrorActionPreference = 'Continue'
$hermes  = Join-Path $env:USERPROFILE '.hermes\bin\hermes.exe'
$profDir = Join-Path $env:USERPROFILE '.hermes\profiles\jarvis-desktop'
$logs    = Join-Path $env:USERPROFILE '.jarvis-os\logs'
$log     = Join-Path $logs 'restart.log'
$task    = 'JarvisOS-DesktopGateway'
New-Item -ItemType Directory -Force $logs | Out-Null
function Log($m) { "$(Get-Date -Format s) $m" | Out-File $log -Append -Encoding utf8 }
function Listening($p) { [bool](Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue) }

function Send-Telegram($text) {
    try {
        $envFile = Join-Path $profDir '.env'
        $kv = @{}
        Get-Content $envFile | Where-Object { $_ -match '^\s*([A-Z_]+)\s*=\s*(.*)$' } | ForEach-Object {
            $kv[$Matches[1]] = $Matches[2].Trim().Trim('"').Trim("'")
        }
        $token = $kv['TELEGRAM_BOT_TOKEN']; $chat = $kv['TELEGRAM_HOME_CHANNEL']
        if (-not $token -or -not $chat) { Log 'brak TELEGRAM_BOT_TOKEN/TELEGRAM_HOME_CHANNEL - pomijam powiadomienie'; return }
        Invoke-RestMethod -Method Post -Uri "https://api.telegram.org/bot$token/sendMessage" `
            -Body @{ chat_id = $chat; text = $text } -TimeoutSec 15 | Out-Null
    } catch { Log "powiadomienie Telegram nieudane: $($_.Exception.Message)" }
}

Log '=== restart zlecony'
# Poczekaj, az gateway skonczy rozmowy w toku (do 120 s): agent, ktory zlecil restart, zdazy odpowiedziec,
# a rozmowa uzytkownika na Telegramie nie zostanie przerwana w polowie (incydent 2026-10-04 07:26).
Start-Sleep -Seconds 5
for ($i = 0; $i -lt 23; $i++) {
    try { $busy = (Get-Content (Join-Path $profDir 'gateway_state.json') -Raw | ConvertFrom-Json).active_agents } catch { $busy = 0 }
    if (-not $busy) { break }
    if ($i -eq 0) { Log "czekam na zakonczenie $busy aktywnych rozmow (max 120 s)" }
    Start-Sleep -Seconds 5
}
if ($busy) { Log "UWAGA: po 120 s nadal $busy aktywnych rozmow - restartuje mimo to" }

Log 'hermes gateway stop'
& $hermes -p jarvis-desktop gateway stop 2>&1 | ForEach-Object { Log "  $_" }

for ($i = 0; $i -lt 30 -and (Listening 8643); $i++) { Start-Sleep 2 }
if (Listening 8643) { Log 'UWAGA: port 8643 nadal zajety po 60 s' }

# Zadanie nadzorujace konczy sie razem z gatewayem; poczekaj, az przestanie byc Running.
for ($i = 0; $i -lt 15 -and (Get-ScheduledTask -TaskName $task).State -eq 'Running'; $i++) { Start-Sleep 2 }

Log "Start-ScheduledTask $task"
Start-ScheduledTask -TaskName $task

$ok = $false
for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep 3
    try {
        $st = Get-Content (Join-Path $profDir 'gateway_state.json') -Raw | ConvertFrom-Json
        if ($st.gateway_state -eq 'running' -and $st.platforms.telegram.state -eq 'connected') { $ok = $true; break }
    } catch { }
}

if ($ok) {
    Log "OK: gateway running, telegram connected (pid $($st.pid))"
    Send-Telegram 'Jarvis: gateway zrestartowany, jestem znow online.'
} else {
    Log 'BLAD: gateway nie wstal w 3 min - watchdog (co 5 min) sprobuje ponownie'
    Send-Telegram 'Jarvis: restart gatewaya nie potwierdzony w 3 min. Watchdog sprobuje ponownie w ciagu 5 min.'
}
