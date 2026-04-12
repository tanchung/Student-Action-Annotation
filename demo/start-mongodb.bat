@echo off
echo ========================================
echo Starting MongoDB Service (Admin Required)
echo ========================================
echo.

net start MongoDB

if %errorlevel% equ 0 (
    echo.
    echo ✅ MongoDB started successfully!
) else (
    echo.
    echo ❌ Failed to start MongoDB
    echo    Please run this script as Administrator
    echo    OR open MongoDB Compass
)

echo.
pause
