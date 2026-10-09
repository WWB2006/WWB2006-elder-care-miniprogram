@echo off
chcp 65001 >nul
setlocal

rem ====================================================================
rem  一键在「微信开发者工具」中打开本项目
rem
rem  双击本文件即可。脚本会：
rem    1. 自动探测微信开发者工具安装目录
rem    2. 校验 AppID（格式非法时开发者工具会拒绝导入）
rem    3. 自动开启 IDE 的「服务端口」（CLI 的必需前提）
rem    4. 调用官方 CLI 把本项目导入 / 打开
rem
rem  若自动探测失败，可先设置安装目录再双击：
rem    set WECHAT_DEVTOOLS_PATH=D:\微信web开发者工具
rem
rem  若还没有真实 AppID，用游客模式打开（本机可编译预览）：
rem    npm run devtools:open -- --tourist
rem ====================================================================

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [错误] 未检测到 Node.js，请先安装 Node.js 18+ 后再试。
  echo.
  pause
  exit /b 1
)

node "%~dp0scripts\open-in-devtools.js"
set "EXITCODE=%ERRORLEVEL%"

echo.
if "%EXITCODE%"=="0" (
  echo [完成] 已向微信开发者工具发送打开请求。
) else (
  echo [失败] 未能自动打开，请按上方提示处理，或手动导入：
  echo        微信开发者工具 ^> 导入项目 ^> 目录选择：%~dp0
)
echo.
pause
exit /b %EXITCODE%
