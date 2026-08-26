@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================
echo   医学科普审核平台 - 公网访问启动器
echo   （localhost.run 免下载隧道，完全免费）
echo ============================================
echo.

set "NODE_EXE=node"
where node >nul 2>nul
if errorlevel 1 (
    set "NODE_EXE=C:/Users/Junchao Fang/.workbuddy/binaries/node/versions/22.22.2/node.exe"
)

netstat -ano | findstr ":3000" >nul
if errorlevel 1 (
    echo [1/2] 启动本地审核平台...
    start "审核平台" /min cmd /c ""%NODE_EXE%" server.js"
    timeout /t 3 /nobreak >nul
) else (
    echo [1/2] 本地审核平台已在运行，跳过
)

echo [2/2] 建立公网隧道（localhost.run，已绑定账号，域名固定）...
echo.
echo 稍候，下方会显示 https://xxxx.lhr.life 链接
echo 该链接已绑定你的账号，重启电脑后依然是同一个，可放心发给审核员
echo 按 Ctrl+C 可停止隧道
echo ============================================
echo.

ssh -i "C:\Users\Junchao Fang\.ssh\id_rsa" -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -R 80:localhost:3000 651724391@qq.com@localhost.run
