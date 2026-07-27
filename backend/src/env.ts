import { z } from 'zod'

// Carrega .env quando presente (dev); em produção as variáveis vêm do ambiente
try {
  process.loadEnvFile()
} catch {
  /* sem .env — usa variáveis do ambiente */
}

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(10),
  PORT: z.coerce.number().default(3050),
  HOST: z.string().default('0.0.0.0'),
  CORS_ORIGIN: z.string().default('http://localhost:5184'),
  // Integrações opcionais — quando ausentes, o sistema opera em modo simulado
  // WhatsApp Cloud API (oficial da Meta). As credenciais por marca ficam na Rede (Rede.wa*);
  // aqui só ficam os parâmetros globais. Sem credenciais na rede → envio em modo SIMULADO.
  META_API_VERSION: z.string().default('v21.0'),
  // Chave para criptografar o token permanente da WABA em repouso (AES-256-GCM).
  // Obrigatória para SALVAR um token; ausente → o /whatsapp/config recusa gravar token.
  WA_TOKEN_SECRET: z.string().optional(),
  // Meta Tech Provider / Embedded Signup — permite ao gestor conectar o WhatsApp em 1 clique
  // (sem digitar Phone Number ID/token manualmente). Requer app aprovado pela Meta como Tech
  // Provider (whatsapp_business_management + whatsapp_business_messaging em acesso avançado).
  // Ausentes → o botão "Conectar com Facebook" fica oculto; só o formulário manual funciona.
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_CONFIG_ID: z.string().optional(), // ID da configuração de Embedded Signup no App Dashboard
  // Verify token do webhook ÚNICO em nível de App (registrado 1x no App Dashboard da Meta) —
  // diferente do Rede.waVerifyToken (por marca), usado só no fluxo manual/webhook por tenant.
  META_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
  // Número OFICIAL da própria ZAIEZE (não o de cada marca) — usado só p/ mensagens de sistema
  // (ex.: senha provisória do "esqueci minha senha"), que não dependem da marca ter WABA própria.
  // Requer um template de autenticação aprovado 1x pela Meta. Ausente → cai no fluxo manual.
  ZAIEZE_WA_PHONE_NUMBER_ID: z.string().optional(),
  ZAIEZE_WA_TOKEN: z.string().optional(),
  ZAIEZE_WA_TEMPLATE_SENHA: z.string().default('senha_provisoria'),
  // Código de verificação do "Meus pedidos" (perfil público da vendedora) — mesmo número/token
  // da própria ZAIEZE acima, requer template de autenticação aprovado à parte pela Meta.
  ZAIEZE_WA_TEMPLATE_OTP: z.string().default('codigo_verificacao'),
  ANTHROPIC_API_KEY: z.string().optional(),
  // Mercado Pago (Assinaturas/preapproval) — sem token o checkout opera em modo simulado
  MERCADOPAGO_ACCESS_TOKEN: z.string().optional(),
  // Pasta onde os uploads (ex.: logo da marca) são gravados; servidos em /api/uploads
  UPLOAD_DIR: z.string().default('uploads'),
  // Pasta onde ficam as sessões do WhatsApp pessoal (Baileys, QR Code por vendedora) — uma
  // subpasta por usuarioId, persistida entre restarts (volume Docker em produção).
  WA_SESSIONS_DIR: z.string().default('wa-sessions'),
  // Cloudflare R2 (mídia do catálogo: fotos/vídeos). Ausentes → upload de mídia em modo simulado.
  R2_ACCOUNT_ID: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_PUBLIC_URL: z.string().url().optional(), // ex.: https://cdn.zaieze.com
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  // Provador virtual (módulo 13 — FASHN AI: foto try-on + image-to-video).
  // Ausente → modo simulado (usa a própria foto do produto; não gera vídeo; não gasta API).
  FASHN_API_KEY: z.string().optional(),
  FASHN_API_URL: z.string().url().default('https://api.fashn.ai/v1'),
  // Cota mensal de looks por rede no Elite (controle de custo). 0 = ilimitado.
  PROVADOR_COTA_MES: z.coerce.number().default(50),
  // Dias até o link público de envio da selfie expirar.
  PROVADOR_LINK_HORAS: z.coerce.number().default(48),
  // Dias de retenção das mídias do provador (foto/vídeo) antes do expurgo automático.
  PROVADOR_RETENCAO_DIAS: z.coerce.number().default(60),
  // Domínio base do SaaS multi-tenant (wildcard): cada rede vive em <slug>.DOMINIO_BASE
  DOMINIO_BASE: z.string().default('zaieze.com'),
  // Esquema usado para montar as URLs de tenant (http em dev, https em prod)
  TENANT_SCHEME: z.enum(['http', 'https']).default('https'),
})

export const env = envSchema.parse(process.env)
