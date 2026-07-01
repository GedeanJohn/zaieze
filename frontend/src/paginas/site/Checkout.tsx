import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api, formataReal, mensagemDeErro, type Plano } from '../../api'

const NOME: Record<Plano, string> = { START: 'Start', PRO: 'Pro', ELITE: 'Elite' }

interface PlanoInfo { plano: Plano; nome: string; preco: number }
interface PromoInfo { valido: boolean; beneficio?: string; tipo?: 'DIAS_GRATIS' | 'PERCENTUAL'; dias?: number | null; percentual?: string | null }

export default function Checkout() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const plano = (params.get('plano') as Plano) || 'PRO'

  const [form, setForm] = useState({ redeNome: '', slug: '', gestorNome: '', email: '', senha: '' })
  const [dominio, setDominio] = useState('zaieze.com')
  const [planos, setPlanos] = useState<PlanoInfo[]>([])
  const [slugStatus, setSlugStatus] = useState<'idle' | 'checando' | 'ok' | 'indisponivel'>('idle')
  // Pré-preenche o cupom pela URL (?cupom= ou ?codigo=) — permite compartilhar um link já com o cupom.
  const [codigoPromo, setCodigoPromo] = useState((params.get('cupom') || params.get('codigo') || '').toUpperCase())
  const [promo, setPromo] = useState<PromoInfo | null>(null)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    api.get('/assinaturas/planos').then(({ data }) => { setDominio(data.dominioBase); setPlanos(data.planos) }).catch(() => {})
  }, [])

  const info = planos.find((p) => p.plano === plano)
  const preco = info?.preco ?? 0
  const nome = info?.nome ?? NOME[plano]

  // valor exibido considerando o código promocional
  const precoComDesc = useMemo(() => {
    if (promo?.valido && promo.tipo === 'PERCENTUAL' && promo.percentual) {
      return Math.round(preco * (1 - Number(promo.percentual) / 100) * 100) / 100
    }
    return preco
  }, [promo, preco])

  function onNomeRede(v: string) {
    const sugestao = v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    setForm((f) => ({ ...f, redeNome: v, slug: f.slug || sugestao }))
  }

  useEffect(() => {
    const s = form.slug
    if (!s || s.length < 3) { setSlugStatus('idle'); return }
    setSlugStatus('checando')
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get('/assinaturas/slug-disponivel', { params: { slug: s } })
        setSlugStatus(data.disponivel ? 'ok' : 'indisponivel')
      } catch { setSlugStatus('idle') }
    }, 400)
    return () => clearTimeout(t)
  }, [form.slug])

  // valida o código promocional (debounce)
  useEffect(() => {
    const c = codigoPromo.trim()
    if (!c) { setPromo(null); return }
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get('/assinaturas/codigo-promo', { params: { codigo: c } })
        setPromo(data)
      } catch { setPromo({ valido: false }) }
    }, 400)
    return () => clearTimeout(t)
  }, [codigoPromo])

  const podeEnviar = useMemo(
    () => form.redeNome && form.slug.length >= 3 && form.gestorNome && form.email && form.senha.length >= 6 && slugStatus !== 'indisponivel',
    [form, slugStatus],
  )

  async function assinar(e: React.FormEvent) {
    e.preventDefault()
    setErro(''); setEnviando(true)
    try {
      const { data } = await api.post('/assinaturas/checkout', {
        plano, ...form, slug: form.slug.toLowerCase(),
        codigoPromo: codigoPromo.trim() || undefined,
      })
      if (data.simulado) navigate(`/sucesso?slug=${data.slug}&plano=${plano}&simulado=1`)
      else if (data.initPoint) window.location.href = data.initPoint
    } catch (err) {
      setErro(mensagemDeErro(err))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="site checkout-wrap">
      <Link to="/" className="voltar">← Voltar</Link>
      <div className="checkout-card">
        <div className="checkout-resumo">
          <h2>Plano {nome}</h2>
          <div className="preco">
            {promo?.valido && promo.tipo === 'PERCENTUAL'
              ? <><s style={{ opacity: .55, fontSize: '0.6em' }}>{formataReal(preco)}</s> {formataReal(precoComDesc)}<span>/mês</span></>
              : <>{formataReal(preco)}<span>/mês</span></>}
          </div>
          {promo?.valido && promo.tipo === 'DIAS_GRATIS' && (
            <p style={{ color: '#22c55e', fontWeight: 600 }}>🎁 {promo.dias} dias grátis — comece a pagar depois</p>
          )}
          <p>Lojas e vendedoras ilimitadas. Cobrança recorrente mensal via Mercado Pago. Cancele quando quiser.</p>
        </div>

        <form className="checkout-form" onSubmit={assinar}>
          <h3>Crie sua conta</h3>
          {erro && <div className="alerta">{erro}</div>}

          <div className="campo">
            <label>Nome da sua loja / marca*</label>
            <input value={form.redeNome} onChange={(e) => onNomeRede(e.target.value)} required />
          </div>

          <div className="campo">
            <label>Endereço do seu painel*</label>
            <div className="slug-input">
              <input
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                placeholder="sualoja"
                required
              />
              <span>.{dominio}</span>
            </div>
            {slugStatus === 'checando' && <small className="dica">Verificando…</small>}
            {slugStatus === 'ok' && <small className="dica ok">✓ {form.slug}.{dominio} está disponível</small>}
            {slugStatus === 'indisponivel' && <small className="dica erro">Endereço indisponível, escolha outro</small>}
          </div>

          <div className="campo">
            <label>Seu nome (gestor)*</label>
            <input value={form.gestorNome} onChange={(e) => setForm({ ...form, gestorNome: e.target.value })} required />
          </div>
          <div className="campo">
            <label>E-mail de acesso*</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </div>
          <div className="campo">
            <label>Senha (mín. 6 caracteres)*</label>
            <input type="password" value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} required />
          </div>

          <div className="campo">
            <label>Código promocional (opcional)</label>
            <input value={codigoPromo} onChange={(e) => setCodigoPromo(e.target.value.toUpperCase())} placeholder="Tem um cupom?" />
            {codigoPromo.trim() && promo && (
              promo.valido
                ? <small className="dica ok">✓ {promo.beneficio}</small>
                : <small className="dica erro">Código inválido ou expirado</small>
            )}
          </div>

          <button className="btn grande" style={{ width: '100%' }} disabled={!podeEnviar || enviando}>
            {enviando ? 'Processando…' : 'Ir para o pagamento'}
          </button>
          <small className="dica" style={{ textAlign: 'center', display: 'block' }}>
            Você será redirecionado ao Mercado Pago para concluir a assinatura.
          </small>
        </form>
      </div>
    </div>
  )
}
