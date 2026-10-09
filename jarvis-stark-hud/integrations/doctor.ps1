<#
.SYNOPSIS
  Diagnostyka agentów Jeva (internet + prawdziwy komputer): co działa, czego brakuje i jak to naprawić.

.DESCRIPTION
  Sprawdza: klucz Jeva, wdrożone repozytoria (wersje, poprawki), Node/uv/Chromium, język OCR, most, agenta WWW i Hermesa.
  -Live  dodatkowo wykonuje JEDNO prawdziwe zapytanie do Jeva (koszt ułamek grosza): potwierdza klucz i mierzy opóźnienie.
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File integrations\doctor.ps1 -Live
#>
param([switch]$Live)
$root   = Join-Path $env:USERPROFILE '.jarvis-os'
$vendor = Join-Path $root 'vendor'
$bad = 0
function Ok($m)   { Write-Host "  ✓ $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  ! $m" -ForegroundColor Yellow }
function No($m, $fix) { $script:bad++; Write-Host "  ✗ $m" -ForegroundColor Red; if ($fix) { Write-Host "      → $fix" -ForegroundColor DarkYellow } }
function Head($m) { Write-Host "`n$m" -ForegroundColor Cyan }
function EnvFile($p) { $h = @{}; if (Test-Path $p) { foreach ($l in (Get-Content $p -Encoding UTF8)) { $l = $l.TrimStart([char]0xFEFF).Trim(); if ($l -and -not $l.StartsWith('#') -and $l.Contains('=')) { $i = $l.IndexOf('='); $h[$l.Substring(0, $i).Trim()] = $l.Substring($i + 1).Trim() } } }; $h }

Head 'Klucz Jeva'
$e = EnvFile (Join-Path $root 'jev.env')
$key = $e['TYPESAFE_API_KEY']; if (-not $key) { $key = $e['JEV_API_KEY'] }
if ($key) { Ok ("jev.env: klucz " + $key.Substring(0, [Math]::Min(7, $key.Length)) + '… · adres ' + $(if ($e['TYPESAFE_BASE_URL']) { $e['TYPESAFE_BASE_URL'] } else { 'api.typesafe.ai (bezpośrednio)' }) + ' · model ' + $(if ($e['JEV_MODEL']) { $e['JEV_MODEL'] } else { 'domyślny' })) }
else { No 'brak klucza w %USERPROFILE%\.jarvis-os\jev.env' 'powershell -ExecutionPolicy Bypass -File integrations\set-key.ps1' }
if ($e['CLICKER_WRITER_BASE_URL'] -or $e['ANTHROPIC_API_KEY']) { Ok 'model pomocniczy (writer) skonfigurowany' } else { Warn 'brak modelu pomocniczego (writer, nie przez OpenRouter) — sterowanie komputerem klika, ale nie wpisze tekstu' }
if ($e['CLICKER_WRITER_BASE_URL'] -match 'openrouter') { No 'writer przez OpenRouter — wbrew zasadzie „OpenRouter tylko dla Jeva”' 'usuń CLICKER_WRITER_* z jev.env' }
if ($e['CLICKER_WRITER_BASE_URL'] -match '127\.0\.0\.1|localhost') {
  try { $m = Invoke-RestMethod ($e['CLICKER_WRITER_BASE_URL'].TrimEnd('/') + '/models') -Headers @{ Authorization = "Bearer $($e['CLICKER_WRITER_API_KEY'])" } -TimeoutSec 5; Ok "writer (Hermes) odpowiada: modele $((@($m.data.id) -join ', '))" }
  catch { No 'writer (Hermes) nie odpowiada na /v1/models' 'uruchom hermes\start-desktop-gateway.bat albo ponów set-key.ps1 (klucz mógł się zmienić)' }
}

Head 'Wdrożone repozytoria'
foreach ($n in 'jev-voice-browser', 'typesafe-computer-use') {
  $d = Join-Path $vendor $n
  if (-not (Test-Path (Join-Path $d '.git'))) { No "${n}: nie zainstalowany" 'powershell -ExecutionPolicy Bypass -File integrations\setup.ps1'; continue }
  $sha = git -C $d rev-parse --short HEAD; $dirty = (git -C $d status --porcelain).Count
  Ok "$n @ $sha ($dirty zmienione pliki = nasze poprawki)"
}
$jb = Join-Path $vendor 'jev-voice-browser'
if (Test-Path (Join-Path $jb 'node_modules')) { Ok 'jev-voice-browser: zależności Node zainstalowane' } else { No 'jev-voice-browser: brak node_modules' 'integrations\setup.ps1' }
if (Test-Path (Join-Path $vendor 'typesafe-computer-use\.venv')) { Ok 'typesafe-computer-use: środowisko Pythona (uv) gotowe' } else { No 'typesafe-computer-use: brak .venv' 'integrations\setup.ps1' }
$pw = Get-ChildItem (Join-Path $env:LOCALAPPDATA 'ms-playwright') -Directory -Filter 'chromium-*' -ErrorAction SilentlyContinue
if ($pw) { Ok "Chromium Playwright: $(($pw.Name | Sort-Object) -join ', ')" } else { No 'brak Chromium dla Playwright' 'integrations\setup.ps1' }

Head 'Windows OCR (czytanie ekranu)'
$uv = (Get-Command uv -ErrorAction SilentlyContinue).Source; if (-not $uv) { $uv = Join-Path $env:USERPROFILE '.hermes\bin\uv.exe' }
if ((Test-Path $uv) -and (Test-Path (Join-Path $vendor 'typesafe-computer-use\.venv'))) {
  $ocr = & $uv run --project (Join-Path $vendor 'typesafe-computer-use') python -c "from winrt.windows.media.ocr import OcrEngine; print(','.join(l.language_tag for l in OcrEngine.available_recognizer_languages))" 2>$null
  $want = if ($e['CLICKER_OCR_LANGUAGE']) { $e['CLICKER_OCR_LANGUAGE'] } else { 'en' }
  if ($ocr -match "(^|,)$want") { Ok "OCR: dostępne [$ocr], używany '$want'" } else { No "OCR: dostępne [$ocr], a używany '$want'" "ustaw CLICKER_OCR_LANGUAGE w jev.env na jeden z dostępnych albo zainstaluj język (admin): Add-WindowsCapability -Online -Name 'Language.OCR~~~en-US~0.0.1.0'" }
  $ext = Join-Path (Split-Path -Parent $PSCommandPath) 'computer'
  $st = & $uv run --project (Join-Path $vendor 'typesafe-computer-use') python -c "import sys; sys.path.insert(0, sys.argv[1]); import jarvis_clicker as j; r = j.apply(); print(all(r.values()), ','.join(sorted(j.CATALOG)))" $ext 2>$null
  if ($st -match '^True') { Ok "rozszerzenia sterowania komputerem nałożone; programy do uruchomienia: $(($st -split ' ')[1])" } else { No "rozszerzenia sterowania komputerem (jarvis_clicker.py) się nie nakładają: $st" 'zaktualizuj: integrations\setup.ps1; testy: uv run --project ...\typesafe-computer-use python -m pytest integrations/computer' }
}

Head 'Uruchomione usługi'
$token = if (Test-Path (Join-Path $root 'bridge-token')) { (Get-Content (Join-Path $root 'bridge-token') -Raw).Trim() } else { '' }
foreach ($p in @(@(8651, 'most Jarvisa (MCP)'), @(8643, 'gateway Hermesa (profil jarvis-desktop)'), @(8788, 'agent WWW (Chromium + Jev)'), @(4000, 'strona Jarvis OS'))) {
  if (Get-NetTCPConnection -LocalPort $p[0] -State Listen -ErrorAction SilentlyContinue) { Ok "$($p[1]) — port $($p[0])" }
  elseif ($p[0] -eq 8788) { Warn "$($p[1]) — jeszcze nie działa (most uruchomi go przy pierwszym użyciu)" }
  else { No "$($p[1]) — port $($p[0]) nie nasłuchuje" $(if ($p[0] -eq 8651) { 'bridge\start-bridge.bat' } elseif ($p[0] -eq 8643) { 'hermes\start-desktop-gateway.bat' } else { 'python bridge\serve_site.py 4000 w katalogu Jarvisa' }) }
}
if ($token) {
  try { $s = Invoke-RestMethod 'http://127.0.0.1:8651/agents/status' -Headers @{ 'X-Bridge-Token' = $token } -TimeoutSec 5; Ok "most → agenci: klucz=$($s.key), WWW=$(if ($s.web.up) { 'działa' } else { 'śpi' }), komputer=$(if ($s.computer.installed) { 'gotowy' } else { 'brak' })" }
  catch { if ($_.Exception.Response.StatusCode.value__ -eq 404) { No 'most działa na starym kodzie (bez agentów)' 'zrestartuj bridge\start-bridge.bat' } else { Warn "most nie odpowiada na /agents/status: $($_.Exception.Message)" } }
}

if ($Live -and $key) {
  Head 'Prawdziwe zapytanie do Jeva'
  $base = if ($e['TYPESAFE_BASE_URL']) { $e['TYPESAFE_BASE_URL'].TrimEnd('/') } else { 'https://api.typesafe.ai' }
  $model = if ($e['JEV_MODEL']) { $e['JEV_MODEL'] } else { 'jev-1.13.0' }
  $body = @{ model = $model; state = @{ transcript = 'go to wikipedia'; page = @{ url = 'about:blank' } }; questions = @{ intent = @{ type = 'choice'; instructions = 'Which browser action does the user ask for in `transcript`?'; criteria = @{ navigate_url = 'Open a website by name'; scroll_down = 'Scroll down the page'; none = 'Not a browser command' } } } } | ConvertTo-Json -Depth 8
  $sw = [Diagnostics.Stopwatch]::StartNew()
  try {
    $r = Invoke-RestMethod "$base/v1/systemone" -Method Post -ContentType 'application/json; charset=utf-8' -Headers @{ Authorization = "Bearer $key" } -Body ([Text.Encoding]::UTF8.GetBytes($body)) -TimeoutSec 20
    $sw.Stop(); $a = $r.answers.intent
    Ok ("Jev odpowiedział w $([int]$sw.ElapsedMilliseconds) ms: intent = $($a.choice) (pewność $([Math]::Round($a.confidence, 2))), tokenów: $($r.usage.input_tokens)")
    if ($a.choice -ne 'navigate_url') { Warn 'oczekiwano navigate_url dla „go to wikipedia”' }
  } catch { $sw.Stop(); $code = try { $_.Exception.Response.StatusCode.value__ } catch { 0 }; No "zapytanie do Jeva nie powiodło się (HTTP $code): $($_.Exception.Message)" $(if ($code -in 401, 403) { 'klucz odrzucony — wygeneruj nowy i uruchom set-key.ps1' } elseif ($code -eq 404) { 'zły adres/model — sprawdź TYPESAFE_BASE_URL i JEV_MODEL w jev.env' } else { 'sprawdź połączenie z internetem' }) }
} elseif ($Live) { Head 'Prawdziwe zapytanie do Jeva'; No 'nie można — brak klucza' 'integrations\set-key.ps1' }

Head 'Hermes jarvis-desktop: model i zapas'
$hcfg = Join-Path $env:USERPROFILE '.hermes\profiles\jarvis-desktop\config.yaml'
if (Test-Path $hcfg) {
  $y = Get-Content $hcfg -Encoding UTF8 -TotalCount 40
  $main = ($y | Where-Object { $_ -match '^\s+default:' } | Select-Object -First 1) -replace '^\s+default:\s*', ''
  $fb = @($y | Where-Object { $_ -match '^\s*(- )?\s*model:\s*\S' } | ForEach-Object { ($_ -replace '^\s*(- )?\s*model:\s*', '').Trim() })
  Ok "model główny: $main"
  if ($fb.Count) { Ok "modele zapasowe: $($fb -join ', ')" } else { Warn 'brak modelu zapasowego — gdy główny nie odpowiada, Hermes zwraca błąd' }
} else { Warn "brak $hcfg" }

# Sprawdzenie limitu kredytów OpenRouter (fallback free models)
$orEnv = Join-Path $env:USERPROFILE '.hermes\profiles\jarvis-desktop\.env'
$orKey = ''
if (Test-Path $orEnv) {
  foreach ($l in (Get-Content $orEnv -Encoding UTF8)) {
    $l = $l.Trim()
    if ($l -match '^OPENROUTER_API_KEY=(.+)') { $orKey = $Matches[1]; break }
  }
}
if ($orKey) {
  try {
    $r = Invoke-RestMethod 'https://openrouter.ai/api/v1/auth/key' `
      -Headers @{ Authorization = "Bearer $orKey" } -TimeoutSec 8
    $limit  = $r.data.limit        # null = bez limitu
    $usage  = $r.data.usage        # wydane USD
    $isFree = ($r.data.is_free_tier -eq $true) -or ($null -eq $limit)
    if ($isFree) {
      Ok "OpenRouter (fallback): klucz aktywny, plan bez limitu kredytów (darmowe modele free)"
    } else {
      $remaining = $limit - $usage
      $pct = if ($limit -gt 0) { [math]::Round(($remaining / $limit) * 100, 0) } else { 0 }   # limit 0 = klucz bez kredytów (dzielenie przez zero)
      if ($pct -lt 20) {
        No "OpenRouter kredyty niskie: pozostało ${pct}% ($([math]::Round($remaining,2)) / $limit USD)" `
           'doładuj konto na openrouter.ai lub zmień fallback na modele free'
      } else {
        Ok "OpenRouter (fallback): ${pct}% kredytów ($([math]::Round($remaining,2)) / $limit USD)"
      }
    }
  } catch {
    $code = try { $_.Exception.Response.StatusCode.value__ } catch { 0 }
    if ($code -in 401, 403) { No 'OpenRouter klucz nieprawidłowy' 'zaktualizuj OPENROUTER_API_KEY w jarvis-desktop/.env' }
    else { Warn "OpenRouter: nie można sprawdzić kredytów (HTTP $code) — $($_.Exception.Message)" }
  }
} else { Warn 'OpenRouter: brak OPENROUTER_API_KEY w jarvis-desktop/.env — fallback może nie działać' }

Head 'Autostart (po zalogowaniu do Windows)'
$tasks = @(Get-ScheduledTask -TaskName 'JarvisOS-*' -ErrorAction SilentlyContinue)
if ($tasks.Count -ge 3) { Ok "zadania: $(($tasks | ForEach-Object { $_.TaskName }) -join ', ')" } elseif ($tasks.Count) { Warn "tylko część zadań: $(($tasks | ForEach-Object { $_.TaskName }) -join ', ')" } else { Warn 'wyłączony — bridge\install-autostart.ps1' }

Head 'Zadania z ostatniej doby (dziennik %USERPROFILE%\.jarvis-os\logs\tasks.jsonl)'
$tl = Join-Path $root 'logs\tasks.jsonl'
if (Test-Path $tl) {
  $since = [DateTimeOffset]::UtcNow.AddDays(-1).ToUnixTimeMilliseconds()
  $recs = @(Get-Content $tl -Encoding UTF8 -Tail 500 | ForEach-Object { try { $_ | ConvertFrom-Json } catch { } } | Where-Object { $_.ts -ge $since })
  $fails = @($recs | Where-Object { $_.fail })
  if (-not $recs.Count) { Ok 'brak zadań w ostatniej dobie' }
  elseif (-not $fails.Count) { Ok "$($recs.Count) zadań, wszystkie udane" }
  else {
    Warn "$($fails.Count) z $($recs.Count) zadań się nie udało:"
    $fails | Select-Object -Last 6 | ForEach-Object { $t = [string]$_.text; Write-Host ('      · ''{0}'' — {1} ({2})' -f $t.Substring(0, [Math]::Min(60, $t.Length)), $_.fail, $_.route) -ForegroundColor DarkYellow }
    $offline = @($fails | Where-Object { $_.route -eq 'local-offline' -or $_.hermes -in 'off', 'down' }).Count
    if ($offline) { Warn "$offline z nich bez Hermesa — sprawdź w karcie Ustawienia → Hermes (powinien być profil jarvis-desktop, :8643)" }
  }
} else { Warn 'dziennik jeszcze pusty (powstaje po pierwszym zadaniu z odświeżonej karty)' }

Write-Host ''
if ($bad) { Write-Host "Znaleziono problemów: $bad" -ForegroundColor Red; exit 1 } else { Write-Host 'Wszystko gotowe.' -ForegroundColor Green; exit 0 }
