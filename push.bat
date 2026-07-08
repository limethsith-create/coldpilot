@echo off
cd /d "%~dp0"
git init 1>>pushlog.txt 2>&1
git config user.email "limethsith@gmail.com" 1>>pushlog.txt 2>&1
git config user.name "limethsith-create" 1>>pushlog.txt 2>&1
git add -A 1>>pushlog.txt 2>&1
git commit -m "ColdPilot - serverless cold-email infrastructure (dashboard, warmup, sending, replies)" 1>>pushlog.txt 2>&1
git branch -M main 1>>pushlog.txt 2>&1
git remote remove origin 1>>pushlog.txt 2>&1
git remote add origin https://github.com/limethsith-create/coldpilot.git 1>>pushlog.txt 2>&1
echo ---PUSH--- 1>>pushlog.txt 2>&1
git push -u origin main 1>>pushlog.txt 2>&1
echo ---DONE_EXIT_%errorlevel%--- 1>>pushlog.txt 2>&1
