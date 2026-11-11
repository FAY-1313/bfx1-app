@echo off
REM BFX-1 AI 分轨服务器 - 局域网模式启动脚本
REM 用途: 开机/手动启动 Demucs 6 轨分轨服务, 监听 0.0.0.0:8000
REM 使用: 双击运行 或 注册为计划任务(开机自启)

cd /d C:\Users\FAY\AndroidStudioProjects\bfv30001\temp\UI03\cloud\stem-split-server
set PORT=8000
"C:\Users\FAY\.workbuddy\binaries\python\envs\default\Scripts\python.exe" -m uvicorn server:app --host 0.0.0.0 --port 8000
