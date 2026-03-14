@echo off
echo Starting Dev Project Manager in development mode...
echo.
echo [1/2] Starting React dev server (port 5173)...
start "React Dev Server" cmd /k "cd /d %~dp0frontend && npm run dev"

echo Waiting for React to start (10 seconds)...
timeout /t 10 /nobreak > nul

echo [2/2] Starting Electron...
start "Electron App" cmd /k "cd /d %~dp0 && npm start"

echo.
echo Both windows started! Check the Electron window for the app.
