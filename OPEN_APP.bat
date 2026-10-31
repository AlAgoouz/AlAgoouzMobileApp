@echo off
chcp 65001 >nul
title بُن العجوز - أصل المزاج | نظام إدارة المحل والمخزن والإنتاج
cd /d "%~dp0"
start "" "http://localhost:5173"
npm.cmd run dev
pause
