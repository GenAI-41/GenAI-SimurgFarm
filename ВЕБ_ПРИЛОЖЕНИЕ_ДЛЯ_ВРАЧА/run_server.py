"""
СимургФарм · Автономный локальный HTTP-сервер для клинического калькулятора.
Работает на стандартной библиотеке Python 3 (не требует pip install).
"""

import http.server
import socketserver
import webbrowser
import os
import sys

PORT = 8080
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

def run():
    os.chdir(DIRECTORY)
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        url = f"http://localhost:{PORT}/index.html"
        print("=" * 65)
        print(" СИМУРГФАРМ · КЛИНИЧЕСКИЙ ДОЗАТОР ЭКЗАМПЛОМИЦИНА")
        print(f" Сервер запущен на: {url}")
        print(" Для остановки нажмите Ctrl+C")
        print("=" * 65)
        webbrowser.open(url)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nСервер остановлен.")
            httpd.server_close()

if __name__ == "__main__":
    run()
