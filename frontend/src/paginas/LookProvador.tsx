import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api, mensagemDeErro } from '../api'
import SeletorIdioma from '../componentes/SeletorIdioma'
import { useIdioma } from '../lib/i18n'

interface DadosLook {
  status: string
  aceitaEnvio: boolean
  peca: { nome: string; foto: string | null }
  marca: { nome: string; logoUrl: string | null; corPrimaria: string | null; corSecundaria: string | null }
  resultado: { fotoUrl: string | null; videoUrl: string | null } | null
}

// Estados intermediários (depois que o cliente já enviou a selfie, aguardando a FASHN).
const EM_ANDAMENTO = new Set(['PENDENTE', 'PROCESSANDO_FOTO', 'FOTO_PRONTA', 'PROCESSANDO_VIDEO'])

export default function LookProvador() {
  const { token } = useParams<{ token: string }>()
  const { t } = useIdioma()
  const [dados, setDados] = useState<DadosLook | null>(null)
  const [erro, setErro] = useState('')
  const [consentimento, setConsentimento] = useState(false)
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erroEnvio, setErroEnvio] = useState('')

  function carregar() {
    api.get(`/provador/p/${token}`).then(({ data }) => setDados(data)).catch(() => setErro(t('lookPub.naoEncontrado')))
  }
  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  // Enquanto a FASHN processa, atualiza sozinho até chegar em CONCLUIDO/FALHOU.
  useEffect(() => {
    if (!dados || !EM_ANDAMENTO.has(dados.status)) return
    const id = setInterval(carregar, 4000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dados?.status])

  function escolherArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    setArquivo(f)
    setPreview(f ? URL.createObjectURL(f) : '')
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!arquivo || !consentimento) return
    setEnviando(true); setErroEnvio('')
    try {
      const fd = new FormData()
      fd.append('file', arquivo)
      await api.post(`/provador/p/${token}/foto`, fd, { params: { consent: 'true' } })
      carregar()
    } catch (err) {
      setErroEnvio(mensagemDeErro(err))
    } finally {
      setEnviando(false)
    }
  }

  if (erro) return <div className="lookpub-vazio">{erro}</div>
  if (!dados) return <div className="lookpub-vazio">{t('lookPub.carregando')}</div>

  const cor = dados.marca.corPrimaria || '#111111'

  return (
    <div className="lookpub-root">
      <LookPubEstilos cor={cor} />
      <div className="lookpub-acoes"><SeletorIdioma /></div>

      <div className="lookpub-folha">
        <header className="lookpub-cab">
          {dados.marca.logoUrl
            ? <img className="lookpub-logo" src={dados.marca.logoUrl} alt={dados.marca.nome} />
            : <div className="lookpub-marca">{dados.marca.nome}</div>}
        </header>

        <div className="lookpub-peca">
          {dados.peca.foto && <img src={dados.peca.foto} alt={dados.peca.nome} />}
          <div className="lookpub-pecaNome">{dados.peca.nome}</div>
        </div>

        {dados.status === 'EXPIRADO' && <div className="lookpub-estado">⏱️ {t('lookPub.expirado')}</div>}

        {dados.status === 'AGUARDANDO_FOTO' && dados.aceitaEnvio && (
          <form className="lookpub-form" onSubmit={enviar}>
            <p>{t('lookPub.instrucao')}</p>

            {preview ? (
              <>
                <img className="lookpub-preview" src={preview} alt="" />
                <button type="button" className="lookpub-trocar" onClick={() => { setArquivo(null); setPreview('') }}>
                  {t('lookPub.trocarFoto')}
                </button>
              </>
            ) : (
              <label className="lookpub-upload">
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={escolherArquivo} hidden />
                📷 {t('lookPub.escolherFoto')}
              </label>
            )}

            <label className="lookpub-consent">
              <input type="checkbox" checked={consentimento} onChange={(e) => setConsentimento(e.target.checked)} />
              {t('lookPub.consentTexto')}
            </label>

            {erroEnvio && <div className="lookpub-alerta">{erroEnvio}</div>}
            <button className="lookpub-btn" disabled={!arquivo || !consentimento || enviando}>
              {enviando ? t('lookPub.enviando') : t('lookPub.enviarBtn')}
            </button>
          </form>
        )}

        {EM_ANDAMENTO.has(dados.status) && (
          <div className="lookpub-estado">
            <div className="lookpub-spinner" />
            {t('lookPub.processando')}
          </div>
        )}

        {dados.status === 'FALHOU' && <div className="lookpub-estado erro">😕 {t('lookPub.falhou')}</div>}

        {dados.status === 'CONCLUIDO' && dados.resultado && (
          <div className="lookpub-resultado">
            {dados.resultado.videoUrl
              ? <video src={dados.resultado.videoUrl} controls playsInline />
              : dados.resultado.fotoUrl && <img src={dados.resultado.fotoUrl} alt={t('lookPub.resultadoAlt')} />}
            <div className="lookpub-resultadoAcoes">
              <a
                className="lookpub-btn"
                href={dados.resultado.videoUrl ?? dados.resultado.fotoUrl ?? '#'}
                download
                target="_blank"
                rel="noreferrer"
              >
                {t('lookPub.baixar')}
              </a>
            </div>
          </div>
        )}

        <footer className="lookpub-pe">{dados.marca.nome} · {t('ped.poweredBy')}</footer>
      </div>
    </div>
  )
}

function LookPubEstilos({ cor }: { cor: string }) {
  return (
    <style>{`
      .lookpub-root { background: #f3f3f3; min-height: 100vh; padding: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: #1a1a1a; }
      .lookpub-acoes { max-width: 420px; margin: 0 auto 14px; display: flex; justify-content: flex-end; }
      .lookpub-vazio { max-width: 420px; margin: 80px auto; text-align: center; color: #777; }
      .lookpub-folha { max-width: 420px; margin: 0 auto; background: #fff; padding: 28px 22px; border-radius: 14px; box-shadow: 0 4px 20px #00000014; }
      .lookpub-cab { text-align: center; margin-bottom: 18px; }
      .lookpub-logo { max-height: 48px; max-width: 200px; object-fit: contain; }
      .lookpub-marca { font-size: 20px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; }
      .lookpub-peca { text-align: center; margin-bottom: 20px; }
      .lookpub-peca img { width: 140px; height: 180px; object-fit: cover; border-radius: 10px; margin: 0 auto 8px; display: block; }
      .lookpub-pecaNome { font-weight: 700; font-size: 15px; }
      .lookpub-form { display: flex; flex-direction: column; gap: 14px; }
      .lookpub-form p { font-size: 14px; color: #555; text-align: center; margin: 0; }
      .lookpub-upload { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 32px 16px; border: 2px dashed #ccc; border-radius: 12px; cursor: pointer; font-size: 14px; color: #555; }
      .lookpub-preview { width: 100%; max-height: 320px; object-fit: cover; border-radius: 12px; }
      .lookpub-trocar { background: none; border: none; color: ${cor}; text-decoration: underline; font-size: 13px; cursor: pointer; align-self: center; }
      .lookpub-consent { display: flex; gap: 8px; font-size: 12px; color: #666; line-height: 1.5; align-items: flex-start; }
      .lookpub-consent input { margin-top: 3px; }
      .lookpub-alerta { background: #fdeaea; color: #b3261e; border-radius: 8px; padding: 10px 14px; font-size: 13px; }
      .lookpub-btn { background: ${cor}; color: #fff; border: none; padding: 14px 18px; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: 15px; text-align: center; text-decoration: none; display: inline-block; }
      .lookpub-btn:disabled { opacity: .5; cursor: not-allowed; }
      .lookpub-estado { text-align: center; padding: 30px 10px; color: #666; font-size: 14px; }
      .lookpub-estado.erro { color: #b3261e; }
      .lookpub-spinner { width: 28px; height: 28px; border: 3px solid #eee; border-top-color: ${cor}; border-radius: 50%; margin: 0 auto 12px; animation: lookpub-spin 0.8s linear infinite; }
      @keyframes lookpub-spin { to { transform: rotate(360deg); } }
      .lookpub-resultado { text-align: center; }
      .lookpub-resultado img, .lookpub-resultado video { width: 100%; border-radius: 12px; margin-bottom: 14px; }
      .lookpub-resultadoAcoes { display: flex; justify-content: center; }
      .lookpub-pe { text-align: center; color: #bbb; font-size: 11px; margin-top: 22px; }
    `}</style>
  )
}
