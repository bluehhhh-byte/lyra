@echo off
setlocal
title Lyra Production Deployment
cd /d "%~dp0"
call pnpm deploy:prod
set "EXIT_CODE=%ERRORLEVEL%"
echo.
if not "%EXIT_CODE%"=="0" echo Deployment failed. Review the message above.
if "%EXIT_CODE%"=="0" echo Deployment completed successfully.
pause
exit /b %EXIT_CODE%
