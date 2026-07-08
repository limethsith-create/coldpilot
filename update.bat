@echo off
cd /d "%~dp0"
echo ===UPDATE=== > pushlog.txt
git add -A 1>>pushlog.txt 2>&1
git commit -m "Redesign dashboard UI - health gauge, warmup rings, gradient charts, brand identity" 1>>pushlog.txt 2>&1
git push origin main 1>>pushlog.txt 2>&1
echo ---DONE_EXIT_%errorlevel%--- 1>>pushlog.txt 2>&1
