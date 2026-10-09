<#
.SYNOPSIS
  Wdraża agentów Jeva dla Jarvis OS: internet (moritzkremb/jev-voice-browser) i prawdziwy komputer (awlevin/typesafe-computer-use).

.DESCRIPTION
  Klonuje oba repozytoria do %USERPROFILE%\.jarvis-os\vendor na PRZYPIĘTE, przetestowane commity, nakłada dwie małe poprawki
  (integrations\patches: nazwa modelu z env i język OCR z env), instaluje zależności (npm ci, uv sync) i sprawdza system.
  Można uruchamiać wielokrotnie. Nie zmienia niczego poza %USERPROFILE%\.jarvis-os\vendor.

  -Update   pobierz nowsze wersje (ZAPOMINA przypięcie — po aktualizacji przetestuj: node --test integrations/tests)
  -DryRun   tylko pokaż, co zostałoby zrobione
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File integrations\setup.ps1
#>
param([switch]$Update, [switch]$DryRun)
$ErrorActionPreference = 'Stop'
$here   = Split-Path -Parent $PSCommandPath
$root   = Join-Path $env:USERPROFILE '.jarvis-os'
$vendor = Join-Path $root 'vendor'
$repos = @(
  @{ Name = 'jev-voice-browser';      Url = 'https://github.com/moritzkremb/jev-voice-browser.git'; Sha = '198a0764395a666f8398026c0d8abdaf6d1866c5'; Patch = 'jev-voice-browser.patch' },
  @{ Name = 'typesafe-computer-use'; Url = 'https://github.com/awlevin/typesafe-computer-use.git';  Sha = '44ca11f0935b021b73020825da054b5c92cc1288'; Patch = 'typesafe-computer-use.patch' }
)
function Step($m) { Write-Host "`n== $m" -ForegroundColor Cyan }
function Run($label, [scriptblock]$b) { if ($DryRun) { Write-Host "[dry-run] $label" } else { & $b } }
function Need($cmd, $hint) { if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { throw "Brak '$cmd' w PATH. $hint" } }

Step 'Wymagania'
Need git 'Zainstaluj Git for Windows.'
Need node 'Zainstaluj Node.js 20+ (nodejs.org).'
$nodeMajor = [int]((node --version) -replace '^v(\d+)\..*', '$1'); if ($nodeMajor -lt 20) { throw "Node $nodeMajor jest za stary (wymagane 20+)." }
$uv = (Get-Command uv -ErrorAction SilentlyContinue).Source
if (-not $uv) { $cand = Join-Path $env:USERPROFILE '.hermes\bin\uv.exe'; if (Test-Path $cand) { $uv = $cand } }
if (-not $uv) { throw "Brak 'uv' (menedżer pakietów Pythona): https://docs.astral.sh/uv/ — zwykle jest w %USERPROFILE%\.hermes\bin." }
Write-Host "git $(git --version) · node $(node --version) · uv $(& $uv --version)"
Run "mkdir $vendor" { New-Item -ItemType Directory -Force $vendor | Out-Null }

foreach ($r in $repos) {
  Step $r.Name
  $dir = Join-Path $vendor $r.Name
  if (-not (Test-Path (Join-Path $dir '.git'))) { Run "git clone $($r.Url)" { git clone --depth 1 $r.Url $dir; if ($LASTEXITCODE) { throw 'clone nie powiódł się' } } }
  if ($DryRun -and -not (Test-Path $dir)) { continue }
  Push-Location $dir
  try {
    Run 'cofnięcie lokalnych poprawek (zostaną nałożone ponownie)' { git checkout -- . 2>$null }
    if ($Update) { Run 'git pull' { git fetch --depth 1 origin; git checkout --detach FETCH_HEAD 2>$null; git reset --hard FETCH_HEAD | Out-Null } }
    else { Run "checkout $($r.Sha.Substring(0,7))" { git fetch --depth 1 origin $r.Sha 2>$null; git checkout --detach $r.Sha 2>&1 | Out-Null; if ((git rev-parse HEAD) -ne $r.Sha) { throw "Nie udało się przełączyć na $($r.Sha)" } } }
    $patch = Join-Path $here "patches\$($r.Patch)"
    Run "git apply $($r.Patch)" { git apply --whitespace=nowarn $patch; if ($LASTEXITCODE) { throw "Poprawka $($r.Patch) nie pasuje do tej wersji — użyj bez -Update albo zaktualizuj poprawkę." } }
    Write-Host ("wersja: " + (git rev-parse --short HEAD) + $(if ($Update) { ' (najnowsza)' } else { ' (przypięta)' }))
  } finally { Pop-Location }
}

Step 'jev-voice-browser: zależności Node + Chromium'
$jb = Join-Path $vendor 'jev-voice-browser'
Run 'npm ci' { Push-Location $jb; try { npm ci --no-audit --no-fund 2>&1 | Select-Object -Last 2; if ($LASTEXITCODE) { throw 'npm ci nie powiodło się' } } finally { Pop-Location } }
if (-not $DryRun) {
  $want = node -e "const fs=require('fs');const b=JSON.parse(fs.readFileSync(process.argv[1],'utf8')).browsers;console.log((b.find(x=>x.name==='chromium')||{}).revision||'')" (Join-Path $jb 'node_modules\playwright-core\browsers.json')
  $have = Test-Path (Join-Path $env:LOCALAPPDATA "ms-playwright\chromium-$want")
  if ($have) { Write-Host "Chromium (rewizja $want) już zainstalowany." }
  else { Write-Host "Pobieram Chromium (rewizja $want)…"; Push-Location $jb; try { npx playwright install chromium } finally { Pop-Location } }
}

Step 'typesafe-computer-use: zależności Pythona (uv sync)'
Run 'uv sync' { Push-Location (Join-Path $vendor 'typesafe-computer-use'); try { & $uv sync 2>&1 | Select-Object -Last 2; if ($LASTEXITCODE) { throw 'uv sync nie powiodło się' } } finally { Pop-Location } }

Step 'Windows OCR (czytanie ekranu)'
if (-not $DryRun) {
  $ocr = & $uv run --project (Join-Path $vendor 'typesafe-computer-use') python -c "from winrt.windows.media.ocr import OcrEngine; print(','.join(l.language_tag for l in OcrEngine.available_recognizer_languages))" 2>$null
  Write-Host "Dostępne języki OCR: $ocr"
  if ($ocr -notmatch '(^|,)en') { Write-Host "Brak angielskiego OCR — używam języka systemu (CLICKER_OCR_LANGUAGE=pl w jev.env). Angielski dodasz w PowerShell jako administrator:  Add-WindowsCapability -Online -Name 'Language.OCR~~~en-US~0.0.1.0'" -ForegroundColor Yellow }
}

Write-Host @"

Gotowe. Dalej:
  1. Klucz Jeva:   powershell -ExecutionPolicy Bypass -File integrations\set-key.ps1     (zapisze %USERPROFILE%\.jarvis-os\jev.env)
  2. Most:         bridge\start-bridge.bat      (agent WWW uruchomi się sam przy pierwszym użyciu)
  3. Gateway:      hermes\start-desktop-gateway.bat  — po zmianie narzędzi zrestartuj, żeby Hermes zobaczył nowe
  4. Diagnostyka:  powershell -ExecutionPolicy Bypass -File integrations\doctor.ps1
"@

exit 0
