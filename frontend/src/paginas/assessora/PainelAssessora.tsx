import { useEffect, useRef, useState } from 'react'
import { api, formataReal, mensagemDeErro, usuarioLogado, atualizarUsuarioLocal } from '../../api'
import { useToast } from '../../componentes/Toast'
import PreviewVitrine from '../../componentes/PreviewVitrine'
import { HOST } from '../../host'

interface Perfil {
  slug: string; bio: string | null; tagline: string | null; disponivel: boolean
  whatsapp: string | null; telefone: string | null; instagram: string | null; site: string | null
  statProdutos: number | null; statClientes: number | null; statAvaliacao: number | null
}
interface Marca {
  id: string; redeId: string | null; nome: string; logoUrl: string | null; bannerUrl: string | null
  descricao: string | null; formasPagamento: string | null; modoEnvio: string | null; condicoesCompra: string | null
  tamanhos: string | null; valores: string | null; endereco: string | null; cnpj: string | null
  instagram: string | null; facebook: string | null; whatsapp: string | null; telegram: string | null; tiktok: string | null; site: string | null
  linkCatalogo: string | null
  percentualComissaoSugerido: number | null; ordem: number; ativo: boolean
  autorizadoEm: string | null; recusadoEm: string | null
}
interface Venda {
  id: string; data: string; marca: string; assessorMarcaId: string
  valorVenda: number; percentualComissao: number; totalComissao: number; observacao: string | null
}
type Assinatura =
  | { existe: false }
  | { existe: true; status: 'PENDENTE' | 'ATIVA' | 'CANCELADA'; valor: number; simulada: boolean; cicloFimEm: string | null; cancelamentoSolicitadoEm: string | null }
interface Indicacao { slug: string; percentual: number; cliques: number; redesIndicadas: number; pendente: number; paga: number }

const marcaVazia = {
  nome: '', logoUrl: '', descricao: '', formasPagamento: '', modoEnvio: '', condicoesCompra: '',
  tamanhos: '', valores: '', endereco: '', cnpj: '', instagram: '', facebook: '', whatsapp: '', telegram: '', tiktok: '', site: '', linkCatalogo: '',
  percentualComissaoSugerido: '', ativo: true,
}

// timeZone: 'UTC' — `data` é um campo só-de-dia (guardado como meia-noite UTC); sem isso, em
// fusos atrás de UTC (ex.: Brasil) o dia exibido volta um dia perto da meia-noite local.
const fmtData = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' })
function hoje(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function PainelAssessora() {
  const usuario = usuarioLogado()
  const avisar = useToast()
  const [aba, setAba] = useState<'perfil' | 'marcas' | 'vendas' | 'indicacao' | 'assinatura'>('marcas')

  const [assinatura, setAssinatura] = useState<Assinatura | null>(null)
  const [ocupadoAssinatura, setOcupadoAssinatura] = useState(false)

  const [indicacao, setIndicacao] = useState<Indicacao | null>(null)

  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [bio, setBio] = useState(''); const [whatsapp, setWhatsapp] = useState('')
  const [instagram, setInstagram] = useState(''); const [site, setSite] = useState('')
  const [tagline, setTagline] = useState(''); const [disponivel, setDisponivel] = useState(true)
  const [telefone, setTelefone] = useState('')
  const [statProdutos, setStatProdutos] = useState(''); const [statClientes, setStatClientes] = useState(''); const [statAvaliacao, setStatAvaliacao] = useState('')
  const [salvandoPerfil, setSalvandoPerfil] = useState(false)
  const [preview, setPreview] = useState(false)

  // Foto de perfil (exibida na capa da vitrine pública) — mesmo endpoint genérico de Conta.tsx.
  const [fotoUrl, setFotoUrl] = useState<string | null>(usuario?.fotoUrl ?? null)
  const [enviandoFoto, setEnviandoFoto] = useState(false)
  const fotoRef = useRef<HTMLInputElement>(null)

  const [marcas, setMarcas] = useState<Marca[]>([])
  const [formMarca, setFormMarca] = useState<typeof marcaVazia | null>(null)
  const [editandoMarcaId, setEditandoMarcaId] = useState<string | null>(null)
  const [bannerMarcaAtual, setBannerMarcaAtual] = useState<string | null>(null)
  const [enviandoBannerMarca, setEnviandoBannerMarca] = useState(false)
  const bannerMarcaRef = useRef<HTMLInputElement>(null)
  const [salvandoMarca, setSalvandoMarca] = useState(false)

  const [vendas, setVendas] = useState<Venda[]>([])
  const [filtroDe, setFiltroDe] = useState(''); const [filtroAte, setFiltroAte] = useState(''); const [filtroMarca, setFiltroMarca] = useState('')
  const [formVenda, setFormVenda] = useState<{ assessorMarcaId: string; data: string; valorVenda: string; percentualComissao: string; observacao: string } | null>(null)
  const [salvandoVenda, setSalvandoVenda] = useState(false)

  function carregarPerfil() {
    api.get('/assessores/minha').then(({ data }) => {
      setPerfil(data); setBio(data.bio ?? ''); setWhatsapp(data.whatsapp ?? ''); setInstagram(data.instagram ?? ''); setSite(data.site ?? '')
      setTagline(data.tagline ?? ''); setDisponivel(data.disponivel); setTelefone(data.telefone ?? '')
      setStatProdutos(data.statProdutos != null ? String(data.statProdutos) : '')
      setStatClientes(data.statClientes != null ? String(data.statClientes) : '')
      setStatAvaliacao(data.statAvaliacao != null ? String(data.statAvaliacao) : '')
    }).catch((e) => avisar(mensagemDeErro(e), 'erro'))
  }
  function carregarMarcas() {
    api.get('/assessores/minha/marcas').then(({ data }) => setMarcas(data)).catch(() => {})
  }
  function carregarVendas() {
    api.get('/assessores/minha/vendas', { params: { de: filtroDe || undefined, ate: filtroAte || undefined, marcaId: filtroMarca || undefined } })
      .then(({ data }) => setVendas(data)).catch(() => {})
  }
  function carregarAssinatura() {
    api.get('/assessores/minha/assinatura').then(({ data }) => setAssinatura(data)).catch(() => {})
  }
  function carregarIndicacao() {
    api.get('/assessores/minha/indicacao').then(({ data }) => setIndicacao(data)).catch(() => {})
  }
  useEffect(() => { carregarPerfil(); carregarMarcas(); carregarAssinatura(); carregarIndicacao() }, [])
  useEffect(() => { carregarVendas() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filtroDe, filtroAte, filtroMarca])

  async function cancelarAssinatura() {
    if (!window.confirm('Cancelar sua assinatura? Você continua com acesso até o fim do ciclo já pago.')) return
    setOcupadoAssinatura(true)
    try {
      await api.post('/assessores/minha/assinatura/cancelar')
      avisar('Cancelamento agendado — seu acesso segue até o fim do ciclo pago.')
      carregarAssinatura()
    } catch (e) { avisar(mensagemDeErro(e), 'erro') } finally { setOcupadoAssinatura(false) }
  }

  async function reativarAssinatura() {
    setOcupadoAssinatura(true)
    try {
      await api.post('/assessores/minha/assinatura/reativar')
      avisar('Assinatura reativada.')
      carregarAssinatura()
    } catch (e) { avisar(mensagemDeErro(e), 'erro') } finally { setOcupadoAssinatura(false) }
  }

  function sair() {
    localStorage.removeItem('modacrm_token')
    localStorage.removeItem('modacrm_usuario')
    window.location.href = '/login'
  }

  async function salvarPerfil(e: React.FormEvent) {
    e.preventDefault(); setSalvandoPerfil(true)
    try {
      await api.patch('/assessores/minha', {
        bio: bio || null, whatsapp: whatsapp || null, instagram: instagram || null, site: site || null,
        tagline: tagline || null, disponivel, telefone: telefone || null,
        statProdutos: statProdutos !== '' ? Number(statProdutos) : null,
        statClientes: statClientes !== '' ? Number(statClientes) : null,
        statAvaliacao: statAvaliacao !== '' ? Number(statAvaliacao) : null,
      })
      avisar('Perfil salvo.')
      carregarPerfil()
    } catch (e2) { avisar(mensagemDeErro(e2), 'erro') } finally { setSalvandoPerfil(false) }
  }

  async function enviarFoto(arquivo: File) {
    setEnviandoFoto(true)
    try {
      const fd = new FormData()
      fd.append('file', arquivo)
      const { data } = await api.post('/usuarios/me/foto', fd)
      setFotoUrl(data.fotoUrl)
      atualizarUsuarioLocal({ fotoUrl: data.fotoUrl })
    } catch (err) { avisar(mensagemDeErro(err), 'erro') } finally { setEnviandoFoto(false) }
  }
  async function removerFoto() {
    setEnviandoFoto(true)
    try {
      await api.delete('/usuarios/me/foto')
      setFotoUrl(null)
      atualizarUsuarioLocal({ fotoUrl: null })
    } catch (err) { avisar(mensagemDeErro(err), 'erro') } finally { setEnviandoFoto(false) }
  }

  function abrirNovaMarca() { setEditandoMarcaId(null); setBannerMarcaAtual(null); setFormMarca(marcaVazia) }
  function abrirEditarMarca(m: Marca) {
    setEditandoMarcaId(m.id)
    setBannerMarcaAtual(m.bannerUrl)
    setFormMarca({
      nome: m.nome, logoUrl: m.logoUrl ?? '', descricao: m.descricao ?? '', formasPagamento: m.formasPagamento ?? '',
      modoEnvio: m.modoEnvio ?? '', condicoesCompra: m.condicoesCompra ?? '', tamanhos: m.tamanhos ?? '', valores: m.valores ?? '',
      endereco: m.endereco ?? '', cnpj: m.cnpj ?? '', instagram: m.instagram ?? '', facebook: m.facebook ?? '', whatsapp: m.whatsapp ?? '',
      telegram: m.telegram ?? '', tiktok: m.tiktok ?? '', site: m.site ?? '', linkCatalogo: m.linkCatalogo ?? '',
      percentualComissaoSugerido: m.percentualComissaoSugerido != null ? String(m.percentualComissaoSugerido) : '', ativo: m.ativo,
    })
  }

  async function enviarBannerMarca(arquivo: File) {
    if (!editandoMarcaId) return
    setEnviandoBannerMarca(true)
    try {
      const fd = new FormData()
      fd.append('file', arquivo)
      const { data } = await api.post(`/assessores/minha/marcas/${editandoMarcaId}/banner`, fd, { params: { anterior: bannerMarcaAtual ?? undefined } })
      setBannerMarcaAtual(data.bannerUrl)
      carregarMarcas()
    } catch (err) { avisar(mensagemDeErro(err), 'erro') } finally { setEnviandoBannerMarca(false) }
  }
  async function removerBannerMarca() {
    if (!editandoMarcaId) return
    setEnviandoBannerMarca(true)
    try {
      await api.delete(`/assessores/minha/marcas/${editandoMarcaId}/banner`)
      setBannerMarcaAtual(null)
      carregarMarcas()
    } catch (err) { avisar(mensagemDeErro(err), 'erro') } finally { setEnviandoBannerMarca(false) }
  }

  async function salvarMarca(e: React.FormEvent) {
    e.preventDefault()
    if (!formMarca) return
    setSalvandoMarca(true)
    try {
      const payload = {
        ...formMarca,
        percentualComissaoSugerido: formMarca.percentualComissaoSugerido ? Number(formMarca.percentualComissaoSugerido) : null,
      }
      if (editandoMarcaId) await api.patch(`/assessores/minha/marcas/${editandoMarcaId}`, payload)
      else await api.post('/assessores/minha/marcas', payload)
      avisar('Marca salva.')
      setFormMarca(null); setEditandoMarcaId(null)
      carregarMarcas()
    } catch (e2) { avisar(mensagemDeErro(e2), 'erro') } finally { setSalvandoMarca(false) }
  }

  async function excluirMarca(id: string) {
    if (!window.confirm('Excluir esta marca? As vendas lançadas para ela também serão apagadas.')) return
    try {
      await api.delete(`/assessores/minha/marcas/${id}`)
      carregarMarcas(); carregarVendas()
    } catch (e) { avisar(mensagemDeErro(e), 'erro') }
  }

  function abrirNovaVenda(marcaId?: string) {
    const marca = marcas.find((m) => m.id === marcaId) ?? marcas[0]
    setFormVenda({
      assessorMarcaId: marca?.id ?? '', data: hoje(), valorVenda: '',
      percentualComissao: marca?.percentualComissaoSugerido != null ? String(marca.percentualComissaoSugerido) : '', observacao: '',
    })
  }

  async function salvarVenda(e: React.FormEvent) {
    e.preventDefault()
    if (!formVenda) return
    setSalvandoVenda(true)
    try {
      await api.post('/assessores/minha/vendas', {
        assessorMarcaId: formVenda.assessorMarcaId, data: formVenda.data,
        valorVenda: Number(formVenda.valorVenda), percentualComissao: Number(formVenda.percentualComissao),
        observacao: formVenda.observacao || null,
      })
      avisar('Venda lançada.')
      setFormVenda(null)
      carregarVendas()
    } catch (e2) { avisar(mensagemDeErro(e2), 'erro') } finally { setSalvandoVenda(false) }
  }

  async function excluirVenda(id: string) {
    if (!window.confirm('Excluir este lançamento de venda?')) return
    try {
      await api.delete(`/assessores/minha/vendas/${id}`)
      carregarVendas()
    } catch (e) { avisar(mensagemDeErro(e), 'erro') }
  }

  async function exportar(formato: 'csv' | 'txt' | 'xlsx' | 'pdf') {
    try {
      const { data } = await api.get('/assessores/minha/vendas/exportar', {
        params: { de: filtroDe || undefined, ate: filtroAte || undefined, marcaId: filtroMarca || undefined, formato },
        responseType: 'blob',
      })
      const url = URL.createObjectURL(data as Blob)
      const a = document.createElement('a')
      a.href = url; a.download = `vendas-${perfil?.slug ?? 'brand-partner'}.${formato}`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    } catch (e) { avisar(mensagemDeErro(e), 'erro') }
  }

  const linkPublico = perfil ? `https://${perfil.slug}.zaieze.com` : ''
  const totalComissaoFiltro = vendas.reduce((s, v) => s + v.totalComissao, 0)

  if (!perfil) return <div style={{ padding: 24, color: 'var(--ink-soft)' }}>Carregando…</div>

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h1 style={{ margin: 0 }}>Painel do Brand Partner</h1>
          <span style={{ color: 'var(--ink-soft)', fontSize: 13 }}>{usuario?.nome}</span>
        </div>
        <button className="btn secundario" onClick={sair}>Sair</button>
      </header>

      <div className="cartao" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Sua vitrine pública:</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input readOnly value={linkPublico} style={{ flex: '1 1 220px', minWidth: 0 }} />
          <button type="button" className="btn secundario" onClick={() => { navigator.clipboard?.writeText(linkPublico); avisar('Link copiado.') }}>Copiar</button>
          <a className="btn" href={HOST.tipo === 'landing' ? `${linkPublico}?vitrine=1` : `${linkPublico}?tenant=${perfil.slug}&vitrine=1`} target="_blank" rel="noreferrer">Ver vitrine</a>
          <button type="button" className="btn secundario" onClick={() => setPreview(true)}>Visualizar vitrine</button>
        </div>
      </div>

      <nav style={{ display: 'flex', gap: 8, margin: '16px 0', flexWrap: 'wrap' }}>
        {([['marcas', 'Marcas representadas'], ['vendas', 'Vendas & comissão'], ['perfil', 'Meu perfil'], ['indicacao', 'Indicar lojistas'], ['assinatura', 'Minha assinatura']] as const).map(([id, label]) => (
          <button key={id} type="button" className={aba === id ? 'btn' : 'btn secundario'} onClick={() => setAba(id)}>{label}</button>
        ))}
      </nav>

      {aba === 'indicacao' && (
        <div className="cartao">
          <h2 style={{ marginTop: 0 }}>Indicar lojistas para o ZAIEZE</h2>
          {!indicacao ? (
            <p style={{ color: 'var(--ink-soft)' }}>Carregando…</p>
          ) : (
            <>
              <p style={{ color: 'var(--ink-soft)', fontSize: 13 }}>
                Compartilhe este link com lojistas que você conhece. Quando um deles assinar um plano
                ZAIEZE por esse link, você ganha <strong>{indicacao.percentual}%</strong> de comissão{' '}
                <strong>recorrente</strong> — enquanto a loja continuar assinando, todo ciclo pago gera
                comissão pra você. O repasse é combinado e feito manualmente pelo ZAIEZE.
              </p>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
                <input readOnly value={`https://zaieze.com/checkout?refAssessor=${indicacao.slug}`} style={{ minWidth: 320, flex: 1 }} />
                <button
                  type="button" className="btn secundario"
                  onClick={() => { navigator.clipboard?.writeText(`https://zaieze.com/checkout?refAssessor=${indicacao.slug}`); avisar('Link copiado.') }}
                >
                  Copiar
                </button>
              </div>
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                <div><div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Cliques no link</div><div style={{ fontSize: 22, fontWeight: 700 }}>{indicacao.cliques}</div></div>
                <div><div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Lojistas indicados</div><div style={{ fontSize: 22, fontWeight: 700 }}>{indicacao.redesIndicadas}</div></div>
                <div><div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Comissão pendente</div><div style={{ fontSize: 22, fontWeight: 700 }}>{formataReal(indicacao.pendente)}</div></div>
                <div><div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Comissão já paga</div><div style={{ fontSize: 22, fontWeight: 700 }}>{formataReal(indicacao.paga)}</div></div>
              </div>
            </>
          )}
        </div>
      )}

      {aba === 'assinatura' && (
        <div className="cartao">
          <h2 style={{ marginTop: 0 }}>Minha assinatura</h2>
          {!assinatura ? (
            <p style={{ color: 'var(--ink-soft)' }}>Carregando…</p>
          ) : !assinatura.existe ? (
            <p style={{ color: 'var(--ink-soft)' }}>Sua conta não tem uma assinatura própria vinculada (criada diretamente pela ZAIEZE).</p>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ fontSize: 18 }}>
                  <strong>{formataReal(assinatura.valor)}</strong>/mês ·{' '}
                  <span className={`selo ${assinatura.status === 'ATIVA' ? 'ok' : assinatura.status === 'CANCELADA' ? 'baixo' : 'ATACADO'}`}>
                    {assinatura.status}
                  </span>
                  {assinatura.simulada && <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}> (simulada)</span>}
                </div>
                <div style={{ fontSize: 13, color: assinatura.cancelamentoSolicitadoEm ? 'var(--danger)' : 'var(--ink-soft)', marginTop: 4 }}>
                  {assinatura.status === 'PENDENTE' && 'Aguardando confirmação do pagamento pelo Mercado Pago.'}
                  {assinatura.status === 'CANCELADA' && 'Assinatura encerrada.'}
                  {assinatura.status === 'ATIVA' && assinatura.cancelamentoSolicitadoEm && assinatura.cicloFimEm &&
                    `Cancelamento agendado — acesso até ${new Date(assinatura.cicloFimEm).toLocaleDateString('pt-BR')}.`}
                  {assinatura.status === 'ATIVA' && !assinatura.cancelamentoSolicitadoEm && assinatura.cicloFimEm &&
                    `Renova em ${new Date(assinatura.cicloFimEm).toLocaleDateString('pt-BR')}.`}
                </div>
              </div>
              {assinatura.status === 'ATIVA' && (
                assinatura.cancelamentoSolicitadoEm
                  ? <button className="btn" onClick={reativarAssinatura} disabled={ocupadoAssinatura}>Reativar</button>
                  : <button className="btn secundario" onClick={cancelarAssinatura} disabled={ocupadoAssinatura}>Cancelar assinatura</button>
              )}
            </div>
          )}
        </div>
      )}

      {aba === 'perfil' && (
        <>
          <div className="cartao" style={{ display: 'flex', alignItems: 'center', gap: 16, maxWidth: 520 }}>
            {fotoUrl
              ? <img src={fotoUrl} alt="" style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover' }} />
              : <span style={{ width: 72, height: 72, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 24, color: '#fff', background: 'linear-gradient(135deg, #c9a25f, #8a6a35)' }}>{(usuario?.nome ?? '?').slice(0, 1).toUpperCase()}</span>}
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>Foto de perfil</div>
              <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 8 }}>É a foto grande da capa da sua vitrine.</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="btn" disabled={enviandoFoto} onClick={() => fotoRef.current?.click()}>{enviandoFoto ? 'Enviando…' : '📷 Trocar foto'}</button>
                {fotoUrl && <button type="button" className="btn secundario" disabled={enviandoFoto} onClick={removerFoto}>Remover</button>}
              </div>
              <input ref={fotoRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) enviarFoto(f); e.target.value = '' }} />
            </div>
          </div>

          <form className="cartao" onSubmit={salvarPerfil}>
            <h2 style={{ marginTop: 0 }}>Apresentação (capa da vitrine)</h2>
            <div className="campo">
              <label>Frase de efeito (tagline)</label>
              <input value={tagline} onChange={(e) => setTagline(e.target.value)} maxLength={140} placeholder="Ex.: Conectando estilos, criando histórias." />
            </div>
            <div className="campo">
              <label>Bio / apresentação</label>
              <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={4} maxLength={600} placeholder="Conte quem você é e como trabalha com as marcas que representa." />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
              <input type="checkbox" checked={disponivel} onChange={(e) => setDisponivel(e.target.checked)} />
              Disponível (mostra o selo "Disponível" na vitrine)
            </label>
            <div className="linha-campos">
              <div className="campo"><label>WhatsApp pessoal</label><input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="Ex.: 5562999999999" /></div>
              <div className="campo"><label>Telefone (botão "Ligar")</label><input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="Ex.: 5562999999999" /></div>
              <div className="campo"><label>Instagram pessoal</label><input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="https://instagram.com/..." /></div>
              <div className="campo"><label>Site</label><input value={site} onChange={(e) => setSite(e.target.value)} placeholder="https://..." /></div>
            </div>
            <div style={{ marginTop: 8, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 8 }}>
                Estatísticas exibidas na vitrine (autodeclaradas, sem verificação — deixe em branco para não exibir).
              </div>
              <div className="linha-campos">
                <div className="campo"><label>Produtos (número)</label><input type="number" min={0} value={statProdutos} onChange={(e) => setStatProdutos(e.target.value)} /></div>
                <div className="campo"><label>Clientes (número)</label><input type="number" min={0} value={statClientes} onChange={(e) => setStatClientes(e.target.value)} /></div>
                <div className="campo"><label>Avaliação (0 a 5)</label><input type="number" min={0} max={5} step="0.1" value={statAvaliacao} onChange={(e) => setStatAvaliacao(e.target.value)} /></div>
              </div>
            </div>
            <div className="acoes"><button className="btn" disabled={salvandoPerfil}>Salvar</button></div>
          </form>
        </>
      )}

      {aba === 'marcas' && (
        <div className="cartao">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ marginTop: 0 }}>Marcas que você representa</h2>
            <button className="btn" onClick={abrirNovaMarca}>+ Nova marca</button>
          </div>
          {marcas.length === 0 && <p style={{ color: 'var(--ink-soft)' }}>Nenhuma marca cadastrada ainda.</p>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
            {marcas.map((m) => (
              <div key={m.id} className="cartao" style={{ opacity: m.ativo && !m.recusadoEm ? 1 : 0.55 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <strong>{m.nome}</strong>
                  {!m.ativo && <span style={{ fontSize: 11, color: 'var(--ink-soft)' }}>oculta</span>}
                </div>
                {m.redeId && !m.autorizadoEm && !m.recusadoEm && (
                  <div style={{ fontSize: 12, color: '#d97706', marginTop: 4 }}>Aguardando aprovação da marca</div>
                )}
                {m.recusadoEm && (
                  <div style={{ fontSize: 12, color: '#dc2626', marginTop: 4 }}>Solicitação recusada pela marca</div>
                )}
                {m.valores && <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{m.valores}</div>}
                <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                  <button type="button" className="btn-link" onClick={() => abrirEditarMarca(m)}>editar</button>
                  <button type="button" className="btn-link" onClick={() => abrirNovaVenda(m.id)}>lançar venda</button>
                  <button type="button" className="btn-link" onClick={() => excluirMarca(m.id)}>excluir</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {aba === 'vendas' && (
        <>
          <div className="cartao" style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="campo"><label>De</label><input type="date" value={filtroDe} onChange={(e) => setFiltroDe(e.target.value)} /></div>
            <div className="campo"><label>Até</label><input type="date" value={filtroAte} onChange={(e) => setFiltroAte(e.target.value)} /></div>
            <div className="campo">
              <label>Marca</label>
              <select value={filtroMarca} onChange={(e) => setFiltroMarca(e.target.value)}>
                <option value="">Todas</option>
                {marcas.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select>
            </div>
            <button className="btn" style={{ marginLeft: 'auto' }} onClick={() => abrirNovaVenda()} disabled={marcas.length === 0}>+ Lançar venda</button>
          </div>

          <div className="cartao">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <h2 style={{ margin: 0 }}>Vendas lançadas</h2>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn secundario" onClick={() => exportar('csv')}>CSV</button>
                <button type="button" className="btn secundario" onClick={() => exportar('txt')}>TXT</button>
                <button type="button" className="btn secundario" onClick={() => exportar('xlsx')}>XLSX</button>
                <button type="button" className="btn secundario" onClick={() => exportar('pdf')}>PDF</button>
              </div>
            </div>
            <table>
              <thead><tr><th>Data</th><th>Marca</th><th>Valor da venda</th><th>% comissão</th><th>Total comissão</th><th></th></tr></thead>
              <tbody>
                {vendas.map((v) => (
                  <tr key={v.id}>
                    <td>{fmtData(v.data)}</td>
                    <td>{v.marca}</td>
                    <td>{formataReal(v.valorVenda)}</td>
                    <td>{v.percentualComissao}%</td>
                    <td><strong>{formataReal(v.totalComissao)}</strong></td>
                    <td><button type="button" className="btn-link" onClick={() => excluirVenda(v.id)}>excluir</button></td>
                  </tr>
                ))}
                {vendas.length === 0 && <tr><td colSpan={6} style={{ color: 'var(--ink-soft)' }}>Nenhuma venda lançada no período.</td></tr>}
              </tbody>
              {vendas.length > 0 && (
                <tfoot><tr><td colSpan={4} style={{ textAlign: 'right', fontWeight: 700 }}>Total do período</td><td style={{ fontWeight: 700 }}>{formataReal(totalComissaoFiltro)}</td><td /></tr></tfoot>
              )}
            </table>
          </div>
        </>
      )}

      {formMarca && (
        <div className="modal-fundo" onClick={() => setFormMarca(null)}>
          <form className="modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()} onSubmit={salvarMarca}>
            <h2>{editandoMarcaId ? 'Editar marca' : 'Nova marca'}</h2>
            <div className="linha-campos">
              <div className="campo"><label>Nome da marca*</label><input value={formMarca.nome} onChange={(e) => setFormMarca({ ...formMarca, nome: e.target.value })} required /></div>
              <div className="campo"><label>Logo (URL)</label><input value={formMarca.logoUrl} onChange={(e) => setFormMarca({ ...formMarca, logoUrl: e.target.value })} /></div>
            </div>
            <div className="campo">
              <label>Banner (imagem grande do card na vitrine)</label>
              {editandoMarcaId ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {bannerMarcaAtual
                    ? <img src={bannerMarcaAtual} alt="" style={{ width: 120, height: 90, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
                    : <div style={{ width: 120, height: 90, borderRadius: 8, border: '1px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--ink-soft)' }}>sem banner</div>}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" className="btn secundario" disabled={enviandoBannerMarca} onClick={() => bannerMarcaRef.current?.click()}>{enviandoBannerMarca ? 'Enviando…' : 'Trocar banner'}</button>
                    {bannerMarcaAtual && <button type="button" className="btn secundario" disabled={enviandoBannerMarca} onClick={removerBannerMarca}>Remover</button>}
                  </div>
                  <input ref={bannerMarcaRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) enviarBannerMarca(f); e.target.value = '' }} />
                </div>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Salve a marca primeiro para poder enviar o banner.</div>
              )}
            </div>
            <div className="campo">
              <label>Link do catálogo (se a marca já for cliente ZAIEZE)</label>
              <input value={formMarca.linkCatalogo} onChange={(e) => setFormMarca({ ...formMarca, linkCatalogo: e.target.value })} placeholder="https://loja.zaieze.com/vendedora" />
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>Aparece como botão "Ver catálogo" na janela de links da vitrine — você ajuda o cliente a fechar direto no site da marca.</div>
            </div>
            <div className="campo"><label>Descrição (1 item por linha)</label><textarea rows={3} value={formMarca.descricao} onChange={(e) => setFormMarca({ ...formMarca, descricao: e.target.value })} placeholder={'Fabricação própria\nTecido premium'} /></div>
            <div className="linha-campos">
              <div className="campo"><label>Formas de pagamento (1 por linha)</label><textarea rows={2} value={formMarca.formasPagamento} onChange={(e) => setFormMarca({ ...formMarca, formasPagamento: e.target.value })} /></div>
              <div className="campo"><label>Modo de envio (1 por linha)</label><textarea rows={2} value={formMarca.modoEnvio} onChange={(e) => setFormMarca({ ...formMarca, modoEnvio: e.target.value })} /></div>
            </div>
            <div className="campo"><label>Condições de compra (1 por linha)</label><textarea rows={2} value={formMarca.condicoesCompra} onChange={(e) => setFormMarca({ ...formMarca, condicoesCompra: e.target.value })} placeholder={'Mínimo 12 peças\nNão precisa CNPJ'} /></div>
            <div className="linha-campos">
              <div className="campo"><label>Tamanhos</label><input value={formMarca.tamanhos} onChange={(e) => setFormMarca({ ...formMarca, tamanhos: e.target.value })} placeholder="P ao GG" /></div>
              <div className="campo"><label>Valores</label><input value={formMarca.valores} onChange={(e) => setFormMarca({ ...formMarca, valores: e.target.value })} placeholder="De R$ 59,90 a R$ 299,90" /></div>
            </div>
            <div className="linha-campos">
              <div className="campo"><label>Endereço</label><input value={formMarca.endereco} onChange={(e) => setFormMarca({ ...formMarca, endereco: e.target.value })} /></div>
              <div className="campo"><label>CNPJ</label><input value={formMarca.cnpj} onChange={(e) => setFormMarca({ ...formMarca, cnpj: e.target.value })} /></div>
            </div>
            <div className="linha-campos">
              <div className="campo"><label>Instagram</label><input value={formMarca.instagram} onChange={(e) => setFormMarca({ ...formMarca, instagram: e.target.value })} placeholder="https://instagram.com/..." /></div>
              <div className="campo"><label>Facebook</label><input value={formMarca.facebook} onChange={(e) => setFormMarca({ ...formMarca, facebook: e.target.value })} /></div>
            </div>
            <div className="linha-campos">
              <div className="campo"><label>WhatsApp</label><input value={formMarca.whatsapp} onChange={(e) => setFormMarca({ ...formMarca, whatsapp: e.target.value })} placeholder="5562999999999" /></div>
              <div className="campo"><label>Telegram</label><input value={formMarca.telegram} onChange={(e) => setFormMarca({ ...formMarca, telegram: e.target.value })} /></div>
            </div>
            <div className="linha-campos">
              <div className="campo"><label>TikTok</label><input value={formMarca.tiktok} onChange={(e) => setFormMarca({ ...formMarca, tiktok: e.target.value })} /></div>
              <div className="campo"><label>Site</label><input value={formMarca.site} onChange={(e) => setFormMarca({ ...formMarca, site: e.target.value })} /></div>
            </div>
            <div className="linha-campos">
              <div className="campo"><label>% comissão sugerido</label><input type="number" min={0} max={100} step="0.5" value={formMarca.percentualComissaoSugerido} onChange={(e) => setFormMarca({ ...formMarca, percentualComissaoSugerido: e.target.value })} /></div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 20 }}>
                <input type="checkbox" checked={formMarca.ativo} onChange={(e) => setFormMarca({ ...formMarca, ativo: e.target.checked })} />
                Exibir na vitrine pública
              </label>
            </div>
            <div className="acoes">
              <button type="button" className="btn secundario" onClick={() => setFormMarca(null)}>Cancelar</button>
              <button className="btn" disabled={salvandoMarca}>{salvandoMarca ? '…' : 'Salvar'}</button>
            </div>
          </form>
        </div>
      )}

      {formVenda && (
        <div className="modal-fundo" onClick={() => setFormVenda(null)}>
          <form className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()} onSubmit={salvarVenda}>
            <h2>Lançar venda</h2>
            <div className="campo">
              <label>Marca*</label>
              <select value={formVenda.assessorMarcaId} onChange={(e) => setFormVenda({ ...formVenda, assessorMarcaId: e.target.value })} required>
                <option value="">— Selecione —</option>
                {marcas.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select>
            </div>
            <div className="linha-campos">
              <div className="campo"><label>Data*</label><input type="date" value={formVenda.data} onChange={(e) => setFormVenda({ ...formVenda, data: e.target.value })} required /></div>
              <div className="campo"><label>Valor da venda (R$)*</label><input type="number" min={0} step="0.01" value={formVenda.valorVenda} onChange={(e) => setFormVenda({ ...formVenda, valorVenda: e.target.value })} required /></div>
            </div>
            <div className="campo"><label>% de comissão*</label><input type="number" min={0} max={100} step="0.5" value={formVenda.percentualComissao} onChange={(e) => setFormVenda({ ...formVenda, percentualComissao: e.target.value })} required /></div>
            <div className="campo"><label>Observação</label><input value={formVenda.observacao} onChange={(e) => setFormVenda({ ...formVenda, observacao: e.target.value })} /></div>
            <div className="acoes">
              <button type="button" className="btn secundario" onClick={() => setFormVenda(null)}>Cancelar</button>
              <button className="btn" disabled={salvandoVenda}>{salvandoVenda ? '…' : 'Lançar'}</button>
            </div>
          </form>
        </div>
      )}

      {preview && (
        <PreviewVitrine
          nome={usuario?.nome ?? ''} fotoUrl={fotoUrl} tagline={tagline} bio={bio} disponivel={disponivel}
          totalMarcas={marcas.length} statProdutos={statProdutos} statClientes={statClientes} statAvaliacao={statAvaliacao}
          onClose={() => setPreview(false)}
        />
      )}
    </div>
  )
}
