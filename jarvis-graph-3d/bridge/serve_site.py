# -*- coding: utf-8 -*-
"""Serwer strony Jarvis OS (:4000) z walidacją nagłówka Host.

python -m http.server oddaje pliki każdemu, kto trafi na port — także obcej stronie
z internetu, która sztuczką DNS rebinding (własna domena wskazująca na 127.0.0.1)
mogłaby odczytać config.local.js z kluczem Jeva. Ten serwer odrzuca żądania,
których Host nie jest localhost/127.0.0.1, więc rebinding dostaje 403 zamiast klucza.

Użycie: python bridge/serve_site.py [port]   (domyślnie 4000, nasłuch tylko 127.0.0.1)
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 4000
ALLOWED = {f"localhost:{PORT}", f"127.0.0.1:{PORT}", "localhost", "127.0.0.1", f"[::1]:{PORT}", "[::1]"}


class Handler(SimpleHTTPRequestHandler):
    def send_head(self):   # wspólna ścieżka GET i HEAD — tu bramkujemy Host
        host = (self.headers.get("Host") or "").strip().lower()
        if host not in ALLOWED:
            self.send_error(403, "Host not allowed")
            return None
        return super().send_head()

    def log_request(self, code="-", size="-"):   # ciszej: loguj tylko odmowy i błędy, nie każdy plik
        if str(code).startswith(("4", "5")):
            super().log_request(code, size)


if __name__ == "__main__":
    print(f"[jarvis-site] http://localhost:{PORT} (tylko ten komputer, Host walidowany)", file=sys.stderr)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
