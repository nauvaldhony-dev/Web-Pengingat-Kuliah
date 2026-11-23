@echo off
REM ============================================================
REM  KuliahKu - Jalankan lewat server lokal
REM ------------------------------------------------------------
REM  Kenapa harus lewat server?
REM  Chrome memblokir izin notifikasi kalau file dibuka langsung
REM  (file://). Lewat http://localhost, notifikasi jalan normal.
REM ============================================================

title KuliahKu - Server Lokal
cd /d "%~dp0"

echo.
echo  ===========================================
echo   KuliahKu - Pengingat Jadwal Kuliah
echo  ===========================================
echo.

REM Cek python dulu, kalau tidak ada coba py, lalu node
where python >nul 2>nul
if %errorlevel%==0 (
    echo  Membuka http://localhost:8000 ...
    start "" http://localhost:8000
    python -m http.server 8000
    goto :eof
)

where py >nul 2>nul
if %errorlevel%==0 (
    echo  Membuka http://localhost:8000 ...
    start "" http://localhost:8000
    py -m http.server 8000
    goto :eof
)

where node >nul 2>nul
if %errorlevel%==0 (
    echo  Python tidak ada, memakai Node.js...
    start "" http://localhost:8000
    npx --yes serve -l 8000 .
    goto :eof
)

echo  [ERROR] Python dan Node.js tidak ditemukan.
echo.
echo  Install salah satunya dulu:
echo    Python : https://python.org/downloads
echo    Node.js: https://nodejs.org
echo.
echo  Atau pakai VS Code + extension "Live Server".
echo.
pause
