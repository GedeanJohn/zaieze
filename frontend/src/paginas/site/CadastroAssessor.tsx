import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, formataReal, mensagemDeErro } from '../../api'
import SeletorIdioma from '../../componentes/SeletorIdioma'
import CampoSenha from '../../componentes/CampoSenha'
import { useIdioma } from '../../lib/i18n'

interface ClausulaContrato { n: number; titulo: string; paragrafos: string[] }
interface ContratoMontado { titulo: string; qualificacao: string[]; clausulas: ClausulaContrato[] }
interface PromoInfo { valido: boolean; beneficio?: string }

export default function CadastroAssessor() {
  const { t } = useIdioma()
  const [params] = useSearchParams()
  const [precos, setPrecos] = useState<{ precoMensalBasico: number; precoMensalAvancado: number } | null>(null)
  const [dominio] = useState('zaieze.com')
  const [form, setForm] = useState<{ nome: string; slug: string; telefone: string; email: string; senha: string; plano: 'BASICO' | 'AVANCADO' }>(
    { nome: '', slug: '', telefone: '', email: '', senha: '', plano: params.get('plano') === 'AVANCADO' ? 'AVANCADO' : 'BASICO' },
  )
  const [slugStatus, setSlugStatus] = useState<'idle' | 'checando' | 'ok' | 'indisponivel'>('idle')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [aceiteContrato, setAceiteContrato] = useState(false)
  const [contrato, setContrato] = useState<ContratoMontado | null>(null)
  const [contratoAberto, setContratoAberto] = useState(false)
  // Pré-preenche o cupom pela URL (?cupom=) — permite compartilhar um link já com o cupom.
  const [cupom, setCupom] = useState((params.get('cupom') || '').toUpperCase())
  const [promo, setPromo] = useState<PromoInfo | null>(null)

  useEffect(() => {
    api.get('/assessores/plano').then(({ data }) => setPrecos(data)).catch(() => {})
    api.get('/assessores/contrato').then(({ data }) => setContrato(data)).catch(() => {})
  }, [])

  function onNome(v: string) {
    const sugestao = v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    setForm((f) => ({ ...f, nome: v, slug: f.slug || sugestao }))
  }

  useEffect(() => {
    const s = form.slug
    if (!s || s.length < 2) { setSlugStatus('idle'); return }
    setSlugStatus('checando')
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get('/assessores/slug-disponivel', { params: { slug: s } })
        setSlugStatus(data.disponivel ? 'ok' : 'indisponivel')
      } catch { setSlugStatus('idle') }
    }, 400)
    return () => clearTimeout(timer)
  }, [form.slug])

  // valida o código promocional (debounce)
  useEffect(() => {
    const c = cupom.trim()
    if (!c) { setPromo(null); return }
    const t2 = setTimeout(async () => {
      try {
        const { data } = await api.get('/assessores/codigo-promo', { params: { codigo: c } })
        setPromo(data)
      } catch { setPromo({ valido: false }) }
    }, 400)
    return () => clearTimeout(t2)
  }, [cupom])

  const podeEnviar = useMemo(
    () => form.nome && form.slug.length >= 2 && form.email && form.senha.length >= 6 && slugStatus !== 'indisponivel' && aceiteContrato,
    [form, slugStatus, aceiteContrato],
  )

  async function cadastrar(e: React.FormEvent) {
    e.preventDefault()
    setErro(''); setEnviando(true)
    try {
      const { data } = await api.post('/assessores/cadastro', {
        nome: form.nome, slug: form.slug.toLowerCase(), telefone: form.telefone || undefined,
        email: form.email, senha: form.senha, plano: form.plano, cupom: cupom.trim() || undefined, aceiteContrato: true,
      })
      if (data.simulado) window.location.href = `/sucesso?slug=${data.slug}&plano=${encodeURIComponent(t('assessorPlano.tituloPlano'))}&simulado=1`
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
        <Link to="/assessor-de-moda" className="voltar">← {t('comum.voltar')}</Link>
        <SeletorIdioma />
      </div>
      <div className="checkout-card">
        <div className="checkout-resumo">
          <h2>{t('assessorPlano.tituloPlano')}</h2>
          {precos != null && (
            <div className="preco">
              {formataReal(form.plano === 'BASICO' ? precos.precoMensalBasico : precos.precoMensalAvancado)}<span>/{t('unidade.mes')}</span>
            </div>
          )}
          <p>{t('assessorCadastro.resumoTexto')}</p>
        </div>

        <form className="checkout-form" onSubmit={cadastrar}>
          <h3>{t('assessorCadastro.tituloForm')}</h3>
          {erro && <div className="alerta">{erro}</div>}

          <div className="campo">
            <label>Plano</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {(['BASICO', 'AVANCADO'] as const).map((p) => (
                <button
                  key={p} type="button" onClick={() => setForm({ ...form, plano: p })}
                  style={{
                    textAlign: 'left', padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                    border: form.plano === p ? '2px solid #fff' : '1px solid rgba(255,255,255,0.25)',
                    background: form.plano === p ? 'rgba(255,255,255,0.08)' : 'transparent', color: '#fff',
                  }}
                >
                  <div style={{ fontWeight: 700 }}>{p === 'BASICO' ? 'Básico' : 'Avançado'}</div>
                  {precos != null && (
                    <div style={{ fontSize: 13, opacity: 0.85 }}>{formataReal(p === 'BASICO' ? precos.precoMensalBasico : precos.precoMensalAvancado)}/mês</div>
                  )}
                  <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                    {p === 'BASICO' ? 'Até 3 fotos por marca' : 'Até 10 fotos + 5 vídeos por marca'}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="campo">
            <label>{t('assessorCadastro.nomeLabel')}</label>
            <input value={form.nome} onChange={(e) => onNome(e.target.value)} required />
          </div>

          <div className="campo">
            <label>{t('assessorCadastro.slugLabel')}</label>
            <div className="slug-input">
              <input
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                placeholder="seunome"
                required
              />
              <span>.{dominio}</span>
            </div>
            {slugStatus === 'checando' && <small className="dica">{t('assessorCadastro.verificando')}</small>}
            {slugStatus === 'ok' && <small className="dica ok">✓ {form.slug}.{dominio} {t('assessorCadastro.disponivel')}</small>}
            {slugStatus === 'indisponivel' && <small className="dica erro">{t('assessorCadastro.indisponivel')}</small>}
          </div>

          <div className="campo">
            <label>{t('assessorCadastro.telefoneLabel')}</label>
            <input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} placeholder="5562999990011" inputMode="tel" />
          </div>
          <div className="campo">
            <label>{t('assessorCadastro.emailLabel')}</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </div>
          <div className="campo">
            <label>{t('assessorCadastro.senhaLabel')}</label>
            <CampoSenha value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} required />
          </div>

          <div className="campo">
            <label>{t('assessorCadastro.cupomLabel')}</label>
            <input value={cupom} onChange={(e) => setCupom(e.target.value.toUpperCase())} placeholder={t('assessorCadastro.cupomPlaceholder')} />
            {cupom.trim() && promo && (
              promo.valido
                ? <small className="dica ok">✓ {promo.beneficio}</small>
                : <small className="dica erro">{t('assessorCadastro.cupomInvalido')}</small>
            )}
          </div>

          <div className="campo">
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer', fontWeight: 400 }}>
              <input type="checkbox" checked={aceiteContrato} onChange={(e) => setAceiteContrato(e.target.checked)} style={{ width: 'auto', marginTop: 3 }} required />
              <span>
                {t('assessorCadastro.aceitePrefixo')}{' '}
                <a href="#" onClick={(e) => { e.preventDefault(); setContratoAberto(true) }} style={{ color: '#fff', textDecoration: 'underline' }}>
                  {t('assessorCadastro.aceiteLink')}
                </a>.
              </span>
            </label>
          </div>

          <button className="btn grande" style={{ width: '100%' }} disabled={!podeEnviar || enviando}>
            {enviando ? t('assessorCadastro.processando') : t('assessorCadastro.irPagamento')}
          </button>
          <small className="dica" style={{ textAlign: 'center', display: 'block' }}>{t('assessorCadastro.avisoRedirect')}</small>
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
              <button type="button" className="btn" onClick={() => { setAceiteContrato(true); setContratoAberto(false) }}>{t('assessorCadastro.aceiteBtn')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
