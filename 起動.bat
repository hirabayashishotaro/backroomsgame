@echo off
chcp 65001 >nul
title THE BACKROOMS: ENDLESS
cd /d "%~dp0"

echo ==========================================
echo   THE BACKROOMS: ENDLESS ランチャー
echo ==========================================
echo.

set "CANPULL=1"
where git >nul 2>&1
if errorlevel 1 set "CANPULL=0"
if not exist ".git" set "CANPULL=0"
where npm >nul 2>&1
if errorlevel 1 (
  echo [エラー] Node.js が見つかりません。https://nodejs.org/ja から LTS 版をインストールしてください。
  pause
  exit /b 1
)

if "%CANPULL%"=="0" goto nopull
echo [1/3] 最新版を取得しています...
rem npm install が書き換えることのあるファイルを元に戻してから取り込む
git checkout -- package-lock.json >nul 2>&1
git pull
if errorlevel 1 (
  echo [注意] 最新版の取得に失敗しました。今あるバージョンで起動します。
)
goto pulled
:nopull
echo [1/3] Git を使わない導入のため、最新版の取得は省略します。
:pulled
echo.

echo [2/3] 部品を更新しています(初回は数分かかります)...
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo [エラー] npm install に失敗しました。上のメッセージを確認してください。
  pause
  exit /b 1
)
echo.

echo [3/3] ゲームを起動しています...
call npm run electron
if errorlevel 1 (
  echo [エラー] 起動に失敗しました。上のメッセージを確認してください。
  pause
  exit /b 1
)
