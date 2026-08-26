@echo off
chcp 65001 >nul
title 医学科普审核发布平台
echo.
echo ========================================
echo   医学科普审核发布平台 启动中...
echo ========================================
echo.
cd /d "%~dp0"
"C:\Users\Junchao Fang\.workbuddy\binaries\node\versions\22.22.2\node.exe" server.js
pause
