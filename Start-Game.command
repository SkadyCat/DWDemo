#!/bin/bash
# DWDemo 试玩启动器（macOS）：双击运行，自动打开浏览器进入游戏。
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "未找到 Node.js。请先安装 Node 22 或更新版本：https://nodejs.org/"
  read -n 1 -s -r -p "按任意键关闭…"; exit 1
fi
PORT=${PORT:-5291}
URL="http://127.0.0.1:$PORT/"
echo "启动 DWDemo · $URL"
(sleep 2; open "$URL") &
exec node CustomTools/RuleStudio/server.mjs "$PORT"
