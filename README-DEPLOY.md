# 🚀 Guia de Implantação no Coolify (VPS) & Sincronização

Este diretório contém a versão configurada para implantação em produção no **Coolify** (ou qualquer VPS com Docker).

---

## 📦 1. Como Implantar no Coolify

### Opção A: Pelo Coolify usando Repositório Git (Recomendado)
1. Crie um repositório Git (GitHub/GitLab) e envie o conteúdo desta pasta (`factory-map-deploy`).
2. No seu painel do **Coolify**:
   - Clique em **+ Create Project** (ou selecione um existente).
   - Escolha **+ New Resource** → **Application** → **Public/Private Repository**.
   - Conecte o repositório e selecione o branch principal.
   - O Coolify detectará automaticamente o `Dockerfile`.
3. Em **Configuration**:
   - **Port:** Defina `3000`.
   - **Persistent Storage (Volumes):**
     - Adicione um volume mapeando:
       `factory_data:/app/server/data`
     > ⚠️ **Importante:** Isso garante que o banco SQLite (`factory.db`), backups e imagens de plantas permaneçam salvos mesmo após atualizações ou reinicializações do container.
4. Clique em **Deploy**.
5. No primeiro acesso ao domínio gerado pelo Coolify, crie o administrador na tela de **Primeiro Acesso**.

---

### Opção B: Direto via Docker Compose na VPS
Se preferir rodar direto na sua VPS via SSH:
```bash
docker compose up -d --build
```
A aplicação estará disponível na porta `3000`.

---

## 🛡️ 2. Camadas de Segurança Implementadas

Para garantir a segurança dos dados e credenciais em ambiente online público:
1. **Proteção Anti-Brute-Force com Captcha Integrado:**
   - O servidor monitora tentativas de login por IP e usuário.
   - Após **3 tentativas incorretas**, o sistema exige a resolução de um **desafio Captcha visual em SVG** com distorção de caracteres e ruído de segurança.
   - As respostas do Captcha são assinadas via HMAC no servidor com expiração de 5 minutos, bloqueando ataques automatizados de bots.
2. **Criptografia de Senhas:**
   - Senhas passam por derivação `scrypt` com salt criptográfico de 16 bytes e chaves de 64 bytes.
3. **Cookies Seguros e Sessão:**
   - Cookies de sessão com flags `HttpOnly`, `SameSite=Lax` e `Secure` automáticos quando atrás do proxy HTTPS do Coolify (Traefik).
4. **Headers HTTP de Defesa:**
   - Proteção contra clickjacking (`X-Frame-Options: SAMEORIGIN`), MIME sniffing (`X-Content-Type-Options: nosniff`) e XSS.

---

## 🔄 3. Sincronização Segura entre Instâncias (Online ↔ Offline)

Você pode sincronizar os dados entre o sistema online (no Coolify) e o sistema offline da fábrica com extrema facilidade:

1. Acesse **Backup e restauração** → aba interna **Sincronização (Online ↔ Offline)**.
2. **Escolha o escopo** (sua preferência fica salva automaticamente):
   - **Somente dados:** transfere registros de bloqueio e histórico.
   - **Dados + configurações:** transfere tudo (plantas, áreas, campos, KPIs e configurações).
3. **Enviar (Gerar sincronização):**
   - Clique em **Gerar código de sincronização**.
   - Será exibido o **Código Visual Dinâmico** (fluxo óptico dinâmico e proprietário, legível exclusivamente pelo leitor integrado).
   - Você também tem o botão **Copiar código de sincronização** (ideal para copiar de um notebook e colar no outro).
4. **Receber (Aplicar sincronização):**
   - Na outra instância, vá em **Receber sincronização**.
   - Clique em **Abrir leitor da câmera** para escanear diretamente na outra tela, ou cole o código no campo de texto.
   - Digite sua **senha de administrador** para autorizar a sincronização.
   - Clique em **Confirmar e sincronizar dados**. O sistema criará um backup de segurança e aplicará os dados sincronizados.
