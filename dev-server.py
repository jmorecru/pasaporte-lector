"""Servidor local para desarrollo.

Igual que `python -m http.server`, pero pidiendo al navegador que no guarde nada
en caché. Hace falta porque los módulos ES (los ficheros de `js/`) se quedan
cacheados con mucha insistencia y ni Ctrl+F5 los recarga siempre: acabas viendo
código viejo y buscando fallos que ya habías arreglado.

Uso:
    python dev-server.py            (puerto 8000)
    python dev-server.py 8001

Esto es solo para desarrollo en local. GitHub Pages sirve los ficheros por su
cuenta y no usa este script.
"""

import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        self.send_header("Pragma", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):
        # El log por defecto es ruidoso; dejamos solo los errores.
        if not args or not str(args[0]).startswith(("GET", "HEAD")):
            super().log_message(fmt, *args)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    server = ThreadingHTTPServer(("127.0.0.1", port), partial(NoCacheHandler))
    print(f"Pasaporte Lector en http://localhost:{port}  (Ctrl+C para parar)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor parado.")


if __name__ == "__main__":
    main()
