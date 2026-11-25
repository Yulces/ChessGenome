# Subir ChessGenome a la VPS

**VPS:** `ubuntu@82.25.69.91`  
**Dominio:** `srv742144.hstgr.cloud`

## 1. DNS (Hostinger / panel)

Asegúrate de que `srv742144.hstgr.cloud` apunta a `82.25.69.91` (registro A).

## 2. Desde tu PC (carpeta sin node_modules)

```bash
# En el PC (Git Bash), desde el padre de ChessGenome:
rsync -avz --progress \
  --exclude node_modules \
  --exclude dist \
  --exclude .git \
  --exclude DietrichessAnalyzer/python \
  --exclude '**/engines/*.exe' \
  /d/ChessGenome/ ubuntu@82.25.69.91:~/ChessGenome/
```

O con scp del zip:

```bash
# Empaquetar sin basura
cd /d/ChessGenome
tar --exclude=node_modules --exclude=dist --exclude=.git -czf /tmp/chessgenome.tgz .
scp /tmp/chessgenome.tgz ubuntu@82.25.69.91:~/
ssh ubuntu@82.25.69.91 'mkdir -p ~/ChessGenome && tar -xzf ~/chessgenome.tgz -C ~/ChessGenome'
```

## 3. En la VPS

```bash
ssh ubuntu@82.25.69.91
cd ~/ChessGenome
bash deploy/setup-vps.sh
```

## 4. Comprobar

```bash
curl -s http://127.0.0.1:3000/api/positions/stats
curl -s http://srv742144.hstgr.cloud/api/positions/stats
```

Navegador: **http://srv742144.hstgr.cloud/**

## 5. HTTPS (recomendado)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d srv742144.hstgr.cloud
```

## Notas

- MongoDB y Redis deben estar activos (`sudo systemctl status mongod redis-server`).
- Stockfish: `sudo apt install stockfish` → `/usr/games/stockfish`.
- Modelos neurales: copia a `~/ChessGenome/models` y ajusta `NEURAL_MODELS_PATH` en `deploy/.env.production`.
- Tras cambios de código: `npm run build` en backend + `npx webpack --config webpack.prod.cjs` en frontend + `sudo systemctl restart chessgenome-backend`.
