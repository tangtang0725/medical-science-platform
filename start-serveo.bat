@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================================
echo   医学科普审核平台 - serveo 固定隧道启动器
echo   固定地址: https://guroulian.serveousercontent.com
echo ============================================================
echo.

REM --- 定位 node ---
set "NODE_EXE=node"
where node >nul 2>nul
if errorlevel 1 (
    set "NODE_EXE=C:\Users\Junchao Fang\.workbuddy\binaries\node\versions\22.22.2\node.exe"
)

REM --- 定位 ssh ---
set "SSH_EXE=ssh"
where ssh >nul 2>nul
if errorlevel 1 (
    set "SSH_EXE=C:\Windows\System32\OpenSSH\ssh.exe"
)

REM --- 启动本地服务器（若 3000 端口未占用）---
netstat -ano | findstr ":3000" >nul
if errorlevel 1 (
    echo [1/2] 启动本地审核平台...
    start "审核平台" /min cmd /c ""%NODE_EXE%" server.js"
    timeout /t 4 /nobreak >nul
) else (
    echo [1/2] 本地审核平台已在运行，跳过
)

REM --- 启动 serveo 固定隧道 ---
echo [2/2] 建立 serveo 固定隧道...
echo 固定地址: https://guroulian.serveousercontent.com
echo 保持此窗口打开；按 Ctrl+C 停止隧道
echo ============================================================
"%SSH_EXE%" -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -R guroulian:80:localhost:3000 serveo.net
