@echo off
cd /d "%~dp0"
echo ===SYNC=== > pushlog.txt
git rm --cached config/inboxes.json 1>>pushlog.txt 2>&1
git add -A 1>>pushlog.txt 2>&1
git commit -m "Add local always-on engine (worker), disk persistence, pre-warmed inbox support, business-hours gate; protect secrets" 1>>pushlog.txt 2>&1
git push origin main 1>>pushlog.txt 2>&1
echo ---DONE_%errorlevel%--- 1>>pushlog.txt 2>&1
