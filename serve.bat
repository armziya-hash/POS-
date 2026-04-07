@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"

set "PORT=8080"
set "HOST=127.0.0.1"

REM Optional: set PHP_EXE=C:\path\to\php.exe before running this file
if defined PHP_EXE if exist "%PHP_EXE%" (
  echo Using PHP_EXE=%PHP_EXE%
  "%PHP_EXE%" -S %HOST%:%PORT% router.php
  exit /b %ERRORLEVEL%
)

where php >nul 2>&1
if %ERRORLEVEL% equ 0 (
  echo Starting PHP at http://%HOST%:%PORT%/  (folder: %CD%)
  php -S %HOST%:%PORT% router.php
  exit /b %ERRORLEVEL%
)

if exist "C:\xampp\php\php.exe" (
  echo Using C:\xampp\php\php.exe
  echo Open http://%HOST%:%PORT%/
  "C:\xampp\php\php.exe" -S %HOST%:%PORT% router.php
  exit /b %ERRORLEVEL%
)

echo.
echo ERROR: php.exe not found.
echo - Install PHP and add it to PATH, or install XAMPP and use C:\xampp\php\php.exe
echo - Then run: php -S 127.0.0.1:8080 router.php
echo.
pause
exit /b 1
