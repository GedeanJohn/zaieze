import { useCallback, useEffect, useState } from 'react'
import { api, mensagemDeErro, usuarioLogado } from '../api'
import { SeletorLoja, useLojaAtiva } from '../componentes/SeletorLoja'

interface Campanha {
  id: string
  nome: string
  segmentoAlvo: string | null
  mensagemTemplate: string
  enviados: number
  simulados: number
  falhas: number
  semConsentimento: number
  createdAt: string
  criadaPor: { nome: string }
}
interface Regua { id: string; dias: number; mensagemTemplate: string; ativa: boolean }

const SEGMENTOS = ['', 'NOVO', 'FREQUENTE', 'VIP', 'INATIVO', 'ATACADO']

export default function Campanhas() {
  const usuario = usuarioLogado()!
  const gerente = usuario.role !== 'VENDEDORA'
  // Só quem tem carteira/WhatsApp próprio conecta um número. Gestor/admin não têm WhatsApp pessoal.
  const podeConectarWa = usuario.role === 'VENDEDORA' || usuario.role === 'GERENTE'
  const escopo = useLojaAtiva()

  const [campanhas, setCampanhas] = useState<Campanha[]>([])
  const [reguas, setReguas] = useState<Regua[]>([])
  const [nome, setNome] = useState('Novidades da semana')
  const [segmento, setSegmento] = useState('')
  const [template, setTemplate] = useState('Oi {primeiroNome}! 😍 Chegaram novidades na {loja} pensando em você. Quer ver? — {vendedora}')
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [sugerindo, setSugerindo] = useState(false)
  const [processando, setProcessando] = useState(false)
  const [disparoTravado, setDisparoTravado] = useState(false)

  // Texto padrão do disparo definido pelo gestor (marca). Trava a vendedora quando não pode editar.
  useEffect(() => {
    api.get('/marca').then(({ data }) => {
      if (data?.textoDisparoPadrao) setTemplate(data.textoDisparoPadrao)
      setDisparoTravado(!gerente && data?.disparoVendedoraEditavel === false)
    }).catch(() => { /* sem marca/permite editar */ })
  }, [gerente])

  // ── Conexão do WhatsApp (Evolution / QR) ──
  const [waStatus, setWaStatus] = useState<{ conectado: boolean; qrcode: string | null; estado: string; numero?: string | null } | null>(null)
  const [conectandoWa, setConectandoWa] = useState(false)

  const carregarWaStatus = useCallback(async () => {
    if (!escopo.pronto || !podeConectarWa) return null
    try { const { data } = await api.get('/whatsapp/instancia/status', { params: escopo.params }); setWaStatus(data); return data }
    catch { return null }
  }, [escopo.pronto, escopo.params, podeConectarWa])

  useEffect(() => { carregarWaStatus() }, [carregarWaStatus])

  // Enquanto conecta, faz polling do status (QR + conexão).
  useEffect(() => {
    if (!conectandoWa) return
    const id = setInterval(async () => {
      const s = await carregarWaStatus()
      if (s?.conectado) setConectandoWa(false)
    }, 2500)
    return () => clearInterval(id)
  }, [conectandoWa, carregarWaStatus])

  async function conectarWhatsapp() {
    setErro('')
    try {
      await api.post('/whatsapp/instancia/conectar', {}, { params: escopo.params })
      setConectandoWa(true)
      carregarWaStatus()
    } catch (e) { setErro(mensagemDeErro(e)) }
  }

  // Trocar número: desconecta o atual e já dispara um novo QR para escanear outro aparelho.
  async function trocarNumero() {
    if (!confirm('Desconectar o número atual e conectar outro? Você vai precisar escanear o QR Code com o novo aparelho.')) return
    setErro('')
    try {
      await api.post('/whatsapp/instancia/desconectar', {}, { params: escopo.params })
      await carregarWaStatus()
      await conectarWhatsapp()
    } catch (e) { setErro(mensagemDeErro(e)) }
  }

  // Desconectar: encerra a sessão do WhatsApp da vendedora (fica desconectada).
  async function desconectarWhatsapp() {
    if (!confirm('Desconectar seu WhatsApp? Você deixará de enviar/receber mensagens por aqui até conectar de novo.')) return
    setErro('')
    try {
      await api.post('/whatsapp/instancia/desconectar', {}, { params: escopo.params })
      setConectandoWa(false)
      await carregarWaStatus()
    } catch (e) { setErro(mensagemDeErro(e)) }
  }

  const carregar = useCallback(async () => {
    if (!escopo.pronto) return
    const reqs: Promise<unknown>[] = [api.get('/campanhas', { params: escopo.params }).then(({ data }) => setCampanhas(data))]
    if (gerente) reqs.push(api.get('/reguas', { params: escopo.params }).then(({ data }) => setReguas(data)))
    await Promise.all(reqs)
  }, [escopo.pronto, escopo.params, gerente])

  useEffect(() => { carregar() }, [carregar])

  async function sugerir() {
    setSugerindo(true); setErro('')
    try {
      const { data } = await api.post('/campanhas/sugerir', { segmento: segmento || undefined }, { params: escopo.params })
      setTemplate(data.texto)
      setAviso(data.viaIa ? 'Mensagem gerada pela IA. ✨' : 'Mensagem-modelo (configure ANTHROPIC_API_KEY para usar a IA).')
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setSugerindo(false)
    }
  }

  async function enviar() {
    setEnviando(true); setErro(''); setAviso('')
    try {
      const { data } = await api.post('/campanhas', { nome, segmento: segmento || undefined, mensagemTemplate: template }, { params: escopo.params })
      const partes = [`${data.enviados} enviada(s)`, data.simulados ? `${data.simulados} simulada(s)` : '', data.falhas ? `${data.falhas} falha(s)` : '', data.semConsentimento ? `${data.semConsentimento} sem consentimento LGPD` : '']
      setAviso(`Campanha disparada para ${data.alcance} cliente(s): ${partes.filter(Boolean).join(' · ')}.`)
      carregar()
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setEnviando(false)
    }
  }

  async function processarReguas() {
    setProcessando(true); setErro(''); setAviso('')
    try {
      const { data } = await api.post('/reguas/processar', {}, { params: escopo.params })
      const total = (data.reguas as { enviados: number; simulados: number; alcance: number }[]).reduce(
        (a, r) => ({ alcance: a.alcance + r.alcance, enviados: a.enviados + r.enviados, simulados: a.simulados + r.simulados }),
        { alcance: 0, enviados: 0, simulados: 0 },
      )
      setAviso(`Réguas processadas: ${total.alcance} cliente(s) alcançado(s) (${total.enviados} enviadas, ${total.simulados} simuladas).`)
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setProcessando(false)
    }
  }

  return (
    <>
      <header>
        <h1>WhatsApp & Campanhas</h1>
        <SeletorLoja escopo={escopo} />
      </header>

      {aviso && <div className="sucesso">{aviso}</div>}
      {erro && <div className="alerta">{erro}</div>}

      {/* Conexão do WhatsApp (QR via Evolution) — só para quem tem carteira/WhatsApp próprio */}
      {!podeConectarWa ? (
        <div className="cartao" style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
          📱 <strong>WhatsApp:</strong> cada vendedora conecta o próprio número no login dela (em WhatsApp → “Meu WhatsApp”). O <strong>número oficial da marca</strong> está no roadmap.
        </div>
      ) : (
      <div className="cartao">
        <h2 className="painel-titulo">Meu WhatsApp</h2>
        {waStatus?.conectado ? (
          <div>
            <div style={{ color: 'var(--ok)', fontWeight: 600 }}>
              ✅ WhatsApp conectado{waStatus.numero ? ` · ${waStatus.numero}` : ''}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <button className="btn secundario" onClick={trocarNumero} disabled={!escopo.pronto}>🔄 Trocar número</button>
              <button className="btn secundario" onClick={desconectarWhatsapp} disabled={!escopo.pronto}>🔌 Desconectar</button>
            </div>
          </div>
        ) : (
          <>
            <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 0 }}>
              Conecte seu WhatsApp para enviar campanhas/links e receber as mensagens dos clientes na sua carteira.
            </p>
            {!conectandoWa && (
              <button className="btn" onClick={conectarWhatsapp} disabled={!escopo.pronto}>📱 Conectar meu WhatsApp</button>
            )}
            {conectandoWa && (
              <div style={{ marginTop: 8 }}>
                {waStatus?.qrcode ? (
                  <>
                    <p style={{ fontSize: 13, margin: '0 0 10px' }}>
                      No celular: WhatsApp → <strong>Aparelhos conectados</strong> → <strong>Conectar um aparelho</strong> e escaneie:
                    </p>
                    <img
                      src={waStatus.qrcode.startsWith('data:') ? waStatus.qrcode : `data:image/png;base64,${waStatus.qrcode}`}
                      alt="QR Code do WhatsApp"
                      style={{ width: 240, height: 240, maxWidth: '100%', background: '#fff', padding: 8, borderRadius: 8, border: '1px solid var(--border)' }}
                    />
                    <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 8 }}>Aguardando leitura… o status atualiza sozinho.</p>
                  </>
                ) : (
                  <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Gerando QR Code… aguarde alguns segundos.</p>
                )}
                <button className="btn secundario" style={{ marginTop: 8 }} onClick={() => setConectandoWa(false)}>Cancelar</button>
              </div>
            )}
          </>
        )}
      </div>
      )}

      <div className="grade-paineis">
        {/* Disparo de campanha */}
        <div className="cartao">
          <h2 className="painel-titulo">Disparo personalizado</h2>
          <div className="linha-campos">
            <div className="campo">
              <label>Nome da campanha</label>
              <input value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div className="campo">
              <label>Público (classificação)</label>
              <select value={segmento} onChange={(e) => setSegmento(e.target.value)}>
                {SEGMENTOS.map((s) => <option key={s} value={s}>{s || (gerente ? 'Toda a carteira' : 'Minha carteira')}</option>)}
              </select>
            </div>
          </div>
          <div className="campo">
            <label>
              Mensagem{' '}
              {!disparoTravado && (
                <button type="button" className="btn-link" onClick={sugerir} disabled={sugerindo || !escopo.pronto}>
                  {sugerindo ? 'gerando…' : '✨ sugerir com IA'}
                </button>
              )}
            </label>
            <textarea rows={4} value={template} onChange={(e) => setTemplate(e.target.value)} disabled={disparoTravado} />
            {disparoTravado ? (
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>
                🔒 Texto definido pelo gestor — não editável.
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>
                Variáveis: {'{primeiroNome}'} {'{nome}'} {'{loja}'} {'{vendedora}'} {'{diasSemCompra}'} {'{totalGasto}'} {'{link}'}
                <br />O link do catálogo da vendedora é incluído automaticamente; use {'{link}'} para posicioná-lo no texto.
              </div>
            )}
          </div>
          <button className="btn" onClick={enviar} disabled={enviando || !escopo.pronto}>
            {enviando ? 'Disparando…' : '📲 Enviar campanha'}
          </button>
          <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 8 }}>
            Só envia para clientes com consentimento LGPD, roteando pela vendedora dona de cada cliente.
          </p>
        </div>

        {/* Réguas de inatividade */}
        {gerente && (
          <div className="cartao">
            <h2 className="painel-titulo">Réguas de recuperação de inativos</h2>
            <table>
              <thead><tr><th>Janela</th><th>Mensagem</th><th>Status</th></tr></thead>
              <tbody>
                {reguas.map((r) => (
                  <tr key={r.id}>
                    <td>{r.dias} dias</td>
                    <td style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{r.mensagemTemplate.slice(0, 60)}…</td>
                    <td><span className={`selo ${r.ativa ? 'ok' : 'baixo'}`}>{r.ativa ? 'Ativa' : 'Inativa'}</span></td>
                  </tr>
                ))}
                {reguas.length === 0 && <tr><td colSpan={3} style={{ color: 'var(--ink-soft)' }}>Nenhuma régua configurada.</td></tr>}
              </tbody>
            </table>
            <button className="btn secundario" onClick={processarReguas} disabled={processando || !escopo.pronto} style={{ marginTop: 12 }}>
              {processando ? 'Processando…' : '🔁 Processar réguas agora'}
            </button>
            <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 8 }}>
              Dispara automaticamente para clientes na janela de inatividade. (Em produção, roda como job diário.)
            </p>
          </div>
        )}
      </div>

      {/* Histórico de campanhas */}
      <div className="cartao">
        <h2 className="painel-titulo">Campanhas recentes</h2>
        <table>
          <thead><tr><th>Data</th><th>Campanha</th><th>Público</th><th>Por</th><th>Resultado</th></tr></thead>
          <tbody>
            {campanhas.map((c) => (
              <tr key={c.id}>
                <td>{new Date(c.createdAt).toLocaleDateString('pt-BR')}</td>
                <td>{c.nome}</td>
                <td>{c.segmentoAlvo ? <span className={`selo ${c.segmentoAlvo}`}>{c.segmentoAlvo}</span> : '—'}</td>
                <td>{c.criadaPor.nome}</td>
                <td style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
                  {c.enviados} enviadas{c.simulados ? ` · ${c.simulados} simuladas` : ''}{c.semConsentimento ? ` · ${c.semConsentimento} s/ LGPD` : ''}
                </td>
              </tr>
            ))}
            {campanhas.length === 0 && <tr><td colSpan={5} style={{ color: 'var(--ink-soft)' }}>Nenhuma campanha ainda.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  )
}
