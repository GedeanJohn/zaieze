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
  ANTHROPIC_API_KEY: z.string().optional(),
  // Mercado Pago (Assinaturas/preapproval) — sem token o checkout opera em modo simulado
  MERCADOPAGO_ACCESS_TOKEN: z.string().optional(),
  // Pasta onde os uploads (ex.: logo da marca) são gravados; servidos em /api/uploads
  UPLOAD_DIR: z.string().default('uploads'),
  // Cloudflare R2 (mídia do catálogo: fotos/vídeos). Ausentes → upload de mídia em modo simulado.
  R2_ACCOUNT_ID: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_PUBLIC_URL: z.string().url().optional(), // ex.: https://cdn.zaieze.com
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  // Domínio base do SaaS multi-tenant (wildcard): cada rede vive em <slug>.DOMINIO_BASE
  DOMINIO_BASE: z.string().default('zaieze.com'),
  // Esquema usado para montar as URLs de tenant (http em dev, https em prod)
  TENANT_SCHEME: z.enum(['http', 'https']).default('https'),
})

export const env = envSchema.parse(process.env)
