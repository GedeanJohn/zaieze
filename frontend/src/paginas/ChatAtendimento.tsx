import { useEffect, useState } from 'react'
import { api, formataReal, mensagemDeErro } from '../api'
import { useToast } from '../componentes/Toast'
import { useIdioma } from '../lib/i18n'

interface Assinatura {
  id: string
  status: 'PENDENTE' | 'ATIVA' | 'CANCELADA'
  valor: number
  simulada: boolean
  cicloFimEm: string | null
  cancelamentoSolicitadoEm: string | null
  vendedoraId: string | null
  vendedoraNome: string | null
}
interface Vendedora { id: string; nome: string }

interface PerguntaQualificacao { campo: 'peca' | 'tamanho' | 'faixaPreco'; pergunta: string; opcional?: boolean }
interface Roteiro {
  versao: number
  saudacao: { tom: 'descontraido' | 'neutro' | 'sobrio'; mensagem: string }
  saudacaoFallback: string
  perguntasQualificacao: PerguntaQualificacao[]
  palavrasChaveSegmento: string[]
  gatilhosHandoffDireto: string[]
  mensagemConclusao: string
  mensagemHandoffHumano: string
}

const fmtData = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—')

export default function ChatAtendimento() {
  const { t } = useIdioma()
  const [assinaturas, setAssinaturas] = useState<Assinatura[] | null>(null)
  const [vendedoras, setVendedoras] = useState<Vendedora[]>([])
  const [preco, setPreco] = useState<number | null>(null)
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const avisar = useToast()

  // Roteiro (saudação, perguntas, mensagens) — editável pelo gestor.
  const [roteiro, setRoteiro] = useState<Roteiro | null>(null)
  const [personalizado, setPersonalizado] = useState(false)
  const [salvandoRoteiro, setSalvandoRoteiro] = useState(false)

  function carregar() {
    api.get('/chat-atendimento/minhas').then(({ data }) => setAssinaturas(data.assinaturas)).catch((e) => setErro(mensagemDeErro(e)))
    api.get('/chat-atendimento/vendedoras').then(({ data }) => setVendedoras(data.vendedoras)).catch(() => {})
    api.get('/chat-atendimento/preco').then(({ data }) => setPreco(data.preco)).catch(() => {})
    api.get('/chat-atendimento/roteiro').then(({ data }) => { setRoteiro(data.roteiro); setPersonalizado(data.personalizado) }).catch(() => {})
  }
  useEffect(() => { carregar() }, [])

  async function salvarRoteiro() {
    if (!roteiro) return
    setErro(''); setSalvandoRoteiro(true)
    try {
      await api.put('/chat-atendimento/roteiro', roteiro)
      setPersonalizado(true)
      avisar(t('chatAtendimento.roteiroSalvo'))
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setSalvandoRoteiro(false)
    }
  }

  async function restaurarRoteiro() {
    if (!window.confirm(t('chatAtendimento.confirmRestaurar'))) return
    setErro(''); setSalvandoRoteiro(true)
    try {
      await api.post('/chat-atendimento/roteiro/resetar', {})
      avisar(t('chatAtendimento.roteiroRestaurado'))
      carregar()
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setSalvandoRoteiro(false)
    }
  }

  async function contratar() {
    setErro(''); setOcupado(true)
    try {
      const { data } = await api.post('/chat-atendimento/checkout', {})
      if (data.initPoint) { window.location.href = data.initPoint; return }
      avisar(data.mensagem ?? t('chatAtendimento.ativadoMsg'))
      carregar()
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setOcupado(false)
    }
  }

  async function atribuir(assinaturaId: string, vendedoraId: string) {
    setErro(''); setOcupado(true)
    try {
      await api.post(`/chat-atendimento/${assinaturaId}/atribuir`, { vendedoraId: vendedoraId || null })
      carregar()
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setOcupado(false)
    }
  }

  async function cancelar(assinaturaId: string) {
    if (!window.confirm(t('chatAtendimento.confirmCancelar'))) return
    setErro(''); setOcupado(true)
    try {
      const { data } = await api.post(`/chat-atendimento/${assinaturaId}/cancelar`, {})
      avisar(`${t('chatAtendimento.cancelamentoAgendado')} ${fmtData(data.acessoAte)}`)
      carregar()
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setOcupado(false)
    }
  }

  async function reativar(assinaturaId: string) {
    setErro(''); setOcupado(true)
    try {
      await api.post(`/chat-atendimento/${assinaturaId}/reativar`, {})
      avisar(t('chatAtendimento.reativadoMsg'))
      carregar()
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setOcupado(false)
    }
  }

  if (!assinaturas) return <div className="cartao">{t('chatAtendimento.carregando')}</div>
  const lista = assinaturas

  // Vendedoras já atribuídas em OUTRA assinatura ativa/pendente ficam fora das opções (evita duplicidade).
  function vendedorasDisponiveisPara(atual: Assinatura) {
    const ocupadas = new Set(
      lista.filter((a) => a.id !== atual.id && a.status !== 'CANCELADA' && a.vendedoraId).map((a) => a.vendedoraId),
    )
    return vendedoras.filter((v) => !ocupadas.has(v.id) || v.id === atual.vendedoraId)
  }

  return (
    <>
      <header>
        <h1>{t('chatAtendimento.titulo')}</h1>
      </header>

      {erro && <div className="cartao alerta">{erro}</div>}

      <div className="cartao">
        <p style={{ marginTop: 0 }}>{t('chatAtendimento.descricao')}</p>
        <ul style={{ paddingLeft: 18, color: 'var(--ink-soft)', fontSize: 14 }}>
          <li>{t('chatAtendimento.item1')}</li>
          <li>{t('chatAtendimento.item2')}</li>
          <li>{t('chatAtendimento.item3')}</li>
        </ul>
        <div className="preco" style={{ margin: '10px 0' }}>
          {formataReal(preco ?? 39)}<span>/{t('unidade.mes')} {t('chatAtendimento.porVendedora')}</span>
        </div>
        <button className="btn" onClick={contratar} disabled={ocupado}>
          {ocupado ? t('chatAtendimento.processando') : t('chatAtendimento.comprarNova')}
        </button>
      </div>

      {assinaturas.length === 0 && (
        <div className="cartao" style={{ color: 'var(--ink-soft)' }}>{t('chatAtendimento.nenhumaAssinatura')}</div>
      )}

      {assinaturas.map((a) => {
        const pendenteCancelamento = a.status === 'ATIVA' && !!a.cancelamentoSolicitadoEm
        return (
          <div key={a.id} className="cartao" style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <span className={`selo ${a.status === 'ATIVA' ? 'ok' : a.status === 'PENDENTE' ? 'ATACADO' : 'baixo'}`}>
                {a.status === 'ATIVA' ? t('chatAtendimento.ativo') : a.status === 'PENDENTE' ? t('chatAtendimento.pendente') : t('chatAtendimento.cancelado')}
              </span>
              <div style={{ fontSize: 14, marginTop: 6 }}>
                {t('chatAtendimento.valorMensal')} <strong>{formataReal(a.valor)}</strong>
                {a.cicloFimEm && <> · {t('chatAtendimento.proximaCobranca')} {fmtData(a.cicloFimEm)}</>}
              </div>
              {pendenteCancelamento && (
                <div style={{ fontSize: 13, color: 'var(--warn)', marginTop: 4 }}>
                  {t('chatAtendimento.acessoAte')} {fmtData(a.cicloFimEm)}
                </div>
              )}
            </div>

            {a.status !== 'CANCELADA' && (
              <div className="campo" style={{ maxWidth: 220 }}>
                <label>{t('chatAtendimento.vendedoraAtribuida')}</label>
                <select value={a.vendedoraId ?? ''} onChange={(e) => atribuir(a.id, e.target.value)} disabled={ocupado}>
                  <option value="">{t('chatAtendimento.selecioneVendedora')}</option>
                  {vendedorasDisponiveisPara(a).map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
                </select>
              </div>
            )}

            <div>
              {a.status !== 'CANCELADA' && (
                pendenteCancelamento ? (
                  <button className="btn secundario" onClick={() => reativar(a.id)} disabled={ocupado}>{t('chatAtendimento.reativar')}</button>
                ) : (
                  <button className="btn secundario" onClick={() => cancelar(a.id)} disabled={ocupado}>{t('chatAtendimento.cancelar')}</button>
                )
              )}
            </div>
          </div>
        )
      })}

      {roteiro && (
        <div className="cartao">
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <h2 style={{ margin: 0 }}>{t('chatAtendimento.roteiroTitulo')}</h2>
            <span className={`selo ${personalizado ? 'ok' : 'ATACADO'}`}>
              {personalizado ? t('chatAtendimento.roteiroPersonalizado') : t('chatAtendimento.roteiroAutomatico')}
            </span>
          </header>
          <p style={{ color: 'var(--ink-soft)', fontSize: 13 }}>{t('chatAtendimento.roteiroExplicacao')}</p>

          <div className="linha-campos">
            <div className="campo">
              <label>{t('chatAtendimento.tomLabel')}</label>
              <select
                value={roteiro.saudacao.tom}
                onChange={(e) => setRoteiro({ ...roteiro, saudacao: { ...roteiro.saudacao, tom: e.target.value as Roteiro['saudacao']['tom'] } })}
              >
                <option value="descontraido">{t('chatAtendimento.tomDescontraido')}</option>
                <option value="neutro">{t('chatAtendimento.tomNeutro')}</option>
                <option value="sobrio">{t('chatAtendimento.tomSobrio')}</option>
              </select>
            </div>
          </div>

          <div className="campo">
            <label>{t('chatAtendimento.saudacaoLabel')}</label>
            <input
              value={roteiro.saudacao.mensagem}
              onChange={(e) => setRoteiro({ ...roteiro, saudacao: { ...roteiro.saudacao, mensagem: e.target.value } })}
            />
            <small className="dica">{t('chatAtendimento.placeholderLoja')}</small>
          </div>

          <div className="campo">
            <label>{t('chatAtendimento.saudacaoFallbackLabel')}</label>
            <input value={roteiro.saudacaoFallback} onChange={(e) => setRoteiro({ ...roteiro, saudacaoFallback: e.target.value })} />
            <small className="dica">{t('chatAtendimento.placeholderLoja')}</small>
          </div>

          {roteiro.perguntasQualificacao.map((p, i) => (
            <div className="campo" key={p.campo}>
              <label>
                {p.campo === 'peca' ? t('chatAtendimento.perguntaPeca') : p.campo === 'tamanho' ? t('chatAtendimento.perguntaTamanho') : t('chatAtendimento.perguntaFaixa')}
              </label>
              <input
                value={p.pergunta}
                onChange={(e) => {
                  const novas = [...roteiro.perguntasQualificacao]
                  novas[i] = { ...p, pergunta: e.target.value }
                  setRoteiro({ ...roteiro, perguntasQualificacao: novas })
                }}
              />
            </div>
          ))}

          <div className="campo">
            <label>{t('chatAtendimento.palavrasChaveLabel')}</label>
            <input
              value={roteiro.palavrasChaveSegmento.join(', ')}
              onChange={(e) => setRoteiro({ ...roteiro, palavrasChaveSegmento: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
            />
          </div>

          <div className="campo">
            <label>{t('chatAtendimento.gatilhosLabel')}</label>
            <input
              value={roteiro.gatilhosHandoffDireto.join(', ')}
              onChange={(e) => setRoteiro({ ...roteiro, gatilhosHandoffDireto: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
            />
          </div>

          <div className="campo">
            <label>{t('chatAtendimento.mensagemConclusaoLabel')}</label>
            <input value={roteiro.mensagemConclusao} onChange={(e) => setRoteiro({ ...roteiro, mensagemConclusao: e.target.value })} />
            <small className="dica">{t('chatAtendimento.placeholderVendedora')}</small>
          </div>

          <div className="campo">
            <label>{t('chatAtendimento.mensagemHandoffLabel')}</label>
            <input value={roteiro.mensagemHandoffHumano} onChange={(e) => setRoteiro({ ...roteiro, mensagemHandoffHumano: e.target.value })} />
            <small className="dica">{t('chatAtendimento.placeholderVendedora')}</small>
          </div>

          <div className="acoes" style={{ marginTop: 14 }}>
            {personalizado && (
              <button type="button" className="btn secundario" onClick={restaurarRoteiro} disabled={salvandoRoteiro}>
                {t('chatAtendimento.restaurarAutomatico')}
              </button>
            )}
            <button type="button" className="btn" onClick={salvarRoteiro} disabled={salvandoRoteiro}>
              {salvandoRoteiro ? t('chatAtendimento.processando') : t('chatAtendimento.salvarRoteiro')}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
