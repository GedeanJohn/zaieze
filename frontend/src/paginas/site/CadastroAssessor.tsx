import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, formataReal, mensagemDeErro } from '../../api'
import SeletorIdioma from '../../componentes/SeletorIdioma'
import { useIdioma } from '../../lib/i18n'

interface ClausulaContrato { n: number; titulo: string; paragrafos: string[] }
interface ContratoMontado { titulo: string; qualificacao: string[]; clausulas: ClausulaContrato[] }

export default function CadastroAssessor() {
  const { t } = useIdioma()
  const [preco, setPreco] = useState<number | null>(null)
  const [dominio] = useState('zaieze.com')
  const [form, setForm] = useState({ nome: '', slug: '', telefone: '', email: '', senha: '' })
  const [slugStatus, setSlugStatus] = useState<'idle' | 'checando' | 'ok' | 'indisponivel'>('idle')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [aceiteContrato, setAceiteContrato] = useState(false)
  const [contrato, setContrato] = useState<ContratoMontado | null>(null)
  const [contratoAberto, setContratoAberto] = useState(false)

  useEffect(() => {
    api.get('/assessores/plano').then(({ data }) => setPreco(data.precoMensal)).catch(() => {})
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
        email: form.email, senha: form.senha, aceiteContrato: true,
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
          {preco != null && <div className="preco">{formataReal(preco)}<span>/{t('unidade.mes')}</span></div>}
          <p>{t('assessorCadastro.resumoTexto')}</p>
        </div>

        <form className="checkout-form" onSubmit={cadastrar}>
          <h3>{t('assessorCadastro.tituloForm')}</h3>
          {erro && <div className="alerta">{erro}</div>}

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
            <input type="password" value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} required />
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
