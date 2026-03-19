@echo off
echo ==========================================
echo   Adaptive Learning Updater ^& Launcher
echo ==========================================
echo.
echo Launching in Git Bash...

:: Launch everything through Git Bash
"C:\Program Files\Git\git-bash.exe" -c "cd ~/OneDrive/Desktop/adaptive-learning/adaptive-learning && echo '[1/5] Pulling latest app changes...' && git pull origin main; echo '[2/5] Installing app dependencies...' && npm install && echo '[3/5] Copying app into even-dev...' && cp -r ~/OneDrive/Desktop/adaptive-learning/adaptive-learning ~/OneDrive/Desktop/even-dev/apps/adaptive-learning && cd ~/OneDrive/Desktop/even-dev && echo '[4/5] Installing even-dev dependencies...' && npm install && echo '[5/5] Starting Even Hub simulator...' && ./start-even.sh adaptive-learning; read"
