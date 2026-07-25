import { useEffect, useRef, useState } from 'react'
import { api, mensagemDeErro } from '../api'
import { carregarSdkMeta } from '../lib/metaSdk'
import { useToast } from './Toast'
import { useIdioma } from '../lib/i18n'

interface Candidato { pageId: string; pageNome: string; igBusinessAccountId: string; username?: string; pageToken: string }

/**
 * Conecta WhatsApp + Instagram num fluxo guiado só (um cartão, dois passos), em vez de exigir que
 * o gestor visite as duas telas separadamente. Cada passo é seu PRÓPRIO clique — não encadeamos os
 * dois popups automaticamente porque o segundo `FB.login` (disparado de dentro do callback async do
 * primeiro) corre risco real de ser bloqueado pelo navegador por não vir de um gesto direto do
 * usuário. Assim que o WhatsApp conecta, aparece o botão do Instagram; um clique nele já basta.
 */
export default function ConectarMetaTudo({
  appId, configId, aoConectarWhatsApp, aoConectarInstagram,
}: {
  appId: string
  configId: string
  aoConectarWhatsApp?: () => Promise<void>
  aoConectarInstagram?: () => Promise<void>
}) {
  const { t } = useIdioma()
  const avisar = useToast()
  const [etapa, setEtapa] = useState<'inicio' | 'whatsapp' | 'instagram' | 'concluido'>('inicio')
  const [ocupado, setOcupado] = useState(false)
  const [candidatos, setCandidatos] = useState<Candidato[] | null>(null)
  const sessaoWaRef = useRef<{ wabaId: string; phoneNumberId: string } | null>(null)

  useEffect(() => {
    carregarSdkMeta(appId)
    function aoReceberMensagem(event: MessageEvent) {
      if (!event.origin.endsWith('facebook.com')) return
      let dados: any
      try { dados = JSON.parse(event.data) } catch { return }
      if (dados?.type !== 'WA_EMBEDDED_SIGNUP') return
      if (dados.event === 'FINISH' && dados.data?.waba_id && dados.data?.phone_number_id) {
        sessaoWaRef.current = { wabaId: dados.data.waba_id, phoneNumberId: dados.data.phone_number_id }
      }
    }
    window.addEventListener('message', aoReceberMensagem)
    return () => window.removeEventListener('message', aoReceberMensagem)
  }, [appId])

  async function esperarSessaoWa(): Promise<{ wabaId: string; phoneNumberId: string } | null> {
    for (let i = 0; i < 20; i++) {
      if (sessaoWaRef.current) return sessaoWaRef.current
      await new Promise((r) => setTimeout(r, 250))
    }
    return null
  }

  function conectarWhatsApp() {
    if (!window.FB) return
    sessaoWaRef.current = null
    setOcupado(true)
    window.FB.login(
      async (resposta) => {
        const code = resposta?.authResponse?.code as string | undefined
        if (!code) { setOcupado(false); return }
        try {
          const sessao = await esperarSessaoWa()
          if (!sessao) throw new Error(t('wa.erroConexaoAutomatica'))
          await api.post('/whatsapp/embedded-signup/callback', { code, wabaId: sessao.wabaId, phoneNumberId: sessao.phoneNumberId })
          await aoConectarWhatsApp?.()
          avisar(t('metaTudo.whatsappConectado'))
          setEtapa('instagram')
        } catch (e) {
          avisar(mensagemDeErro(e), 'erro')
        } finally {
          setOcupado(false)
        }
      },
      { config_id: configId, response_type: 'code', override_default_response_type: true, extras: { setup: {} } },
    )
  }

  async function processarRespostaInstagram(body: Record<string, unknown>) {
    const { data } = await api.post('/instagram/embedded-signup/callback', body)
    if (data.escolhaNecessaria) { setCandidatos(data.candidatos); return }
    setCandidatos(null)
    await aoConectarInstagram?.()
    avisar(t('metaTudo.instagramConectado'))
    setEtapa('concluido')
  }

  function conectarInstagram() {
    if (!window.FB) return
    setOcupado(true)
    window.FB.login(
      async (resposta) => {
        const code = resposta?.authResponse?.code as string | undefined
        if (!code) { setOcupado(false); return }
        try { await processarRespostaInstagram({ code }) }
        catch (e) { avisar(mensagemDeErro(e), 'erro') }
        finally { setOcupado(false) }
      },
      { scope: 'instagram_basic,instagram_manage_messages,pages_show_list', response_type: 'code', override_default_response_type: true },
    )
  }

  async function escolherPagina(c: Candidato) {
    setOcupado(true)
    try { await processarRespostaInstagram({ escolha: { pageId: c.pageId, igBusinessAccountId: c.igBusinessAccountId, pageToken: c.pageToken } }) }
    catch (e) { avisar(mensagemDeErro(e), 'erro') }
    finally { setOcupado(false) }
  }

  return (
    <div className="cartao">
      <h2 style={{ marginTop: 0 }}>{t('metaTudo.titulo')}</h2>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{t('metaTudo.explicacao')}</p>

      {etapa === 'inicio' && (
        <button type="button" className="btn" disabled={ocupado} onClick={conectarWhatsApp}>
          {ocupado ? t('wa.conectandoAutomatico') : t('metaTudo.passo1Btn')}
        </button>
      )}

      {etapa === 'instagram' && !candidatos && (
        <>
          <p style={{ fontSize: 13, color: 'var(--ok)' }}>{t('metaTudo.whatsappConectado')}</p>
          <button type="button" className="btn" disabled={ocupado} onClick={conectarInstagram}>
            {ocupado ? t('ig.conectandoAutomatico') : t('metaTudo.passo2Btn')}
          </button>
        </>
      )}

      {candidatos && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ fontSize: 13 }}>{t('ig.escolherPaginaExplicacao')}</p>
          {candidatos.map((c) => (
            <button key={c.pageId} type="button" className="btn secundario" disabled={ocupado} onClick={() => escolherPagina(c)}>
              {c.pageNome} {c.username ? `· @${c.username}` : ''}
            </button>
          ))}
        </div>
      )}

      {etapa === 'concluido' && <p style={{ fontSize: 13, color: 'var(--ok)' }}>{t('metaTudo.concluido')}</p>}
    </div>
  )
}
