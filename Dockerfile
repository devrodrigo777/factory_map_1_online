# =====================================================================
# Dockerfile para Coolify / VPS - Mapa da Fábrica (LOTO)
# Multi-stage build desacoplado: compila frontend e backend para Alpine
# =====================================================================

# ----- Estágio 1: Build do Frontend React (Vite) -----
FROM node:20-alpine AS client-builder
WORKDIR /app/client

# Instala apenas as dependências do client (Vite, React, jsQR)
COPY client/package.json ./
RUN npm install

# Copia código-fonte e compila os arquivos estáticos de produção
COPY client ./
RUN npm run build

# ----- Estágio 2: Dependências de Produção do Servidor (compilação C++ do better-sqlite3) -----
FROM node:20-alpine AS server-builder
WORKDIR /app/server

# Ferramentas nativas para compilar o better-sqlite3 no Alpine Linux
RUN apk add --no-cache python3 make g++

COPY server/package.json ./
RUN npm install --omit=dev

# ----- Estágio 3: Imagem Final de Produção -----
FROM node:20-alpine AS runner
WORKDIR /app

RUN apk add --no-cache tzdata wget

ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/app/server/data

# Copia o código do servidor e suas dependências compiladas
COPY server ./server
COPY --from=server-builder /app/server/node_modules ./server/node_modules
COPY --from=server-builder /app/server/package.json ./server/package.json

# Copia o frontend compilado (Vite) para ser servido pelo Express
COPY --from=client-builder /app/client/dist ./client/dist

# Cria diretório de dados persistentes e uploads
RUN mkdir -p /app/server/data/uploads

# Volume para persistência de dados no Coolify / Docker
VOLUME ["/app/server/data"]

# Porta padrão de execução
EXPOSE 3000

# Verificação de integridade da aplicação
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/auth/config || exit 1

# Inicializa o servidor Express
CMD ["node", "server/src/index.js"]
