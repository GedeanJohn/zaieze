# Deploy do ZAIEZE — AWS Lightsail (Docker Compose)

Arquitetura: **uma instância Lightsail** rodando 3 containers — `db` (PostgreSQL), `api` (Fastify) e `web` (nginx servindo o SPA, fazendo proxy `/api` e terminando o TLS). Multi-tenant por **wildcard**: a landing em `zaieze.com` e cada cliente em `<slug>.zaieze.com` — tudo no mesmo SPA, resolvido pelo host.

## 1. Instância

- **Plano recomendado:** 2 GB RAM · 2 vCPU · 60 GB SSD (~US$12/mês). 1 GB só se for buildar fora do servidor.
- **SO:** Ubuntu 22.04 LTS.
- Anexe um **IP estático** (Lightsail → Networking → Create static IP).
- **Firewall (Lightsail → Networking):** libere 22 (SSH), 80 (HTTP) e 443 (HTTPS).

## 2. DNS (wildcard)

Na zona DNS do domínio (Lightsail DNS, Route 53, Registro.br etc.), apontando para o IP estático:

| Tipo | Nome | Valor |
|---|---|---|
| A | `@` (zaieze.com) | IP estático |
| A | `*` (curinga) | IP estático |
| A | `www` | IP estático |

## 3. Docker na instância

```bash
sudo apt update && sudo apt install -y docker.io docker-compose-plugin git
sudo usermod -aG docker $USER && newgrp docker
```

## 4. Certificado TLS curinga (Let's Encrypt, DNS-01)

Wildcard **exige** validação DNS-01 (não HTTP). Emita **antes** de subir os containers:

```bash
sudo apt install -y certbot
sudo certbot certonly --manual --preferred-challenges dns \
  -d zaieze.com -d '*.zaieze.com'
# o certbot mostra um registro TXT (_acme-challenge) → crie-o na zona DNS → continue
```

Os certificados ficam em `/etc/letsencrypt/live/zaieze.com/` (montados no container `web`).

> **Renovação:** o modo `--manual` não renova sozinho. Para automatizar, use o plugin do seu DNS
> (ex.: `certbot-dns-route53` se o DNS estiver na Route 53) e um cron. Após renovar, recarregue o nginx:
> `docker compose -f docker-compose.prod.yml exec web nginx -s reload`.

## 5. Código + variáveis

```bash
git clone <url-do-repo> zaieze && cd zaieze
cp .env.production.example .env
nano .env   # defina senhas fortes, JWT_SECRET, MERCADOPAGO_ACCESS_TOKEN
```

Gere segredos fortes:
```bash
openssl rand -base64 32   # use para JWT_SECRET e POSTGRES_PASSWORD
```
Lembre de manter `POSTGRES_PASSWORD` igual na `DATABASE_URL`.

## 6. Subir

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

O container `api` roda `prisma migrate deploy` automaticamente na subida (cria o schema).
Acesse **https://zaieze.com** (landing) e finalize um plano para criar o primeiro tenant em `<slug>.zaieze.com`.

## 7. Mercado Pago

1. Painel **Mercado Pago → Suas integrações → Criar aplicação** (modelo: Assinaturas/checkout).
2. Copie o **Access Token de produção** (`APP_USR-...`) e coloque em `MERCADOPAGO_ACCESS_TOKEN` no `.env`.
3. Configure a **URL de notificações (webhook)** da aplicação para:
   `https://zaieze.com/api/assinaturas/webhook`  (evento: *Assinaturas / preapproval*).
4. `docker compose -f docker-compose.prod.yml up -d` para recarregar o `.env`.

Sem o token, o checkout opera em **modo simulado** (provisiona o tenant na hora, sem cobrar). Com o token,
o tenant é liberado quando o webhook confirma o pagamento — e o backend **consulta o status real** no MP
antes de ativar (não confia cegamente na notificação).

## 8. Atualizações

```bash
cd zaieze && git pull
docker compose -f docker-compose.prod.yml up -d --build
```

## 9. Backup do banco

```bash
docker compose -f docker-compose.prod.yml exec db \
  pg_dump -U zaieze zaieze | gzip > backup-$(date +%F).sql.gz
```
Agende em cron e leve os arquivos para fora da instância (ex.: bucket S3/Lightsail).

## 10. (Opcional) Criar um super admin do SaaS

O modelo é self-service (tenants nascem pelo checkout), mas se quiser um operador `SUPER_ADMIN`:

```bash
# gere o hash da senha dentro do container api
docker compose -f docker-compose.prod.yml exec api \
  node -e "console.log(require('bcryptjs').hashSync('SUA_SENHA',10))"

# insira no banco (troque o hash):
docker compose -f docker-compose.prod.yml exec db psql -U zaieze -d zaieze -c \
  "INSERT INTO usuarios (id,nome,email,\"senhaHash\",role,ativo,\"createdAt\",\"updatedAt\")
   VALUES (gen_random_uuid(),'Admin','admin@zaieze.com','HASH_AQUI','SUPER_ADMIN',true,now(),now());"
```

Login do super admin: use qualquer endereço de tenant (ele ignora o isolamento por subdomínio).
