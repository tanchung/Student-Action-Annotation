# Script để khởi động backend và frontend

Write-Host "🚀 Starting Backend Server..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd 'd:\KLTN1\demo\backend'; node server.js"

Start-Sleep -Seconds 3

Write-Host "🚀 Starting Frontend Dev Server..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd 'd:\KLTN1\demo\frontend\frontend'; npm run dev"

Write-Host "✅ Servers starting..." -ForegroundColor Cyan
Write-Host "Backend: http://localhost:5000" -ForegroundColor Yellow
Write-Host "Frontend: http://localhost:5173" -ForegroundColor Yellow
