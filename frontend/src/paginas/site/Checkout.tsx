import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, formataReal, formataUsd, mensagemDeErro } from '../../api'
import { capturarRefAfiliado, refAfiliadoAtivo, capturarRefAssessor, refAssessorAtivo } from '../../lib/afiliado'
import SeletorIdioma from '../../componentes/SeletorIdioma'
import CampoSenha from '../../componentes/CampoSenha'
import { useIdioma } from '../../lib/i18n'

interface Clausula { n: number; titulo: string; paragrafos: string[] }
interface ContratoMontado { titulo: string; qualificacao: string[]; clausulas: Clausula[] }
interface SecaoDocumento { n: number; titulo: string; itens: (string | string[])[] }
interface DocumentoMontado { titulo: string; secoes: SecaoDocumento[] }

export default function Checkout() {
  const navigate = useNavigate()
  const { idioma, t } = useIdioma()
  const [cambio, setCambio] = useState<{ usdPorBrl: number | null }>({ usdPorBrl: null })

  const [form, setForm] = useState({ redeNome: '', slug: '', gestorNome: '', telefone: '', email: '', senha: '' })
  const [dominio, setDominio] = useState('zaieze.com')
  // Preço do assento de vendedora — só pra contextualizar a mensagem "grátis até ativar alguém".
  const [precoAssento, setPrecoAssento] = useState<number | null>(null)
  const [slugStatus, setSlugStatus] = useState<'idle' | 'checando' | 'ok' | 'indisponivel'>('idle')
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
      setDominio(data.dominioBase); setCambio(data.cambio ?? { usdPorBrl: null })
    }).catch(() => {})
    api.get('/vendedora-billing/preco').then(({ data }) => setPrecoAssento(data.preco)).catch(() => {})
    capturarRefAfiliado()
    capturarRefAssessor()
  }, [])

  useEffect(() => {
    api.get('/contrato/termos', { params: { idioma } }).then(({ data }) => setContrato(data.contrato)).catch(() => {})
    api.get('/privacidade/termos', { params: { idioma } }).then(({ data }) => setPrivacidade(data.privacidade)).catch(() => {})
    api.get('/termos-uso/termos', { params: { idioma } }).then(({ data }) => setTermosUso(data.termosUso)).catch(() => {})
  }, [idioma])

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

  const podeEnviar = useMemo(
    () => form.redeNome && form.slug.length >= 3 && form.gestorNome && form.telefone.length >= 8 && form.email && form.senha.length >= 6 && slugStatus !== 'indisponivel' && aceiteContrato && aceitePrivacidade && aceiteTermosUso,
    [form, slugStatus, aceiteContrato, aceitePrivacidade, aceiteTermosUso],
  )

  async function assinar(e: React.FormEvent) {
    e.preventDefault()
    setErro(''); setEnviando(true)
    try {
      const { data } = await api.post('/assinaturas/checkout', {
        ...form, slug: form.slug.toLowerCase(),
        refAfiliado: refAfiliadoAtivo(),
        refAssessor: refAssessorAtivo(),
        idioma,
      })
      navigate(`/sucesso?slug=${data.slug}`)
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
          <h2>Crie sua conta grátis</h2>
          <div className="preco">
            R$ 0<span>/mês</span>
          </div>
          <p>
            Cadastro da marca sem custo — lojas e coleções ilimitadas. Você só paga quando ativar uma conta de
            vendedora{precoAssento != null && (
              <> — {idioma !== 'pt' && cambio.usdPorBrl != null ? formataUsd(precoAssento * cambio.usdPorBrl) : formataReal(precoAssento)}/mês por vendedora, sem limite de quantidade</>
            )}.
          </p>
          {idioma !== 'pt' && cambio.usdPorBrl != null && (
            <div className="cambio-aprox">{t('cambio.aprox')}</div>
          )}
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
            {enviando ? 'Processando…' : 'Criar minha conta grátis'}
          </button>
          <small className="dica" style={{ textAlign: 'center', display: 'block' }}>
            Sem cartão de crédito. Você paga só quando cadastrar sua primeira vendedora.
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
