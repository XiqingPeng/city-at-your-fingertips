@echo off
setlocal
cd /d "%~dp0"
set "CITY_PYTHON="
if exist "%USERPROFILE%\miniconda3\python.exe" set "CITY_PYTHON=%USERPROFILE%\miniconda3\python.exe"
if not defined CITY_PYTHON if exist "%USERPROFILE%\anaconda3\python.exe" set "CITY_PYTHON=%USERPROFILE%\anaconda3\python.exe"
if not defined CITY_PYTHON (
    python --version >nul 2>&1
    if not errorlevel 1 set "CITY_PYTHON=python"
)
if not defined CITY_PYTHON (
    echo Python was not found. Install Python or Miniconda, then try again.
    pause
    exit /b 1
)
"%CITY_PYTHON%" --version >nul 2>&1
if errorlevel 1 (
    echo Python could not be started: %CITY_PYTHON%
    pause
    exit /b 1
)
echo Starting local server. Keep this window open while using the demo.
echo Open http://127.0.0.1:8000/ in Chrome.
start "" "http://127.0.0.1:8000/"
"%CITY_PYTHON%" -m http.server 8000 --bind 127.0.0.1
echo.
echo Server stopped. Check Python installation or whether port 8000 is in use.
pause
