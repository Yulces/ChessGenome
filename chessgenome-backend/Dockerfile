FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      stockfish \
      pandoc \
      python3 \
      python3-pip \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install --break-system-packages \
      python-docx \
      numpy \
      pandas \
      scikit-learn \
      python-chess \
      tensorflow-cpu

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

EXPOSE 3001

CMD ["node", "dist/main.js"]
