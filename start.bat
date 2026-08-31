@echo off
echo Starting TELER...

start "TELER API" cmd /k "cd /d C:\ai_timer_app2\api && node server.js"
timeout /t 2 /nobreak >nul
start "TELER Frontend" cmd /k "cd /d C:\ai_timer_app2\Teler-Web-main && npm run dev"
timeout /t 3 /nobreak >nul

start http://localhost:3000
echo Done! Opening browser...
