# -*- coding: utf-8 -*-
"""Okno przeglądarki z Jarvis OS na wierzch (Windows, bez zależności — ctypes).

Używane przez narzędzie desktop_open: karta mogła stać za innymi oknami, na drugim monitorze albo zminimalizowana —
wtedy okno zgody i cały pulpit są dla użytkownika niewidoczne. Dopasowujemy WYŁĄCZNIE okna znanych przeglądarek,
których tytuł zaczyna się od tytułu strony („Jarvis OS”), żeby nie ruszyć cudzego okna (np. edytora z plikiem „jarvis”).
"""
from __future__ import annotations

import os
import time

BROWSERS = {"comet", "chrome", "msedge", "firefox", "brave", "opera", "vivaldi", "arc", "chromium", "yandex"}
TITLE = "Jarvis OS"

if os.name == "nt":   # współrzędne fizyczne (125% skalowania): bez tego zrzut byłby ucięty / przesunięty
    try:
        import ctypes as _c
        _c.windll.user32.SetProcessDpiAwarenessContext(_c.c_void_p(-4))   # PER_MONITOR_AWARE_V2
    except Exception:  # noqa: BLE001 — starszy Windows: zostaje domyślna świadomość DPI
        pass


def _exe_of(hwnd) -> str:
    import ctypes
    from ctypes import wintypes as wt
    user32, kernel32 = ctypes.windll.user32, ctypes.windll.kernel32
    pid = wt.DWORD()
    user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    h = kernel32.OpenProcess(0x1000, False, pid.value)   # PROCESS_QUERY_LIMITED_INFORMATION
    if not h:
        return ""
    try:
        buf, n = ctypes.create_unicode_buffer(1024), wt.DWORD(1024)
        if kernel32.QueryFullProcessImageNameW(h, 0, buf, ctypes.byref(n)):
            return os.path.splitext(os.path.basename(buf.value))[0].lower()
        return ""
    finally:
        kernel32.CloseHandle(h)


def find(title: str = TITLE) -> list[tuple[int, str, str]]:
    """[(hwnd, tytuł, exe)] widocznych okien przeglądarek z tytułem zaczynającym się od `title`."""
    if os.name != "nt":
        return []
    import ctypes
    from ctypes import wintypes as wt
    user32 = ctypes.windll.user32
    out: list[tuple[int, str, str]] = []

    @ctypes.WINFUNCTYPE(wt.BOOL, wt.HWND, wt.LPARAM)
    def cb(hwnd, _lp):
        n = user32.GetWindowTextLengthW(hwnd)
        if n and user32.IsWindowVisible(hwnd):
            buf = ctypes.create_unicode_buffer(n + 1)
            user32.GetWindowTextW(hwnd, buf, n + 1)
            if buf.value.startswith(title):
                exe = _exe_of(hwnd)
                if exe in BROWSERS:
                    out.append((hwnd, buf.value, exe))
        return True

    user32.EnumWindows(cb, 0)
    return out


def bring_to_front(title: str = TITLE) -> dict:
    """Przywraca (gdy zminimalizowane) i aktywuje okno. Zwraca {found, title, browser, foreground}."""
    wins = find(title)
    if not wins:
        return {"found": False}
    import ctypes
    user32, kernel32 = ctypes.windll.user32, ctypes.windll.kernel32
    hwnd, wtitle, exe = wins[0]
    if user32.IsIconic(hwnd):
        user32.ShowWindow(hwnd, 9)   # SW_RESTORE
    # Windows nie pozwala procesowi w tle zabrać fokusu; dołączenie do wątku okna z fokusem to standardowe obejście
    fg = user32.GetForegroundWindow()
    fg_tid = user32.GetWindowThreadProcessId(fg, None)
    me = kernel32.GetCurrentThreadId()
    attached = bool(fg_tid and fg_tid != me and user32.AttachThreadInput(me, fg_tid, True))
    try:
        user32.BringWindowToTop(hwnd)
        user32.SetForegroundWindow(hwnd)
    finally:
        if attached:
            user32.AttachThreadInput(me, fg_tid, False)
    time.sleep(0.15)
    if user32.GetForegroundWindow() != hwnd:   # ostatnia deska: puste naciśnięcie Alt odblokowuje SetForegroundWindow
        user32.keybd_event(0x12, 0, 0, 0)
        user32.keybd_event(0x12, 0, 2, 0)
        user32.SetForegroundWindow(hwnd)
        time.sleep(0.15)
    return {"found": True, "title": wtitle, "browser": exe, "foreground": user32.GetForegroundWindow() == hwnd}


def _rect(hwnd) -> tuple[int, int, int, int]:
    """Prostokąt okna bez niewidzialnej ramki Windows 10/11 (DWMWA_EXTENDED_FRAME_BOUNDS)."""
    import ctypes
    from ctypes import wintypes as wt
    r = wt.RECT()
    if ctypes.windll.dwmapi.DwmGetWindowAttribute(hwnd, 9, ctypes.byref(r), ctypes.sizeof(r)) != 0:
        ctypes.windll.user32.GetWindowRect(hwnd, ctypes.byref(r))
    return r.left, r.top, r.right, r.bottom


def _print_window(hwnd):
    """Obraz okna przez PrintWindow(PW_RENDERFULLCONTENT) — działa także dla okna przykrytego innymi. None przy porażce."""
    import ctypes
    from ctypes import wintypes as wt
    from PIL import Image
    user32, gdi32 = ctypes.windll.user32, ctypes.windll.gdi32
    l, t, r, b = _rect(hwnd)
    wr = wt.RECT(); user32.GetWindowRect(hwnd, ctypes.byref(wr))
    w, h = wr.right - wr.left, wr.bottom - wr.top
    if w <= 0 or h <= 0:
        return None
    hdc = user32.GetWindowDC(hwnd); mdc = gdi32.CreateCompatibleDC(hdc); bmp = gdi32.CreateCompatibleBitmap(hdc, w, h)
    gdi32.SelectObject(mdc, bmp)
    try:
        if not user32.PrintWindow(hwnd, mdc, 2):
            return None

        class BIH(ctypes.Structure):
            _fields_ = [("biSize", wt.DWORD), ("biWidth", wt.LONG), ("biHeight", wt.LONG), ("biPlanes", wt.WORD), ("biBitCount", wt.WORD),
                        ("biCompression", wt.DWORD), ("biSizeImage", wt.DWORD), ("biXPelsPerMeter", wt.LONG), ("biYPelsPerMeter", wt.LONG),
                        ("biClrUsed", wt.DWORD), ("biClrImportant", wt.DWORD)]
        bih = BIH(ctypes.sizeof(BIH), w, -h, 1, 32, 0, 0, 0, 0, 0, 0)
        buf = ctypes.create_string_buffer(w * h * 4)
        if not gdi32.GetDIBits(mdc, bmp, 0, h, buf, ctypes.byref(bih), 0):
            return None
        img = Image.frombuffer("RGB", (w, h), buf, "raw", "BGRX", 0, 1)
        # przytnij niewidzialną ramkę (różnica między GetWindowRect a ramką DWM)
        crop = (l - wr.left, t - wr.top, w - (wr.right - r), h - (wr.bottom - b))
        img = img.crop(crop) if crop[2] > crop[0] and crop[3] > crop[1] else img
        return None if img.getextrema() in (((0, 0), (0, 0), (0, 0)),) else img   # cały czarny = PrintWindow nic nie narysował
    finally:
        gdi32.DeleteObject(bmp); gdi32.DeleteDC(mdc); user32.ReleaseDC(hwnd, hdc)


def capture(path: str, title: str = TITLE, scope: str = "window") -> dict:
    """Zrzut okna przeglądarki z Jarvisem (scope='window') albo całego monitora, na którym stoi (scope='monitor')."""
    wins = find(title)
    if not wins:
        return {"found": False}
    import ctypes
    from ctypes import wintypes as wt
    from PIL import ImageGrab
    user32 = ctypes.windll.user32
    hwnd, wtitle, exe = wins[0]
    if user32.IsIconic(hwnd):   # zminimalizowane okno nie ma czego narysować
        user32.ShowWindow(hwnd, 9)
        time.sleep(0.6)
    img, method = None, ""
    if scope == "window":
        img, method = _print_window(hwnd), "printwindow"
    if img is None:   # monitor albo PrintWindow zawiódł: zrzut ekranu w obszarze okna/monitora (okno najpierw na wierzch)
        bring_to_front(title)
        time.sleep(0.4)
        if scope == "monitor":
            class MI(ctypes.Structure):
                _fields_ = [("cbSize", wt.DWORD), ("rcMonitor", wt.RECT), ("rcWork", wt.RECT), ("dwFlags", wt.DWORD)]
            mi = MI(); mi.cbSize = ctypes.sizeof(MI)
            user32.GetMonitorInfoW(user32.MonitorFromWindow(hwnd, 2), ctypes.byref(mi))
            box = (mi.rcMonitor.left, mi.rcMonitor.top, mi.rcMonitor.right, mi.rcMonitor.bottom)
        else:
            box = _rect(hwnd)
        img, method = ImageGrab.grab(bbox=box, all_screens=True), "screen"
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, "PNG")
    return {"found": True, "path": path, "title": wtitle, "browser": exe, "size": list(img.size), "method": method}
