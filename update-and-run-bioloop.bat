@echo off
echo ==========================================
echo   Adaptive Learning Updater & Launcher
echo ==========================================
echo.

cd /d C:\Users\maria\even-dev
if errorlevel 1 (
    echo ERROR: Could not find C:\Users\maria\even-dev
    pause
    exit /b 1
)

echo [1/3] Pulling latest changes...
git pull origin claude/frame-web-bluetooth-integration-wGvmo
if errorlevel 1 (
    echo ERROR: Git pull failed. Check your internet connection.
    pause
    exit /b 1
)

echo.
echo [2/3] Installing dependencies...
cd apps\adaptive-learning
call npm install
cd ..\..

echo.
echo [3/3] Starting Adaptive Learning...
call ./start-even.sh adaptive-learning

pause
