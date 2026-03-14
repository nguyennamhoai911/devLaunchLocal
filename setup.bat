@echo off
echo ============================================
echo   Dev Project Manager - Setup Script
echo ============================================
echo.

echo [1/3] Installing root dependencies (Electron + PM2)...
call npm install
if %errorlevel% neq 0 (
    echo ERROR: Failed to install root dependencies
    pause
    exit /b 1
)

echo.
echo [2/3] Installing frontend dependencies (React + Tailwind)...
cd frontend
call npm install
if %errorlevel% neq 0 (
    echo ERROR: Failed to install frontend dependencies
    cd ..
    pause
    exit /b 1
)
cd ..

echo.
echo [3/3] Setup complete!
echo.
echo ============================================
echo   To run the app in development mode:
echo   - Open TWO terminals:
echo     Terminal 1: cd frontend ^&^& npm run dev
echo     Terminal 2: npm start
echo.
echo   OR if concurrently works:
echo     npm run dev
echo ============================================
echo.
pause
