@echo off
cd /d "%~dp0"
echo Starting local server. Keep this window open while using the demo.
start "" "http://localhost:8000/"
python -m http.server 8000 --bind 127.0.0.1
echo.
echo Server stopped. Check Python installation or whether port 8000 is in use.
pause
