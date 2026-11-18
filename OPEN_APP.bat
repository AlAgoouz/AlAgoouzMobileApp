@echo off
chcp 65001 >nul
title بُن العجوز - أصل المزاج | نظام إدارة المحل والمخزن والإنتاج
cd /d "%~dp0"
node scripts/run-local.mjs --open
pause
