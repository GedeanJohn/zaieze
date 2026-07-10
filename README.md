# ModaCRM AI

Plataforma SaaS multi-tenant de gestão de vendas, relacionamento (CRM) e estoque para lojas de moda, com IA aplicada a vendas e WhatsApp integrado por vendedora.

> Especificação completa: skill global `modacrm-ai` (`~/.claude/skills/modacrm-ai/especificacao.md`).

## Stack

- **Backend**: Node.js + TypeScript + Fastify + Prisma + PostgreSQL
- **Frontend**: React + Vite + TypeScript
- **Infra dev**: Docker Compose (PostgreSQL)

## Portas

| Serviço | Porta |
|---|---|
| API (Fastify) | 3050 |
| Frontend (Vite) | 5184 |
| PostgreSQL | 5443 |

## Subir em desenvolvimento

```bash
# 1. Banco
docker compose up -d db

# 2. Backend
cd backend
npm install
npx prisma migrate dev
npm run seed
npm run dev          # http://localhost:3050

# 3. Frontend
cd ../frontend
npm install
npm run dev          # http://localhost:5184
```

## Logins do seed

| Papel | E-mail | Senha |
|---|---|---|
| Super Admin (SaaS) | admin@modacrm.com.br | admin123 |
| Gestor da rede Luna Brand (ELITE, multi-lojas) | gestor@lunabrand.com.br | gestor123 |
| Gestor de estoque da rede (entradas de produção) | estoquista@lunabrand.com.br | estoque123 |
| Gerente — Loja Demo Moda | maria@lojademo.com.br | demo123 |
| Gerente — Loja Shopping Flamboyant | paula@lojashopping.com.br | demo123 |
| Vendedora — Demo Moda | camila@lojademo.com.br | demo123 |
| Vendedora — Demo Moda | ana@lojademo.com.br | demo123 |
| Vendedora — Loja Shopping | julia@lojashopping.com.br | demo123 |

## Fases de construção

- [x] **Fase 1 — Fundação**: monorepo, auth JWT multi-tenant, RBAC, CRUD de lojas/vendedoras/clientes/produtos com grade (cor × tamanho)
- [x] **Fase 2 — Vendas + Estoque**: PDV com baixa automática de estoque por SKU, cancelamento com devolução, movimentos de estoque, e dashboard hierárquico (gestor consolidado · gerente loja completa · vendedora individual) com faturamento, ticket médio, ranking de vendedoras, top produtos/clientes, metas e estoque crítico
- [x] **Fase 3 — CRM**: carteira por vendedora (isolamento no backend), segmentação automática recalculável (VIP/Frequente/Inativo/Novo/Atacado a partir do histórico real, job no boot + botão na UI), distribuição da carteira por segmento e ficha do cliente com histórico de compras e gatilho de recuperação de inativos
- [x] **Canal da venda (Balcão × Online/WhatsApp)**: cada venda é marcada como Balcão ou **Online** (= atendimento pelo WhatsApp, o que o lojista chama de "venda online"); o registro de venda já abre em Online. O dashboard recorta **venda online** em todas as visões — consolidado da rede, por loja, **por vendedora** (R$ e % online) e no painel da própria vendedora. É a métrica central do produto.
- [x] **Forma de recebimento**: etiqueta na venda (Dinheiro/Pix/Débito/Crédito/Outro) — só categorização, sem liquidação financeira; análise por vendedora no dashboard. Baixa de estoque da venda tornada atômica (impede duas vendedoras venderem a mesma peça)
- [x] **Produto (moda)**: referência do modelo (lançada pelo gestor de estoque, com sugestão automática) → SKU derivado (`referência-cor-tamanho`, preserva hífens); gênero; código de barras (EAN) por variação; campos opcionais (composição, modelagem, NCM, fornecedor, peso, faixa etária) em bloco recolhível
- [x] **Estoque CENTRAL da fábrica/marca**: coleções, produtos e taxonomias vivem no nível da **rede** (não por loja); o estoque é **único** por SKU. O gestor de estoque cadastra a coleção uma vez e **distribui** para as lojas (permissão de venda, M2M `ColecaoLoja`). Entrada de produção, ajuste/contagem e extrato de movimentos operam sobre o estoque central; **toda venda (de qualquer loja/vendedora) baixa do mesmo estoque**.
- [x] **Gestão de gestores de estoque**: o Gestor cria/edita/ativa gestores de estoque da rede pela UI (tela própria, papel de nível de rede)
- [x] **Dashboard de estoque**: estoque central da marca — valor em estoque (custo e a varejo), peças, SKUs, estoque crítico e parados/encalhados (60 dias); base para o Estoque Inteligente
- [x] **Fase 4 — WhatsApp**: instância por vendedora (Evolution API), disparos personalizados por segmento com geração de mensagem por IA (Claude, com fallback de template), réguas de recuperação de inativos (30/60/90 dias), webhook de entrada roteando para a carteira, e log de conversa por cliente — tudo respeitando consentimento LGPD; **modo simulado** quando as integrações (Evolution/Anthropic) não estão configuradas
- [x] **Fase 5 — IA / Estoque Inteligente / Radar**: campeões de venda (30d) e previsão de ruptura no estoque; **Radar de Oportunidades** (★) que cruza estoque encalhado (sem venda há 60 dias) com o perfil dos clientes (quem já comprou a categoria) e dispara a campanha em 1 clique — reaproveitando o motor de WhatsApp da Fase 4 (LGPD + roteamento por carteira)
- [x] **Fase 6 — Comissão + Gamificação**: comissão automática com regras encadeadas (produto › categoria › marca › padrão) + bônus ao bater a meta; ranking gamificado das vendedoras (pódio + progresso de meta + comissão estimada); e mural de novidades (marca/gerência publica, equipe acompanha)
- [~] **Fase 7 — Expansão**: **Provador Virtual (FASHN AI)** — o cliente envia a **própria selfie** por **link público com token** (consentimento LGPD; EXIF descartado e selfie **expurgada assim que a foto é gerada**) e a **FASHN** gera a **foto (try-on) e o vídeo (peça em movimento)** — mesmo fornecedor p/ foto e vídeo (1 chave, 1 DPA). Vendido como **add-on à parte de qualquer plano** (não está em nenhum tier START/PRO/ELITE), com **assinatura recorrente própria no Mercado Pago** (`modules/addons`: preço editável no Painel do Admin, checkout/cancelamento/reativação self-service, mesmo webhook do billing principal despachando por `mpPreapprovalId`). **Backend do provador pronto em modo simulado** (`modules/provador`: fila no Postgres `LookProvador` + worker poller, gate por assinatura do add-on, cota mensal por rede, expurgo diário); sem `FASHN_API_KEY` o look usa a própria foto do produto. **Frontend (painel `/provador` + página pública `/look/:token`) ainda no roadmap.** Também: Sistema de Atacado (sacoleiras/revendedores: clientes ATACADO + giro do atacado). **Portal do Cliente: fora do escopo atual** — o produto é B2B (o lojista organiza as vendas pelo WhatsApp; nenhuma superfície toca o consumidor final). O schema já tem campos **dormentes** reservados para o futuro (`Cliente.senhaHash`/`saldoCashback`, `Loja.cashbackPercent`, `Venda.cashbackGerado`), sem endpoints nem UI.
- [~] **Fase 8 — Billing SaaS (multi-tenant wildcard)**: planos diferenciados **só por funcionalidade** (lojas e vendedoras **ilimitadas** em todos); landing comercial pública (`www.zaieze.com`), checkout que **provisiona o tenant** (Rede + GESTOR + Assinatura) e cobrança recorrente via **Mercado Pago Assinaturas** (preapproval) com **modo simulado** sem credenciais; cada assinante acessa em `<slug>.zaieze.com` (login isolado por subdomínio). Add-ons (ex.: Provador Virtual) têm recorrência própria, independente do plano — ver Fase 7. Falta: tela de gestão da assinatura no painel e consulta de status real no webhook.
- [ ] **WhatsApp oficial (Meta Cloud API)** — migração do Evolution para a API oficial da Meta (números/WABA por tenant, templates HSM, janela de 24h, webhook oficial). Falta o frontend do Provador Virtual (painel `/provador` + galeria e a página pública `/look/:token` de consentimento/upload da selfie) e o disparo do link da selfie pelo canal de WhatsApp — a migration Prisma do `LookProvador` ainda não foi aplicada em produção.
- [ ] Fase 9 — Instagram + Meta Ads

## Planos (diferenciação por funcionalidade)

Lojas e vendedoras **ilimitadas em todos os planos**. Matriz central em `backend/src/plugins/planos.ts`:

| Plano | Preço | Desbloqueia |
|---|---|---|
| **Start** | R$ 97/mês | Operação completa (vendas, produtos, estoque, clientes, dashboard), **WhatsApp** e **operação em rede** (várias lojas vendendo do estoque central da marca) |
| **Pro** | R$ 297/mês | + Carteira inteligente (segmentação), comissão/ranking/mural e estoque inteligente |
| **Elite** | R$ 697/mês | + Radar de Oportunidades, Provador virtual, Atacado, IA avançada e Portal do Cliente |

## SaaS multi-tenant por wildcard

- `www.zaieze.com` / `zaieze.com` → **landing comercial** (3 planos, checkout, "Entrar").
- `<slug>.zaieze.com` → **CRM do tenant**; o `<slug>` resolve a `Rede` (campo `slug`, único). Login validado contra o subdomínio.
- **Provisionamento**: `POST /api/assinaturas/checkout` cria Rede + conta GESTOR + Assinatura. Modo simulado ativa na hora; com Mercado Pago, o tenant é liberado no webhook de pagamento aprovado.
- **Deploy**: apontar DNS wildcard `*.zaieze.com` para o app e configurar TLS curinga; servir o mesmo SPA para todos os hosts (o frontend decide landing × tenant pelo hostname).

### Acessar um tenant em desenvolvimento

O frontend detecta o tenant pelo subdomínio. Em dev, use uma destas opções:

- `http://<slug>.localhost:5184` ou `http://<slug>.lvh.me:5184` (resolvem para 127.0.0.1); ou
- `http://localhost:5184/?tenant=<slug>` (atalho via querystring).

`http://localhost:5184` sem subdomínio mostra a **landing**.
