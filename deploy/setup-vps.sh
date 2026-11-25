#!/usr/bin/env bash
# Run ON the VPS as ubuntu after uploading ChessGenome/
#   bash deploy/setup-vps.sh
set -euo pipefail

DOMAIN="${DOMAIN:-srv742144.hstgr.cloud}"
ROOT="${ROOT:-/home/ubuntu/ChessGenome}"

echo "==> ChessGenome setup on $DOMAIN"
cd "$ROOT"

# System packages
sudo apt-get update -y
sudo apt-get install -y nginx mongodb redis-server stockfish curl build-essential

# Node 20 if missing
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

echo "Node: $(node -v)  npm: $(npm -v)"

# Env
mkdir -p "$ROOT/deploy"
if [ ! -f "$ROOT/deploy/.env.production" ]; then
  echo "Missing deploy/.env.production — copy from repo"
  exit 1
fi
# Point STOCKFISH to system binary if present
if [ -x /usr/games/stockfish ]; then
  sed -i 's|^STOCKFISH_PATH=.*|STOCKFISH_PATH=/usr/games/stockfish|' "$ROOT/deploy/.env.production"
elif [ -x /usr/bin/stockfish ]; then
  sed -i 's|^STOCKFISH_PATH=.*|STOCKFISH_PATH=/usr/bin/stockfish|' "$ROOT/deploy/.env.production"
fi

# Backend
cd "$ROOT/chessgenome-backend"
npm install --omit=dev
npm run build
# copy env for local reference
cp -f "$ROOT/deploy/.env.production" "$ROOT/chessgenome-backend/.env" || true

# Frontend production build
cd "$ROOT/chessgenome-frontend"
npm install --ignore-scripts
# copy-webpack-plugin may be needed
npm install copy-webpack-plugin --save-dev --ignore-scripts || true
npx webpack --config webpack.prod.cjs

# Nginx
sudo cp "$ROOT/deploy/nginx-chessgenome.conf" /etc/nginx/sites-available/chessgenome
sudo ln -sf /etc/nginx/sites-available/chessgenome /etc/nginx/sites-enabled/chessgenome
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl reload nginx

# Systemd backend
sudo cp "$ROOT/deploy/chessgenome-backend.service" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable chessgenome-backend
sudo systemctl restart chessgenome-backend

echo ""
echo "==> Done."
echo "  Web:  http://$DOMAIN/"
echo "  API:  http://$DOMAIN/api/positions/stats"
echo "  Logs: sudo journalctl -u chessgenome-backend -f"
echo ""
echo "HTTPS (optional):"
echo "  sudo apt install certbot python3-certbot-nginx"
echo "  sudo certbot --nginx -d $DOMAIN"
