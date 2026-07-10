import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, mensagemDeErro } from '../api'
import { useToast } from '../componentes/Toast'
import { useIdioma } from '../lib/i18n'

interface ProdutoOpc { id: string; nome: string; fotos: string[] }
interface Look {
  id: string
  status: string
  comVideo: boolean
  fotoUrl: string | null
  videoUrl: string | null
  erro: string | null
  createdAt: string
  produto: { nome: string; fotos: string[] }
}
interface Cota { usados: number; limite: number; ok: boolean }

// Estados em que o look ainda pode mudar sozinho (link aberto, ou fila da FASHN) — dispara o polling da galeria.
const EM_ANDAMENTO = new Set(['AGUARDANDO_FOTO', 'PENDENTE', 'PROCESSANDO_FOTO', 'FOTO_PRONTA', 'PROCESSANDO_VIDEO'])

function corStatus(status: string): string {
  if (status === 'CONCLUIDO') return 'ok'
  if (status === 'FALHOU' || status === 'EXPIRADO') return 'baixo'
  return 'ATACADO'
}

export default function Provador() {
  const { t } = useIdioma()
  const avisar = useToast()
  const [semAcesso, setSemAcesso] = useState(false)
  const [produtos, setProdutos] = useState<ProdutoOpc[]>([])
  const [looks, setLooks] = useState<Look[]>([])
  const [cota, setCota] = useState<Cota | null>(null)
  const [produtoBaseId, setProdutoBaseId] = useState('')
  const [comVideo, setComVideo] = useState(false)
  const [criando, setCriando] = useState(false)
  const [erro, setErro] = useState('')
  const [linkGerado, setLinkGerado] = useState<string | null>(null)

  function carregar() {
    api.get('/provador/cota').then(({ data }) => setCota(data)).catch((e) => { if (e.response?.status === 403) setSemAcesso(true) })
    api.get('/provador/looks').then(({ data }) => setLooks(data)).catch(() => {})
  }

  useEffect(() => {
    carregar()
    api.get('/produtos').then(({ data }) => setProdutos((data as ProdutoOpc[]).filter((p) => p.fotos?.length > 0)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Enquanto algum look estiver em andamento, atualiza a galeria sozinha.
  useEffect(() => {
    if (!looks.some((l) => EM_ANDAMENTO.has(l.status))) return
    const id = setInterval(() => api.get('/provador/looks').then(({ data }) => setLooks(data)).catch(() => {}), 5000)
    return () => clearInterval(id)
  }, [looks])

  async function criarLook(e: React.FormEvent) {
    e.preventDefault()
    if (!produtoBaseId) return
    setCriando(true); setErro('')
    try {
      const { data } = await api.post('/provador/looks', { produtoBaseId, comVideo })
      setLinkGerado(data.url)
      setProdutoBaseId(''); setComVideo(false)
      carregar()
    } catch (err) {
      setErro(mensagemDeErro(err))
    } finally {
      setCriando(false)
    }
  }

  async function excluir(id: string) {
    if (!window.confirm(t('provador.confirmExcluir'))) return
    try {
      await api.delete(`/provador/looks/${id}`)
      setLooks((ls) => ls.filter((l) => l.id !== id))
    } catch (err) {
      avisar(mensagemDeErro(err), 'erro')
    }
  }

  function copiar(url: string) {
    navigator.clipboard.writeText(url)
    avisar(t('provador.linkCopiado'))
  }

  function enviarWhatsapp(url: string) {
    const txt = `${t('provador.mensagemWhatsapp')}\n${url}`
    window.open(`https://wa.me/?text=${encodeURIComponent(txt)}`, '_blank')
  }

  if (semAcesso) {
    return (
      <div className="cartao">
        <h2 style={{ marginTop: 0 }}>{t('provador.titulo')}</h2>
        <p>{t('provador.semAcessoTexto')}</p>
        <Link className="btn" to="/planos">{t('provador.assinarAddon')}</Link>
      </div>
    )
  }

  return (
    <>
      <header>
        <h1>{t('provador.titulo')}</h1>
        <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>{t('provador.subtitulo')}</div>
      </header>

      {cota && (
        <div className="cartao" style={{ fontSize: 13 }}>
          {cota.limite === 0
            ? t('provador.cotaIlimitada')
            : t('provador.cotaUsada', { usados: String(cota.usados), limite: String(cota.limite) })}
        </div>
      )}

      <form className="cartao" onSubmit={criarLook} style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <label>{t('provador.pecaLabel')}</label>
          <select value={produtoBaseId} onChange={(e) => setProdutoBaseId(e.target.value)} required>
            <option value="">{t('comum.selecione')}</option>
            {produtos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <input type="checkbox" checked={comVideo} onChange={(e) => setComVideo(e.target.checked)} />
          {t('provador.comVideoLabel')}
        </label>
        <button className="btn" disabled={criando || !produtoBaseId || (cota ? !cota.ok : false)}>
          {criando ? '…' : t('provador.gerarLinkBtn')}
        </button>
      </form>
      {erro && <div className="alerta">{erro}</div>}

      {linkGerado && (
        <div className="sucesso" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <span>{t('provador.linkGeradoTexto')} <strong>{linkGerado}</strong></span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn secundario" onClick={() => copiar(linkGerado)}>{t('provador.copiarLink')}</button>
            <button type="button" className="btn" onClick={() => enviarWhatsapp(linkGerado)}>{t('provador.enviarWhatsapp')}</button>
          </div>
        </div>
      )}

      <div className="cartao">
        <h2 style={{ marginTop: 0 }}>{t('provador.galeriaTitulo')}</h2>
        {looks.length === 0 ? (
          <p style={{ color: 'var(--ink-soft)' }}>{t('provador.semLooks')}</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th></th>
                <th>{t('provador.colPeca')}</th>
                <th>{t('provador.colStatus')}</th>
                <th>{t('provador.colCriado')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {looks.map((l) => {
                const foto = l.fotoUrl ?? l.produto.fotos[0]
                return (
                  <tr key={l.id}>
                    <td>{foto ? <img src={foto} alt="" style={{ width: 40, height: 52, objectFit: 'cover', borderRadius: 4 }} /> : null}</td>
                    <td>{l.produto.nome}{l.comVideo ? ' 🎬' : ''}</td>
                    <td><span className={`selo ${corStatus(l.status)}`}>{t(`provador.status.${l.status}`)}</span></td>
                    <td>{new Date(l.createdAt).toLocaleDateString('pt-BR')}</td>
                    <td style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      {l.fotoUrl && <a href={l.videoUrl ?? l.fotoUrl} target="_blank" rel="noreferrer">{t('provador.verResultado')}</a>}
                      <button type="button" className="btn-link" onClick={() => excluir(l.id)}>{t('comum.excluir')}</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
