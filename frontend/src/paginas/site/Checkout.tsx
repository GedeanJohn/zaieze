import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api, formataReal, formataUsd, mensagemDeErro, type Plano } from '../../api'
import { capturarRefAfiliado, refAfiliadoAtivo, capturarRefAssessor, refAssessorAtivo } from '../../lib/afiliado'
import SeletorPeriodicidade, { type Periodicidade } from '../../componentes/SeletorPeriodicidade'
import SeletorIdioma from '../../componentes/SeletorIdioma'
import CampoSenha from '../../componentes/CampoSenha'
import { useIdioma } from '../../lib/i18n'

const NOME: Record<Plano, string> = { START: 'Start', PRO: 'Pro', ELITE: 'Elite' }

interface PlanoInfo { plano: Plano; nome: string; preco: number; precoAnual: number }
interface PromoInfo { valido: boolean; beneficio?: string; tipo?: 'DIAS_GRATIS' | 'PERCENTUAL'; dias?: number | null; percentual?: string | null; plano?: Plano | null }
interface Clausula { n: number; titulo: string; paragrafos: string[] }
interface ContratoMontado { titulo: string; qualificacao: string[]; clausulas: Clausula[] }
interface SecaoDocumento { n: number; titulo: string; itens: (string | string[])[] }
interface DocumentoMontado { titulo: string; secoes: SecaoDocumento[] }

export default function Checkout() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  // Plano é estado: um cupom com plano definido troca/trava o plano (link fica só ?cupom=).
  const [plano, setPlano] = useState<Plano>((params.get('plano') as Plano) || 'PRO')
  const [periodicidade, setPeriodicidade] = useState<Periodicidade>((params.get('periodicidade') as Periodicidade) || 'MENSAL')
  const { idioma, t } = useIdioma()
  const [cambio, setCambio] = useState<{ usdPorBrl: number | null }>({ usdPorBrl: null })

  const [form, setForm] = useState({ redeNome: '', slug: '', gestorNome: '', telefone: '', email: '', senha: '' })
  const [dominio, setDominio] = useState('zaieze.com')
  const [planos, setPlanos] = useState<PlanoInfo[]>([])
  const [descontoAnual, setDescontoAnual] = useState(0)
  const [slugStatus, setSlugStatus] = useState<'idle' | 'checando' | 'ok' | 'indisponivel'>('idle')
  // Pré-preenche o cupom pela URL (?cupom= ou ?codigo=) — permite compartilhar um link já com o cupom.
  const [codigoPromo, setCodigoPromo] = useState((params.get('cupom') || params.get('codigo') || '').toUpperCase())
  const [promo, setPromo] = useState<PromoInfo | null>(null)
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [aceiteContrato, setAceiteContrato] = useState(false)
  const [contrato, setContrato] = useState<ContratoMontado | null>(null)
  const [contratoAberto, setContratoAberto] = useState(false)
  // Política de Privacidade e Termos de Uso: aceite explícito e individual, cada um com seu
  // próprio checkbox e modal de leitura — independente do aceite do Contrato acima.
  const [aceitePrivacidade, setAceitePrivacidade] = useState(false)
  const [privacidade, setPrivacidade] = useState<DocumentoMontado | null>(null)
  const [privacidadeAberta, setPrivacidadeAberta] = useState(false)
  const [aceiteTermosUso, setAceiteTermosUso] = useState(false)
  const [termosUso, setTermosUso] = useState<DocumentoMontado | null>(null)
  const [termosUsoAberto, setTermosUsoAberto] = useState(false)

  useEffect(() => {
    api.get('/assinaturas/planos').then(({ data }) => {
      setDominio(data.dominioBase); setPlanos(data.planos); setDescontoAnual(data.percentualDescontoAnual ?? 0)
      setCambio(data.cambio ?? { usdPorBrl: null })
    }).catch(() => {})
    capturarRefAfiliado()
    capturarRefAssessor()
  }, [])

  useEffect(() => {
    api.get('/contrato/termos', { params: { idioma } }).then(({ data }) => setContrato(data.contrato)).catch(() => {})
    api.get('/privacidade/termos', { params: { idioma } }).then(({ data }) => setPrivacidade(data.privacidade)).catch(() => {})
    api.get('/termos-uso/termos', { params: { idioma } }).then(({ data }) => setTermosUso(data.termosUso)).catch(() => {})
  }, [idioma])

  const info = planos.find((p) => p.plano === plano)
  const preco = periodicidade === 'ANUAL' ? (info?.precoAnual ?? 0) : (info?.preco ?? 0)
  const nome = info?.nome ?? NOME[plano]

  // valor exibido considerando o código promocional (aplicado sobre o preço mensal ou anual)
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
        if (data.valido && data.plano) setPlano(data.plano) // cupom fixa o plano da oferta
      } catch { setPromo({ valido: false }) }
    }, 400)
    return () => clearTimeout(t)
  }, [codigoPromo])

  const podeEnviar = useMemo(
    () => form.redeNome && form.slug.length >= 3 && form.gestorNome && form.telefone.length >= 8 && form.email && form.senha.length >= 6 && slugStatus !== 'indisponivel' && aceiteContrato && aceitePrivacidade && aceiteTermosUso,
    [form, slugStatus, aceiteContrato, aceitePrivacidade, aceiteTermosUso],
  )

  async function assinar(e: React.FormEvent) {
    e.preventDefault()
    setErro(''); setEnviando(true)
    try {
      const { data } = await api.post('/assinaturas/checkout', {
        plano, ...form, slug: form.slug.toLowerCase(),
        codigoPromo: codigoPromo.trim() || undefined,
        refAfiliado: refAfiliadoAtivo(),
        refAssessor: refAssessorAtivo(),
        periodicidade,
        idioma,
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link to="/" className="voltar">← Voltar</Link>
        <SeletorIdioma />
      </div>
      <div className="checkout-card">
        <div className="checkout-resumo">
          <h2>Plano {nome}</h2>
          <div style={{ marginBottom: 12 }}>
            <SeletorPeriodicidade valor={periodicidade} onChange={setPeriodicidade} percentualDesconto={descontoAnual} />
          </div>
          <div className="preco">
            {(() => {
              const emUsd = idioma !== 'pt' && cambio.usdPorBrl != null
              const formata = (v: number) => emUsd ? formataUsd(v * cambio.usdPorBrl!) : formataReal(v)
              return promo?.valido && promo.tipo === 'PERCENTUAL'
                ? <><s style={{ opacity: .55, fontSize: '0.6em' }}>{formata(preco)}</s> {formata(precoComDesc)}<span>/{periodicidade === 'ANUAL' ? t('unidade.ano') : t('unidade.mes')}</span></>
                : <>{formata(preco)}<span>/{periodicidade === 'ANUAL' ? t('unidade.ano') : t('unidade.mes')}</span></>
            })()}
          </div>
          {idioma !== 'pt' && cambio.usdPorBrl != null && (
            <div className="cambio-aprox">{t('cambio.aprox')}</div>
          )}
          {periodicidade === 'ANUAL' && (
            <p style={{ fontSize: 13, color: '#666', marginTop: -8 }}>
              {t('planos.equivaleMes')} {idioma !== 'pt' && cambio.usdPorBrl != null ? formataUsd((precoComDesc / 12) * cambio.usdPorBrl) : formataReal(precoComDesc / 12)}/{t('unidade.mes')}
            </p>
          )}
          {promo?.valido && promo.tipo === 'DIAS_GRATIS' && (
            <p style={{ color: '#22c55e', fontWeight: 600 }}>🎁 {promo.dias} dias grátis — comece a pagar depois</p>
          )}
          <p>Lojas e vendedoras ilimitadas. Cobrança recorrente {periodicidade === 'ANUAL' ? 'anual' : 'mensal'} via Mercado Pago. Cancele quando quiser.</p>
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
            <label>Seu WhatsApp (com DDD)*</label>
            <input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} placeholder="5562999990011" inputMode="tel" required />
            <small className="dica">É pra onde mandamos a senha, caso você a esqueça.</small>
          </div>
          <div className="campo">
            <label>E-mail de acesso*</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </div>
          <div className="campo">
            <label>Senha (mín. 6 caracteres)*</label>
            <CampoSenha value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} required />
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

          <div className="campo">
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer', fontWeight: 400 }}>
              <input type="checkbox" checked={aceiteContrato} onChange={(e) => setAceiteContrato(e.target.checked)} style={{ width: 'auto', marginTop: 3 }} required />
              <span>
                Li e aceito o{' '}
                <a href="#" onClick={(e) => { e.preventDefault(); setContratoAberto(true) }} style={{ color: '#fff', textDecoration: 'underline' }}>
                  Contrato de Licença de Uso e Prestação de Serviços
                </a>.
              </span>
            </label>
          </div>

          <div className="campo">
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer', fontWeight: 400 }}>
              <input type="checkbox" checked={aceitePrivacidade} onChange={(e) => setAceitePrivacidade(e.target.checked)} style={{ width: 'auto', marginTop: 3 }} required />
              <span>
                Li e aceito a{' '}
                <a href="#" onClick={(e) => { e.preventDefault(); setPrivacidadeAberta(true) }} style={{ color: '#fff', textDecoration: 'underline' }}>
                  Política de Privacidade
                </a>.
              </span>
            </label>
          </div>

          <div className="campo">
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer', fontWeight: 400 }}>
              <input type="checkbox" checked={aceiteTermosUso} onChange={(e) => setAceiteTermosUso(e.target.checked)} style={{ width: 'auto', marginTop: 3 }} required />
              <span>
                Li e aceito os{' '}
                <a href="#" onClick={(e) => { e.preventDefault(); setTermosUsoAberto(true) }} style={{ color: '#fff', textDecoration: 'underline' }}>
                  Termos de Uso e Responsabilidade
                </a>.
              </span>
            </label>
          </div>

          <button className="btn grande" style={{ width: '100%' }} disabled={!podeEnviar || enviando}>
            {enviando ? 'Processando…' : 'Ir para o pagamento'}
          </button>
          <small className="dica" style={{ textAlign: 'center', display: 'block' }}>
            Você será redirecionado ao Mercado Pago para concluir a assinatura.
          </small>
        </form>
      </div>

      {contratoAberto && contrato && (
        <div className="modal-fundo" onClick={() => setContratoAberto(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(720px, 94vw)' }}>
            <h2>{contrato.titulo}</h2>
            <div style={{ maxHeight: '55vh', overflowY: 'auto', lineHeight: 1.65, fontSize: 14 }}>
              {contrato.qualificacao.map((p, i) => (
                <p key={`q${i}`} style={{ textAlign: 'justify' }}>{p}</p>
              ))}
              {contrato.clausulas.map((cl) => (
                <div key={cl.n} style={{ marginTop: 14 }}>
                  <h3 style={{ margin: '0 0 4px', fontSize: 15 }}>CLÁUSULA {cl.n}ª — {cl.titulo}</h3>
                  {cl.paragrafos.map((p, i) => (
                    <p key={i} style={{ textAlign: 'justify', margin: '4px 0' }}>
                      <span style={{ color: 'var(--ink-soft)' }}>{cl.n}.{i + 1}.</span> {p}
                    </p>
                  ))}
                </div>
              ))}
            </div>
            <div className="acoes">
              <button type="button" className="btn" onClick={() => { setAceiteContrato(true); setContratoAberto(false) }}>Li e aceito</button>
            </div>
          </div>
        </div>
      )}

      {privacidadeAberta && privacidade && (
        <div className="modal-fundo" onClick={() => setPrivacidadeAberta(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(720px, 94vw)' }}>
            <h2>{privacidade.titulo}</h2>
            <div style={{ maxHeight: '55vh', overflowY: 'auto', lineHeight: 1.65, fontSize: 14 }}>
              {privacidade.secoes.map((sec) => (
                <div key={sec.n} style={{ marginTop: 14 }}>
                  <h3 style={{ margin: '0 0 4px', fontSize: 15 }}>{sec.n}. {sec.titulo}</h3>
                  {sec.itens.map((item, i) => (
                    Array.isArray(item)
                      ? <ul key={i} style={{ margin: '4px 0 8px 18px' }}>{item.map((li, j) => <li key={j} style={{ margin: '2px 0' }}>{li}</li>)}</ul>
                      : <p key={i} style={{ textAlign: 'justify', margin: '4px 0' }}>{item}</p>
                  ))}
                </div>
              ))}
            </div>
            <div className="acoes">
              <button type="button" className="btn" onClick={() => { setAceitePrivacidade(true); setPrivacidadeAberta(false) }}>Li e aceito</button>
            </div>
          </div>
        </div>
      )}

      {termosUsoAberto && termosUso && (
        <div className="modal-fundo" onClick={() => setTermosUsoAberto(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(720px, 94vw)' }}>
            <h2>{termosUso.titulo}</h2>
            <div style={{ maxHeight: '55vh', overflowY: 'auto', lineHeight: 1.65, fontSize: 14 }}>
              {termosUso.secoes.map((sec) => (
                <div key={sec.n} style={{ marginTop: 14 }}>
                  <h3 style={{ margin: '0 0 4px', fontSize: 15 }}>{sec.n}. {sec.titulo}</h3>
                  {sec.itens.map((item, i) => (
                    Array.isArray(item)
                      ? <ul key={i} style={{ margin: '4px 0 8px 18px' }}>{item.map((li, j) => <li key={j} style={{ margin: '2px 0' }}>{li}</li>)}</ul>
                      : <p key={i} style={{ textAlign: 'justify', margin: '4px 0' }}>{item}</p>
                  ))}
                </div>
              ))}
            </div>
            <div className="acoes">
              <button type="button" className="btn" onClick={() => { setAceiteTermosUso(true); setTermosUsoAberto(false) }}>Li e aceito</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
