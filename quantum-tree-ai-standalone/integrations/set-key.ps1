<#
.SYNOPSIS
  Zapisuje klucz Jeva dla agentów (internet + prawdziwy komputer) — bezpiecznie, bez wpisywania go w rozmowie ani w kodzie.

.DESCRIPTION
  Klucz podajesz w ukrytym polu. Trafia WYŁĄCZNIE do %USERPROFILE%\.jarvis-os\jev.env (dostęp tylko dla Twojego konta) —
  plik czytają most, agent WWW i sterowanie komputerem. Opcjonalnie dopisuje ten sam klucz do config.local.js
  (ignorowany przez git), żeby działał też sędzia Jev w samym Jarvis OS.

  Model pomocniczy do wpisywania tekstu (writer): domyślnie most (bridge) sam kieruje go przez pośrednika bridge\writer_proxy.py —
  łańcuch szybkich DARMOWYCH modeli z OpenRouter (tym samym kluczem), a gdy żaden nie odpowie w 9 s, awaryjnie Twój Hermes.
  Dzięki temu wpisywanie nie zależy od limitów modelu Hermesa. Wpisy CLICKER_WRITER_* poniżej to tylko tryb bez mostu.

  -Provider openrouter  (domyślnie) klucz z openrouter.ai/keys — Jev (agent WWW, sterowanie komputerem, sędzia w Jarvisie)
  -Provider typesafe    klucz z console.typesafe.ai/keys — Jev bezpośrednio

  -Writer hermes        (domyślnie, dotyczy uruchomień bez mostu) model pomocniczy = Twój Hermes (profil jarvis-desktop, MiniMax-M3, gateway :8643).
                        Sprawdzone: poprawny JSON i polskie teksty, ale 4–11 s na wywołanie — używany tylko do wpisywania tekstu
                        i odpowiedzi końcowej, nie w każdym kroku. Zrzuty ekranu NIE są do niego wysyłane (tylko tekst ekranu).
  -Writer anthropic     klucz Anthropic wpisany w ukrytym polu (bezpośrednio, nie OpenRouter)
  -Writer none          bez modelu pomocniczego: komputer klika, ale nie wpisuje tekstu
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File integrations\set-key.ps1
#>
param([ValidateSet('openrouter', 'typesafe')][string]$Provider = 'openrouter', [ValidateSet('hermes', 'anthropic', 'none')][string]$Writer = 'hermes', [switch]$NoJarvis, [securestring]$ApiKey)   # -ApiKey: tylko do automatyzacji i testów (normalnie klucz wpisujesz w ukrytym polu)
$ErrorActionPreference = 'Stop'
$root = Join-Path $env:USERPROFILE '.jarvis-os'
$file = Join-Path $root 'jev.env'
$repo = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
function Ask-Secret($prompt) { $s = Read-Host $prompt -AsSecureString; $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s); try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b).Trim() } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) } }

$url = if ($Provider -eq 'openrouter') { 'https://openrouter.ai/keys' } else { 'https://console.typesafe.ai/keys' }
Write-Host "Klucz wygenerujesz na $url — wklej go poniżej (znaki nie są pokazywane)."
$key = if ($ApiKey) { $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($ApiKey); try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b).Trim() } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) } } else { Ask-Secret 'Klucz Jeva' }
if (-not $key) { throw 'Nie podano klucza.' }
if ($Provider -eq 'openrouter' -and $key -notmatch '^sk-or-') { Write-Warning 'Klucz OpenRouter zwykle zaczyna się od "sk-or-". Zapisuję mimo to.' }

$lines = @('# Jarvis OS — klucz i ustawienia Jeva dla agentów. Plik lokalny, nie commituj, nie wysyłaj.', "# dostawca: $Provider ($(Get-Date -Format 'yyyy-MM-dd'))")
if ($Provider -eq 'openrouter') {
  $lines += @(
    "TYPESAFE_API_KEY=$key", 'TYPESAFE_BASE_URL=https://openrouter.ai/api', 'TYPESAFE_DEFAULT_MODEL=typesafe/jev-1.13', 'JEV_MODEL=typesafe/jev-1.13')
} else {
  $lines += @("TYPESAFE_API_KEY=$key")
}
switch ($Writer) {
  'hermes' {
    $penv = Join-Path $env:USERPROFILE '.hermes\profiles\jarvis-desktop\.env'
    $hk = if (Test-Path $penv) { (Get-Content $penv -Encoding UTF8 | Where-Object { $_ -match '^\s*API_SERVER_KEY\s*=\s*\S' } | Select-Object -First 1) -replace '^\s*API_SERVER_KEY\s*=\s*', '' } else { '' }
    if ($hk) { $lines += @('# model pomocniczy (wpisywanie tekstu, odpowiedź końcowa): Twój Hermes, profil jarvis-desktop (MiniMax-M3) — NIE OpenRouter',
        'CLICKER_WRITER_API=openai', 'CLICKER_WRITER_BASE_URL=http://127.0.0.1:8643/v1', "CLICKER_WRITER_API_KEY=$($hk.Trim())", 'CLICKER_WRITER_MODEL=jarvis-desktop', 'CLICKER_ANSWER_MODEL=jarvis-desktop', 'CLICKER_WRITER_VISION=false') }
    else { Write-Warning "Nie znalazłem API_SERVER_KEY w $penv — model pomocniczy pominięty (uruchom ponownie po zainstalowaniu profilu jarvis-desktop)."; $lines += '# brak modelu pomocniczego (nie znaleziono profilu jarvis-desktop)' }
  }
  'anthropic' { $w = Ask-Secret 'Klucz Anthropic (bezpośrednio, NIE OpenRouter)'; if ($w) { $lines += "ANTHROPIC_API_KEY=$w" } }
  default { $lines += '# brak modelu pomocniczego (writer): sterowanie komputerem klika, ale nie wpisuje tekstu ani nie składa odpowiedzi końcowej' }
}
$lines += @('# Windows OCR: pakiet języka systemu (angielski bywa niezainstalowany)', 'CLICKER_OCR_LANGUAGE=pl')

New-Item -ItemType Directory -Force $root | Out-Null
Set-Content -Path $file -Value $lines -Encoding UTF8
icacls $file /inheritance:r /grant:r "$($env:USERNAME):(R,W)" | Out-Null   # tylko Twoje konto
Write-Host "Zapisano $file (dostęp tylko dla $env:USERNAME)." -ForegroundColor Green

if ($Provider -eq 'openrouter' -and -not $NoJarvis) {
  $ans = Read-Host 'Użyć tego klucza także dla sędziego Jev w samym Jarvis OS (config.local.js)? [T/n]'
  if ($ans -notmatch '^[nN]') {
    $cfg = Join-Path $repo 'config.local.js'
    if (Test-Path $cfg) { $txt = Get-Content $cfg -Raw } else { $txt = "window.JARVIS_CONFIG = {`n};`n" }
    $txt = [regex]::Replace($txt, "(?m)^\s*(jevKey|jevOn)\s*:.*\r?\n", '')
    $safeKey = $key.Replace('$', '$$')   # „$” w tekście zastąpienia regex to odwołanie do grupy — klucz z „$” wychodził zniekształcony
    $txt = [regex]::Replace($txt, 'window\.JARVIS_CONFIG\s*=\s*\{', "window.JARVIS_CONFIG = {`n  jevKey: '$safeKey',`n  jevOn: true,")
    Set-Content -Path $cfg -Value $txt -Encoding UTF8 -NoNewline
    Write-Host "Zaktualizowano $cfg (plik ignorowany przez git)." -ForegroundColor Green
  }
}
Write-Host "`nGotowe. Zrestartuj most (bridge\start-bridge.bat), żeby wczytał klucz. Sprawdź wszystko: integrations\doctor.ps1"
