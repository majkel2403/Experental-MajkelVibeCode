#!/bin/sh
# Podzbiory czcionek (woff2) do assets/fonts: łacina + polskie znaki + używana interpunkcja/symbole.
# Użycie: [DSEG=ścieżka/dseg7-classic-latin-400-normal.woff2] tools/build-fonts.sh <katalog z oryginalnymi woff2 z Google Fonts (latin + latin-ext)>
# Wymaga fontTools + brotli (pip install fonttools brotli). Zakres znaków musi zgadzać się z unicode-range w css/jarvis.css.
set -e
SRC="$1"; OUT="$(dirname "$0")/../assets/fonts"; mkdir -p "$OUT"
U="U+0020-007E,U+00A0-00FF,U+0131,U+0152-0153,U+02C6,U+02DC,U+2013-2014,U+2018-201A,U+201C-201E,U+2020-2022,U+2026,U+2030,U+2039-203A,U+20AC,U+2122,U+2191,U+2193,U+2212"
PL="U+0104-0107,U+0118-0119,U+0141-0144,U+015A-015B,U+0179-017C"   # polskie znaki: ąćęłńśźż + wersaliki (U+00F3 ó/Ó jest w Latin-1)
sub() { pyftsubset "$1" --unicodes="${3:-$U}" --flavor=woff2 --layout-features='*' --output-file="$OUT/$2"; }
lim() { python3 -c "
import sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
f=TTFont(sys.argv[1]); instancer.instantiateVariableFont(f,{'wght':(int(sys.argv[3]),int(sys.argv[4]))},inplace=True); f.save(sys.argv[2])" "$1" "$2" "$3" "$4"; }
T="$(mktemp -d)"
lim "$SRC/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7.woff2" "$T/inter.woff2" 400 800; sub "$T/inter.woff2" inter.woff2
lim "$SRC/tDbv2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKwBNntkaToggR7BYRbKPxDcwg.woff2" "$T/jbm.woff2" 400 600; sub "$T/jbm.woff2" jetbrains-mono.woff2
lim "$SRC/yMJRMIlzdpvBhQQL_Qq7dy0.woff2" "$T/orb.woff2" 500 800; sub "$T/orb.woff2" orbitron.woff2
sub "$SRC/LDI2apCSOBg7S-QT7pb0EPOreec.woff2" rajdhani-500.woff2
sub "$SRC/LDI2apCSOBg7S-QT7pbYF_Oreec.woff2" rajdhani-600.woff2
sub "$SRC/LDI2apCSOBg7S-QT7pa8FvOreec.woff2" rajdhani-700.woff2
# polskie znaki z plików latin-ext (Google trzyma je osobno)
lim "$SRC/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa25L7SUc.woff2" "$T/interx.woff2" 400 800; sub "$T/interx.woff2" inter-pl.woff2 "$PL"
lim "$SRC/tDbv2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKwBNntkaToggR7BYRbKPx7cwhsk.woff2" "$T/jbmx.woff2" 400 600; sub "$T/jbmx.woff2" jetbrains-mono-pl.woff2 "$PL"
sub "$SRC/LDI2apCSOBg7S-QT7pb0EPOleef2kg.woff2" rajdhani-pl-500.woff2 "$PL"
sub "$SRC/LDI2apCSOBg7S-QT7pbYF_Oleef2kg.woff2" rajdhani-pl-600.woff2 "$PL"
sub "$SRC/LDI2apCSOBg7S-QT7pa8FvOleef2kg.woff2" rajdhani-pl-700.woff2 "$PL"
# cyfry LED (DSEG7 Classic, OFL): npm pack @fontsource/dseg7-classic → files/dseg7-classic-latin-400-normal.woff2; podzbiór = unicode-range w css/neon.css
[ -n "$DSEG" ] && pyftsubset "$DSEG" --unicodes="U+0020,U+002D,U+002E,U+0030-003A" --flavor=woff2 --layout-features='*' --output-file="$OUT/dseg7-classic.woff2"
rm -rf "$T"
