# =====================================================================
# Dockerfile para Coolify / VPS - Mapa da Fábrica (LOTO)
# Multi-stage build: compila frontend e backend em imagem leve Alpine
# =====================================================================

# ----- Estágio 1: Build do Frontend React (Vite) -----
FROM node:20-alpine AS client-builder
WORKDIR /app

COPY package*.json ./
COPY client/package*.json ./client/
RUN npm ci --workspace=client

COPY client ./client
RUN npm run build -w client

# ----- Estágio 2: Dependências de Produção do Servidor (compilação C++ do better-sqlite3) -----
FROM node:20-alpine AS server-builder
WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package*.json ./
COPY server/package*.json ./server/
RUN npm ci --workspace=server --omit=dev

# ----- Estágio 3: Imagem Final de Produção -----
FROM node:20-alpine AS runner
WORKDIR /app

RUN apk add --no-cache tzdata wget

ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/app/server/data

# Copia dependências compiladas
COPY package*.json ./
COPY --from=server-builder /app/node_modules ./node_modules
COPY --from=server-builder /app/server/node_modules ./server/node_modules

# Copia código do backend
COPY server ./server

# Copia os arquivos compilados do frontend (Vite) para serem servidos pelo Express
COPY --from=client-builder /app/client/dist ./client/dist

# Cria diretório de dados persistentes e uploads
RUN mkdir -p /app/server/data/uploads

# Volume para persistência de dados no Coolify / Docker
VOLUME ["/app/server/data"]

# Porta padrão de execução
EXPOSE 3000

# Verificação de saúde da aplicação
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/auth/config || exit 1

# Comando de inicialização
CMD ["node", "server/src/index.js"]
