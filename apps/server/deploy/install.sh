#!/usr/bin/env bash
# Discord Status Studio — Linux server installer
# Usage (from the repo root):  bash apps/server/deploy/install.sh [--service]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SERVER="$ROOT/apps/server"

if ! command -v node >/dev/null 2>&1; then
  echo "✖ Node.js 22+ 가 필요합니다. 예) curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs"
  exit 1
fi
MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$MAJOR" -lt 22 ]; then
  echo "✖ Node.js 22 이상이 필요합니다 (현재 $(node -v))"
  exit 1
fi

echo "▶ 의존성 설치"
cd "$SERVER"
npm install --omit=dev --no-fund --no-audit
node "$ROOT/scripts/sync-shared.mjs" server

BIN="$HOME/.local/bin"
mkdir -p "$BIN"
cat > "$BIN/discord-status" <<SH
#!/usr/bin/env bash
exec node "$SERVER/src/cli.js" "\$@"
SH
chmod +x "$BIN/discord-status"
echo "✔ 명령어 설치: $BIN/discord-status"
case ":$PATH:" in *":$BIN:"*) ;; *) echo "  ⚠ PATH에 $BIN 을 추가하세요: echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.bashrc";; esac

if [ "${1:-}" = "--service" ]; then
  "$BIN/discord-status" install-service --user
  systemctl --user daemon-reload
  systemctl --user enable --now discord-status
  loginctl enable-linger "$USER" || true
  echo "✔ systemd 사용자 서비스로 실행 중. 초기 비밀번호: journalctl --user -u discord-status | grep 비밀번호"
else
  echo
  echo "다음 단계:"
  echo "  discord-status start -d        # 백그라운드 실행 (초기 비밀번호가 출력됩니다)"
  echo "  discord-status install-service # 부팅 시 자동 실행 (systemd)"
fi
