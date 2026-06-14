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
  EVOLUTION_API_URL: z.string().url().optional(),
  EVOLUTION_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  // Mercado Pago (Assinaturas/preapproval) — sem token o checkout opera em modo simulado
  MERCADOPAGO_ACCESS_TOKEN: z.string().optional(),
  // Domínio base do SaaS multi-tenant (wildcard): cada rede vive em <slug>.DOMINIO_BASE
  DOMINIO_BASE: z.string().default('zaieze.com'),
  // Esquema usado para montar as URLs de tenant (http em dev, https em prod)
  TENANT_SCHEME: z.enum(['http', 'https']).default('https'),
})

export const env = envSchema.parse(process.env)
