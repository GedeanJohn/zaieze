import { useEffect, useRef, useState } from 'react'
import { ExternalLink, Eye } from 'lucide-react'
import { api, formataReal, mensagemDeErro, usuarioLogado, atualizarUsuarioLocal } from '../../api'
import { useToast } from '../../componentes/Toast'
import PreviewVitrine from '../../componentes/PreviewVitrine'
import { HOST } from '../../host'

type PlanoAssessor = 'BASICO' | 'AVANCADO'
interface Periodo { inicio: string; fim: string }
interface HorarioDia { diaSemana: number; periodos: Periodo[] }
interface Perfil {
  slug: string; bio: string | null; tagline: string | null
  disponivel: boolean; seguirAgenda: boolean; disponivelAgora: boolean; horarios: HorarioDia[]
  whatsapp: string | null; instagram: string | null; site: string | null
  statProdutos: number | null; statClientes: number
  plano: PlanoAssessor; limites: { fotos: number; videos: number }
}
interface AssessorCliente { id: string; nome: string; telefone: string | null; createdAt: string }
const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
interface Avaliacao {
  id: string; nota: number; comentario: string | null; nomeCliente: string | null
  status: 'PENDENTE' | 'APROVADA' | 'RECUSADA'; createdAt: string
}
interface Lancamento {
  id: string; nome: string; fotoUrl: string | null; preco: number | null; descricao: string | null
  ativo: boolean; createdAt: string; assessorMarcaId: string; assessorMarca: { id: string; nome: string }
}
interface Midia { id: string; tipo: 'FOTO' | 'VIDEO'; url: string; ordem: number }
interface WhatsappMarca { id: string; numero: string; rotulo: string | null }
interface Marca {
  id: string; redeId: string | null; nome: string; logoUrl: string | null; bannerUrl: string | null
  midias: Midia[]
  descricao: string | null; formasPagamento: string | null; modoEnvio: string | null; condicoesCompra: string | null
  tamanhos: string | null; valores: string | null; endereco: string | null; cnpj: string | null
  instagram: string | null; facebook: string | null; whatsapps: WhatsappMarca[]; telegram: string | null; tiktok: string | null; site: string | null
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
  nome: '', descricao: '', formasPagamento: '', modoEnvio: '', condicoesCompra: '',
  tamanhos: '', valores: '', endereco: '', cnpj: '', instagram: '', facebook: '', telegram: '', tiktok: '', site: '', linkCatalogo: '',
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
  const [aba, setAba] = useState<'perfil' | 'marcas' | 'vendas' | 'avaliacoes' | 'lancamentos' | 'clientes' | 'indicacao' | 'assinatura'>('marcas')

  const [assinatura, setAssinatura] = useState<Assinatura | null>(null)
  const [ocupadoAssinatura, setOcupadoAssinatura] = useState(false)
  const [precosPlano, setPrecosPlano] = useState<{ precoMensalBasico: number; precoMensalAvancado: number } | null>(null)
  const [trocandoPlano, setTrocandoPlano] = useState(false)

  const [indicacao, setIndicacao] = useState<Indicacao | null>(null)

  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [bio, setBio] = useState(''); const [whatsapp, setWhatsapp] = useState('')
  const [instagram, setInstagram] = useState(''); const [site, setSite] = useState('')
  const [tagline, setTagline] = useState(''); const [disponivel, setDisponivel] = useState(true)
  const [seguirAgenda, setSeguirAgenda] = useState(true)
  const [disponivelAgora, setDisponivelAgora] = useState(true)
  const [horarios, setHorarios] = useState<HorarioDia[]>([])
  const [salvandoHorarios, setSalvandoHorarios] = useState(false)
  const [statProdutos, setStatProdutos] = useState('')
  const [salvandoPerfil, setSalvandoPerfil] = useState(false)
  const [preview, setPreview] = useState(false)
  const [avaliacoes, setAvaliacoes] = useState<Avaliacao[]>([])
  const [ocupadoAvaliacaoId, setOcupadoAvaliacaoId] = useState<string | null>(null)
  const [clientes, setClientes] = useState<AssessorCliente[]>([])
  const [novoClienteNome, setNovoClienteNome] = useState('')
  const [novoClienteTelefone, setNovoClienteTelefone] = useState('')
  const [salvandoCliente, setSalvandoCliente] = useState(false)

  // Foto de perfil (exibida na capa da vitrine pública) — mesmo endpoint genérico de Conta.tsx.
  const [fotoUrl, setFotoUrl] = useState<string | null>(usuario?.fotoUrl ?? null)
  const [enviandoFoto, setEnviandoFoto] = useState(false)
  const fotoRef = useRef<HTMLInputElement>(null)

  const [marcas, setMarcas] = useState<Marca[]>([])
  const [formMarca, setFormMarca] = useState<typeof marcaVazia | null>(null)
  const [editandoMarcaId, setEditandoMarcaId] = useState<string | null>(null)
  const [logoMarcaAtual, setLogoMarcaAtual] = useState<string | null>(null)
  const [enviandoLogoMarca, setEnviandoLogoMarca] = useState(false)
  const logoMarcaRef = useRef<HTMLInputElement>(null)
  const [bannerMarcaAtual, setBannerMarcaAtual] = useState<string | null>(null)
  const [enviandoBannerMarca, setEnviandoBannerMarca] = useState(false)
  const bannerMarcaRef = useRef<HTMLInputElement>(null)
  const [midiasAtual, setMidiasAtual] = useState<Midia[]>([])
  const [enviandoFotoMidia, setEnviandoFotoMidia] = useState(false)
  const [enviandoVideo, setEnviandoVideo] = useState(false)
  const fotoMidiaRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLInputElement>(null)
  const [salvandoMarca, setSalvandoMarca] = useState(false)
  const [whatsappsAtual, setWhatsappsAtual] = useState<WhatsappMarca[]>([])
  const [novoWhatsappNumero, setNovoWhatsappNumero] = useState('')
  const [novoWhatsappRotulo, setNovoWhatsappRotulo] = useState('')
  const [salvandoWhatsappMarca, setSalvandoWhatsappMarca] = useState(false)

  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [formLancamento, setFormLancamento] = useState<{ assessorMarcaId: string; nome: string; preco: string; descricao: string } | null>(null)
  const [editandoLancamentoId, setEditandoLancamentoId] = useState<string | null>(null)
  const [salvandoLancamento, setSalvandoLancamento] = useState(false)
  const fotoLancamentoRef = useRef<HTMLInputElement>(null)

  const [vendas, setVendas] = useState<Venda[]>([])
  const [filtroDe, setFiltroDe] = useState(''); const [filtroAte, setFiltroAte] = useState(''); const [filtroMarca, setFiltroMarca] = useState('')
  const [formVenda, setFormVenda] = useState<{ assessorMarcaId: string; data: string; valorVenda: string; percentualComissao: string; observacao: string } | null>(null)
  const [salvandoVenda, setSalvandoVenda] = useState(false)

  function carregarPerfil() {
    api.get('/assessores/minha').then(({ data }) => {
      setPerfil(data); setBio(data.bio ?? ''); setWhatsapp(data.whatsapp ?? ''); setInstagram(data.instagram ?? ''); setSite(data.site ?? '')
      setTagline(data.tagline ?? ''); setDisponivel(data.disponivel)
      setSeguirAgenda(data.seguirAgenda); setDisponivelAgora(data.disponivelAgora); setHorarios(data.horarios)
      setStatProdutos(data.statProdutos != null ? String(data.statProdutos) : '')
    }).catch((e) => avisar(mensagemDeErro(e), 'erro'))
  }
  function carregarClientes() {
    api.get('/assessores/minha/clientes').then(({ data }) => setClientes(data)).catch(() => {})
  }
  async function adicionarCliente(e: React.FormEvent) {
    e.preventDefault()
    if (!novoClienteNome.trim()) return
    setSalvandoCliente(true)
    try {
      await api.post('/assessores/minha/clientes', { nome: novoClienteNome.trim(), telefone: novoClienteTelefone.trim() || null })
      setNovoClienteNome(''); setNovoClienteTelefone('')
      carregarClientes(); carregarPerfil()
    } catch (e2) { avisar(mensagemDeErro(e2), 'erro') } finally { setSalvandoCliente(false) }
  }
  async function removerCliente(id: string) {
    if (!window.confirm('Remover este cliente da contagem do seu perfil?')) return
    try { await api.delete(`/assessores/minha/clientes/${id}`); carregarClientes(); carregarPerfil() }
    catch (e) { avisar(mensagemDeErro(e), 'erro') }
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
  function carregarAvaliacoes() {
    api.get('/assessores/minha/avaliacoes').then(({ data }) => setAvaliacoes(data)).catch(() => {})
  }
  async function moderarAvaliacao(id: string, acao: 'aprovar' | 'recusar') {
    setOcupadoAvaliacaoId(id)
    try {
      await api.post(`/assessores/minha/avaliacoes/${id}/${acao}`)
      carregarAvaliacoes()
    } catch (e) { avisar(mensagemDeErro(e), 'erro') } finally { setOcupadoAvaliacaoId(null) }
  }
  function carregarLancamentos() {
    api.get('/assessores/minha/lancamentos').then(({ data }) => setLancamentos(data)).catch(() => {})
  }
  function abrirNovoLancamento() {
    setEditandoLancamentoId(null)
    setFormLancamento({ assessorMarcaId: marcas[0]?.id ?? '', nome: '', preco: '', descricao: '' })
  }
  function abrirEditarLancamento(l: Lancamento) {
    setEditandoLancamentoId(l.id)
    setFormLancamento({ assessorMarcaId: l.assessorMarcaId, nome: l.nome, preco: l.preco != null ? String(l.preco) : '', descricao: l.descricao ?? '' })
  }
  async function salvarLancamento(e: React.FormEvent) {
    e.preventDefault()
    if (!formLancamento) return
    setSalvandoLancamento(true)
    try {
      const payload = {
        assessorMarcaId: formLancamento.assessorMarcaId, nome: formLancamento.nome,
        preco: formLancamento.preco !== '' ? Number(formLancamento.preco) : null,
        descricao: formLancamento.descricao || null,
      }
      if (editandoLancamentoId) {
        await api.patch(`/assessores/minha/lancamentos/${editandoLancamentoId}`, payload)
        setFormLancamento(null); setEditandoLancamentoId(null)
      } else {
        // Fica no modal, agora em modo edição, pra ela poder subir a foto na sequência.
        const { data } = await api.post('/assessores/minha/lancamentos', payload)
        setEditandoLancamentoId(data.id)
      }
      carregarLancamentos()
      avisar('Lançamento salvo.')
    } catch (e2) { avisar(mensagemDeErro(e2), 'erro') } finally { setSalvandoLancamento(false) }
  }
  async function excluirLancamento(id: string) {
    if (!window.confirm('Excluir este lançamento?')) return
    try { await api.delete(`/assessores/minha/lancamentos/${id}`); carregarLancamentos() } catch (e) { avisar(mensagemDeErro(e), 'erro') }
  }
  async function alternarAtivoLancamento(l: Lancamento) {
    try { await api.patch(`/assessores/minha/lancamentos/${l.id}`, { ativo: !l.ativo }); carregarLancamentos() } catch (e) { avisar(mensagemDeErro(e), 'erro') }
  }
  async function enviarFotoLancamento(id: string, arquivo: File) {
    const fd = new FormData(); fd.append('file', arquivo)
    try { await api.post(`/assessores/minha/lancamentos/${id}/foto`, fd); carregarLancamentos() } catch (e) { avisar(mensagemDeErro(e), 'erro') }
  }
  useEffect(() => { carregarPerfil(); carregarMarcas(); carregarAssinatura(); carregarIndicacao(); carregarAvaliacoes(); carregarLancamentos(); carregarClientes() }, [])
  useEffect(() => { api.get('/assessores/plano').then(({ data }) => setPrecosPlano(data)).catch(() => {}) }, [])

  async function trocarPlano(novoPlano: PlanoAssessor) {
    if (!window.confirm(`Trocar para o plano ${novoPlano === 'AVANCADO' ? 'Avançado' : 'Básico'}? O valor da sua assinatura muda a partir da próxima cobrança.`)) return
    setTrocandoPlano(true)
    try {
      await api.post('/assessores/minha/trocar-plano', { plano: novoPlano })
      avisar('Plano atualizado.')
      carregarPerfil(); carregarAssinatura()
    } catch (e) { avisar(mensagemDeErro(e), 'erro') } finally { setTrocandoPlano(false) }
  }
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
        tagline: tagline || null, disponivel, seguirAgenda,
        statProdutos: statProdutos !== '' ? Number(statProdutos) : null,
      })
      avisar('Perfil salvo.')
      carregarPerfil()
    } catch (e2) { avisar(mensagemDeErro(e2), 'erro') } finally { setSalvandoPerfil(false) }
  }

  function adicionarPeriodo(diaSemana: number) {
    setHorarios((hs) => hs.map((h) => (h.diaSemana === diaSemana ? { ...h, periodos: [...h.periodos, { inicio: '09:00', fim: '18:00' }] } : h)))
  }
  function atualizarPeriodo(diaSemana: number, indice: number, patch: Partial<Periodo>) {
    setHorarios((hs) => hs.map((h) => (h.diaSemana === diaSemana ? { ...h, periodos: h.periodos.map((p, i) => (i === indice ? { ...p, ...patch } : p)) } : h)))
  }
  function removerPeriodo(diaSemana: number, indice: number) {
    setHorarios((hs) => hs.map((h) => (h.diaSemana === diaSemana ? { ...h, periodos: h.periodos.filter((_, i) => i !== indice) } : h)))
  }

  async function salvarHorarios() {
    setSalvandoHorarios(true)
    try {
      const { data } = await api.put('/assessores/minha/horarios', horarios)
      setHorarios(data.horarios); setDisponivelAgora(data.disponivelAgora)
      avisar('Agenda salva.')
    } catch (e) { avisar(mensagemDeErro(e), 'erro') } finally { setSalvandoHorarios(false) }
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

  function abrirNovaMarca() {
    setEditandoMarcaId(null); setLogoMarcaAtual(null); setBannerMarcaAtual(null); setMidiasAtual([]); setWhatsappsAtual([])
    setFormMarca(marcaVazia)
  }
  function abrirEditarMarca(m: Marca) {
    setEditandoMarcaId(m.id)
    setLogoMarcaAtual(m.logoUrl)
    setBannerMarcaAtual(m.bannerUrl)
    setMidiasAtual(m.midias)
    setWhatsappsAtual(m.whatsapps)
    setFormMarca({
      nome: m.nome, descricao: m.descricao ?? '', formasPagamento: m.formasPagamento ?? '',
      modoEnvio: m.modoEnvio ?? '', condicoesCompra: m.condicoesCompra ?? '', tamanhos: m.tamanhos ?? '', valores: m.valores ?? '',
      endereco: m.endereco ?? '', cnpj: m.cnpj ?? '', instagram: m.instagram ?? '', facebook: m.facebook ?? '',
      telegram: m.telegram ?? '', tiktok: m.tiktok ?? '', site: m.site ?? '', linkCatalogo: m.linkCatalogo ?? '',
      percentualComissaoSugerido: m.percentualComissaoSugerido != null ? String(m.percentualComissaoSugerido) : '', ativo: m.ativo,
    })
  }
  async function adicionarWhatsappMarca() {
    if (!editandoMarcaId || !novoWhatsappNumero.trim()) return
    setSalvandoWhatsappMarca(true)
    try {
      const { data } = await api.post(`/assessores/minha/marcas/${editandoMarcaId}/whatsapps`, {
        numero: novoWhatsappNumero.trim(), rotulo: novoWhatsappRotulo.trim() || null,
      })
      setWhatsappsAtual((atual) => [...atual, data])
      setNovoWhatsappNumero(''); setNovoWhatsappRotulo('')
      carregarMarcas()
    } catch (e2) { avisar(mensagemDeErro(e2), 'erro') } finally { setSalvandoWhatsappMarca(false) }
  }
  async function removerWhatsappMarca(whatsappId: string) {
    if (!editandoMarcaId) return
    try {
      await api.delete(`/assessores/minha/marcas/${editandoMarcaId}/whatsapps/${whatsappId}`)
      setWhatsappsAtual((atual) => atual.filter((w) => w.id !== whatsappId))
      carregarMarcas()
    } catch (e) { avisar(mensagemDeErro(e), 'erro') }
  }

  async function enviarLogoMarca(arquivo: File) {
    if (!editandoMarcaId) return
    setEnviandoLogoMarca(true)
    try {
      const fd = new FormData()
      fd.append('file', arquivo)
      const { data } = await api.post(`/assessores/minha/marcas/${editandoMarcaId}/logo`, fd, { params: { anterior: logoMarcaAtual ?? undefined } })
      setLogoMarcaAtual(data.logoUrl)
      carregarMarcas()
    } catch (err) { avisar(mensagemDeErro(err), 'erro') } finally { setEnviandoLogoMarca(false) }
  }
  async function removerLogoMarca() {
    if (!editandoMarcaId) return
    setEnviandoLogoMarca(true)
    try {
      await api.delete(`/assessores/minha/marcas/${editandoMarcaId}/logo`)
      setLogoMarcaAtual(null)
      carregarMarcas()
    } catch (err) { avisar(mensagemDeErro(err), 'erro') } finally { setEnviandoLogoMarca(false) }
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

  const fotosAtual = midiasAtual.filter((m) => m.tipo === 'FOTO')
  const videosAtual = midiasAtual.filter((m) => m.tipo === 'VIDEO')
  const limites = perfil?.limites ?? { fotos: 3, videos: 0 }

  async function enviarFotoMidia(arquivo: File) {
    if (!editandoMarcaId) return
    setEnviandoFotoMidia(true)
    try {
      const fd = new FormData()
      fd.append('file', arquivo)
      const { data } = await api.post(`/assessores/minha/marcas/${editandoMarcaId}/midia`, fd, { params: { tipo: 'FOTO' } })
      setMidiasAtual((atual) => [...atual, data])
      carregarMarcas()
    } catch (err) { avisar(mensagemDeErro(err), 'erro') } finally { setEnviandoFotoMidia(false) }
  }
  async function removerMidia(midiaId: string) {
    if (!editandoMarcaId) return
    try {
      await api.delete(`/assessores/minha/marcas/${editandoMarcaId}/midia/${midiaId}`)
      setMidiasAtual((atual) => atual.filter((m) => m.id !== midiaId))
      carregarMarcas()
    } catch (err) { avisar(mensagemDeErro(err), 'erro') }
  }

  /** Lê a duração do vídeo no navegador antes de enviar (limite de 30s pedido pelo usuário). */
  function duracaoDoVideo(arquivo: File): Promise<number> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video')
      video.preload = 'metadata'
      video.onloadedmetadata = () => { URL.revokeObjectURL(video.src); resolve(video.duration) }
      video.onerror = () => { URL.revokeObjectURL(video.src); reject(new Error('Não foi possível ler o vídeo.')) }
      video.src = URL.createObjectURL(arquivo)
    })
  }

  async function enviarVideo(arquivo: File) {
    if (!editandoMarcaId) return
    setEnviandoVideo(true)
    try {
      const duracao = await duracaoDoVideo(arquivo)
      if (duracao > 30.5) {
        avisar(`O vídeo tem ${Math.round(duracao)}s — o limite é 30 segundos.`, 'erro')
        return
      }
      const fd = new FormData()
      fd.append('file', arquivo)
      const { data } = await api.post(`/assessores/minha/marcas/${editandoMarcaId}/midia`, fd, { params: { tipo: 'VIDEO' } })
      setMidiasAtual((atual) => [...atual, data])
      carregarMarcas()
    } catch (err) { avisar(mensagemDeErro(err), 'erro') } finally { setEnviandoVideo(false) }
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
          <a
            className="btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            href={HOST.tipo === 'landing' ? `${linkPublico}?vitrine=1` : `${linkPublico}?tenant=${perfil.slug}&vitrine=1`} target="_blank" rel="noreferrer"
          >
            <ExternalLink size={15} strokeWidth={2} /> Ver página publicada
          </a>
          <button
            type="button" className="btn secundario" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            onClick={() => setPreview(true)}
          >
            <Eye size={15} strokeWidth={2} /> Pré-visualizar alterações
          </button>
        </div>
      </div>

      <nav style={{ display: 'flex', gap: 8, margin: '16px 0', flexWrap: 'wrap' }}>
        {([['marcas', 'Marcas representadas'], ['lancamentos', 'Lançamentos'], ['vendas', 'Vendas & comissão'], ['avaliacoes', 'Avaliações'], ['clientes', 'Meus Clientes'], ['perfil', 'Meu perfil'], ['indicacao', 'Indicar lojistas'], ['assinatura', 'Minha assinatura']] as const).map(([id, label]) => (
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

      {aba === 'assinatura' && perfil && (
        <div className="cartao">
          <h2 style={{ marginTop: 0 }}>Meu plano</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            {(['BASICO', 'AVANCADO'] as const).map((p) => {
              const atual = perfil.plano === p
              const preco = p === 'BASICO' ? precosPlano?.precoMensalBasico : precosPlano?.precoMensalAvancado
              const lim = p === 'BASICO' ? { fotos: 3, videos: 0 } : { fotos: 10, videos: 5 }
              return (
                <div key={p} className="cartao" style={{ margin: 0, border: atual ? '2px solid var(--accent)' : undefined }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>{p === 'BASICO' ? 'Básico' : 'Avançado'} {atual && <span className="selo ok">atual</span>}</div>
                  {preco != null && <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>{formataReal(preco)}<span style={{ fontSize: 12, fontWeight: 400, color: 'var(--ink-soft)' }}>/mês</span></div>}
                  <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 12 }}>
                    Até {lim.fotos} fotos por marca<br />
                    {lim.videos > 0 ? `Até ${lim.videos} vídeos (30s) por marca` : 'Sem vídeos'}
                  </div>
                  {!atual && (
                    <button type="button" className="btn secundario" disabled={trocandoPlano} onClick={() => trocarPlano(p)}>
                      {p === 'AVANCADO' ? 'Fazer upgrade' : 'Mudar para este'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
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
            <div style={{ marginBottom: 14, padding: 12, borderRadius: 8, background: 'var(--bg)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: (seguirAgenda ? disponivelAgora : disponivel) ? '#2e7d32' : '#999' }} />
                <strong style={{ fontSize: 14 }}>Agora: {(seguirAgenda ? disponivelAgora : disponivel) ? 'Disponível' : 'Offline'}</strong>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400 }}>
                <input type="checkbox" checked={seguirAgenda} onChange={(e) => setSeguirAgenda(e.target.checked)} />
                Seguir a agenda semanal automaticamente (configure abaixo)
              </label>
              {!seguirAgenda && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400, marginTop: 8 }}>
                  <input type="checkbox" checked={disponivel} onChange={(e) => setDisponivel(e.target.checked)} />
                  Marcar manualmente como Disponível agora
                </label>
              )}
            </div>
            <div className="linha-campos">
              <div className="campo"><label>WhatsApp pessoal</label><input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="Ex.: 5562999999999" /></div>
              <div className="campo"><label>Instagram pessoal</label><input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="https://instagram.com/..." /></div>
              <div className="campo"><label>Site</label><input value={site} onChange={(e) => setSite(e.target.value)} placeholder="https://..." /></div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: -6 }}>
              O botão "Ligar" da vitrine usa este mesmo número do WhatsApp.
            </div>
            <div style={{ marginTop: 8, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 8 }}>
                Estatística exibida na vitrine (autodeclarada, sem verificação — deixe em branco para não exibir).
                A nota de avaliação não é editável aqui: ela é calculada automaticamente a partir das
                avaliações de clientes aprovadas na aba "Avaliações". Já "Clientes" também não é mais
                digitado aqui — é a contagem de quem você marcar na aba "Meus Clientes".
              </div>
              <div className="linha-campos">
                <div className="campo"><label>Produtos (número)</label><input type="number" min={0} value={statProdutos} onChange={(e) => setStatProdutos(e.target.value)} /></div>
              </div>
            </div>
            <div className="acoes"><button className="btn" disabled={salvandoPerfil}>Salvar</button></div>
          </form>

          <div className="cartao">
            <h2 style={{ marginTop: 0 }}>Agenda semanal</h2>
            <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 0 }}>
              Defina os horários em que você atende. Quando "Seguir a agenda semanal" estiver marcado acima,
              o selo da vitrine muda sozinho entre Disponível e Offline conforme esse horário (fuso de Brasília).
            </p>
            {horarios.map((h) => (
              <div key={h.diaSemana} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0', borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
                <div style={{ width: 100, fontWeight: 600, fontSize: 14, paddingTop: 6 }}>{DIAS_SEMANA[h.diaSemana]}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 260 }}>
                  {h.periodos.length === 0 && <span style={{ fontSize: 13, color: 'var(--ink-soft)', paddingTop: 6 }}>Fechado</span>}
                  {h.periodos.map((p, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="time" value={p.inicio} onChange={(e) => atualizarPeriodo(h.diaSemana, i, { inicio: e.target.value })} style={{ width: 110 }} />
                      <span style={{ color: 'var(--ink-soft)' }}>até</span>
                      <input type="time" value={p.fim} onChange={(e) => atualizarPeriodo(h.diaSemana, i, { fim: e.target.value })} style={{ width: 110 }} />
                      <button type="button" onClick={() => removerPeriodo(h.diaSemana, i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)', fontSize: 13 }}>remover</button>
                    </div>
                  ))}
                  <button type="button" onClick={() => adicionarPeriodo(h.diaSemana)} className="btn secundario" style={{ alignSelf: 'flex-start', padding: '4px 10px', fontSize: 12 }}>
                    + Adicionar horário
                  </button>
                </div>
              </div>
            ))}
            <div className="acoes">
              <button type="button" className="btn" disabled={salvandoHorarios} onClick={salvarHorarios}>{salvandoHorarios ? 'Salvando…' : 'Salvar agenda'}</button>
            </div>
          </div>
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

      {aba === 'avaliacoes' && (
        <div className="cartao">
          <h2 style={{ marginTop: 0 }}>Avaliações de atendimento</h2>
          <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 0 }}>
            Avaliações enviadas pelos clientes na sua vitrine pública (nota de 1 a 5 + comentário curto).
            Aprove para que entrem na sua nota exibida e nos depoimentos públicos.
          </p>
          {avaliacoes.length === 0 && <p className="dica">Nenhuma avaliação recebida ainda.</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {avaliacoes.map((a) => (
              <div key={a.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div>
                    <strong style={{ color: '#c9a25f' }}>{'★'.repeat(a.nota)}{'☆'.repeat(5 - a.nota)}</strong>{' '}
                    <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
                      {a.nomeCliente || 'Cliente anônimo'} · {new Date(a.createdAt).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                  <span style={{
                    fontSize: 12, fontWeight: 700,
                    color: a.status === 'APROVADA' ? 'var(--ok)' : a.status === 'RECUSADA' ? 'var(--danger)' : 'var(--warn)',
                  }}>
                    {a.status === 'PENDENTE' ? 'Pendente' : a.status === 'APROVADA' ? 'Aprovada' : 'Recusada'}
                  </span>
                </div>
                {a.comentario && <p style={{ margin: '8px 0 0', fontSize: 14 }}>{a.comentario}</p>}
                {a.status === 'PENDENTE' && (
                  <div className="acoes" style={{ marginTop: 10 }}>
                    <button type="button" className="btn secundario" disabled={ocupadoAvaliacaoId === a.id} onClick={() => moderarAvaliacao(a.id, 'recusar')}>Recusar</button>
                    <button type="button" className="btn" disabled={ocupadoAvaliacaoId === a.id} onClick={() => moderarAvaliacao(a.id, 'aprovar')}>Aprovar</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {aba === 'clientes' && (
        <div className="cartao">
          <h2 style={{ marginTop: 0 }}>Meus Clientes</h2>
          <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 0 }}>
            O WhatsApp da vitrine abre a conversa fora do sistema, sem rastreio automático — marque aqui
            quem virou cliente pra contar no "{clientes.length}+" exibido no seu perfil público. Quem você
            não marcar, não entra na contagem.
          </p>
          <form onSubmit={adicionarCliente} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            <input value={novoClienteNome} onChange={(e) => setNovoClienteNome(e.target.value)} placeholder="Nome do cliente" style={{ flex: 1, minWidth: 160 }} />
            <input value={novoClienteTelefone} onChange={(e) => setNovoClienteTelefone(e.target.value)} placeholder="Telefone (opcional)" style={{ flex: 1, minWidth: 160 }} />
            <button type="submit" className="btn" disabled={salvandoCliente || !novoClienteNome.trim()}>{salvandoCliente ? 'Salvando…' : '+ Adicionar cliente'}</button>
          </form>
          {clientes.length === 0 && <p className="dica">Nenhum cliente marcado ainda.</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {clientes.map((c) => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px' }}>
                <div>
                  <strong>{c.nome}</strong>
                  {c.telefone && <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}> · {c.telefone}</span>}
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>desde {new Date(c.createdAt).toLocaleDateString('pt-BR')}</div>
                </div>
                <button type="button" className="btn-link" onClick={() => removerCliente(c.id)}>remover</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {aba === 'lancamentos' && (
        <div className="cartao">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ marginTop: 0 }}>Lançamentos</h2>
            <button className="btn" onClick={abrirNovoLancamento} disabled={marcas.length === 0}>+ Novo lançamento</button>
          </div>
          <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 0 }}>
            Destaque modelos das marcas que você representa na página de Lançamentos da sua vitrine pública.
            Na vitrine, aparecem primeiro os lançamentos das marcas com maior comissão sugerida.
          </p>
          {marcas.length === 0 && <p style={{ color: 'var(--ink-soft)' }}>Cadastre uma marca representada antes de criar um lançamento.</p>}
          {marcas.length > 0 && lancamentos.length === 0 && <p style={{ color: 'var(--ink-soft)' }}>Nenhum lançamento cadastrado ainda.</p>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {lancamentos.map((l) => (
              <div key={l.id} className="cartao" style={{ opacity: l.ativo ? 1 : 0.55 }}>
                {l.fotoUrl
                  ? <img src={l.fotoUrl} alt={l.nome} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 8, marginBottom: 8 }} />
                  : <div style={{ width: '100%', aspectRatio: '1', borderRadius: 8, marginBottom: 8, background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-soft)', fontSize: 12 }}>sem foto</div>}
                <strong>{l.nome}</strong>
                <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{l.assessorMarca.nome}{l.preco != null ? ` · ${formataReal(l.preco)}` : ''}</div>
                {!l.ativo && <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>oculto</div>}
                <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                  <button type="button" className="btn-link" onClick={() => abrirEditarLancamento(l)}>editar</button>
                  <button type="button" className="btn-link" onClick={() => alternarAtivoLancamento(l)}>{l.ativo ? 'ocultar' : 'exibir'}</button>
                  <button type="button" className="btn-link" onClick={() => excluirLancamento(l.id)}>excluir</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {formLancamento && (
        <div className="modal-fundo" onClick={() => setFormLancamento(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editandoLancamentoId ? 'Editar lançamento' : 'Novo lançamento'}</h2>
            <form onSubmit={salvarLancamento} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="campo">
                <label>Marca*</label>
                <select value={formLancamento.assessorMarcaId} onChange={(e) => setFormLancamento({ ...formLancamento, assessorMarcaId: e.target.value })} required>
                  {marcas.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                </select>
              </div>
              <div className="campo"><label>Nome da peça*</label><input value={formLancamento.nome} onChange={(e) => setFormLancamento({ ...formLancamento, nome: e.target.value })} required /></div>
              <div className="campo"><label>Preço (opcional)</label><input type="number" step="0.01" min="0" value={formLancamento.preco} onChange={(e) => setFormLancamento({ ...formLancamento, preco: e.target.value })} /></div>
              <div className="campo"><label>Descrição (opcional)</label><textarea rows={2} value={formLancamento.descricao} onChange={(e) => setFormLancamento({ ...formLancamento, descricao: e.target.value })} /></div>
              <div className="acoes">
                <button type="button" className="btn secundario" onClick={() => setFormLancamento(null)}>Cancelar</button>
                <button className="btn" disabled={salvandoLancamento}>{salvandoLancamento ? 'Salvando…' : 'Salvar'}</button>
              </div>
            </form>
            {editandoLancamentoId && (
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                <label>Foto</label>
                <div className="upload-caixa">
                  {(() => {
                    const atual = lancamentos.find((l) => l.id === editandoLancamentoId)
                    return atual?.fotoUrl ? <img className="upload-preview" src={atual.fotoUrl} alt="" /> : <div className="upload-preview sem-imagem">sem foto</div>
                  })()}
                  <button type="button" className="btn secundario" onClick={() => fotoLancamentoRef.current?.click()}>Trocar foto</button>
                  <input
                    ref={fotoLancamentoRef} type="file" accept="image/png,image/jpeg" hidden
                    onChange={(e) => { const f = e.target.files?.[0]; if (f && editandoLancamentoId) enviarFotoLancamento(editandoLancamentoId, f); e.target.value = '' }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {formMarca && (
        <div className="modal-fundo" onClick={() => setFormMarca(null)}>
          <form className="modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()} onSubmit={salvarMarca}>
            <h2>{editandoMarcaId ? 'Editar marca' : 'Nova marca'}</h2>
            <div className="campo"><label>Nome da marca*</label><input value={formMarca.nome} onChange={(e) => setFormMarca({ ...formMarca, nome: e.target.value })} required /></div>
            <div className="campo">
              <label>Logo (imagem pequena da marca)</label>
              {editandoMarcaId ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {logoMarcaAtual
                    ? <img src={logoMarcaAtual} alt="" style={{ width: 72, height: 72, objectFit: 'contain', borderRadius: 8, border: '1px solid var(--border)', background: '#fafafa' }} />
                    : <div style={{ width: 72, height: 72, borderRadius: 8, border: '1px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--ink-soft)', textAlign: 'center' }}>sem logo</div>}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" className="btn secundario" disabled={enviandoLogoMarca} onClick={() => logoMarcaRef.current?.click()}>{enviandoLogoMarca ? 'Enviando…' : 'Trocar logo'}</button>
                    {logoMarcaAtual && <button type="button" className="btn secundario" disabled={enviandoLogoMarca} onClick={removerLogoMarca}>Remover</button>}
                  </div>
                  <input ref={logoMarcaRef} type="file" accept="image/png,image/jpeg" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) enviarLogoMarca(f); e.target.value = '' }} />
                </div>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Salve a marca primeiro para poder enviar a logo.</div>
              )}
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
                  <input ref={bannerMarcaRef} type="file" accept="image/png,image/jpeg" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) enviarBannerMarca(f); e.target.value = '' }} />
                </div>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Salve a marca primeiro para poder enviar o banner.</div>
              )}
            </div>
            <div className="campo">
              <label>Fotos de destaque dos produtos (até {limites.fotos} no plano {perfil?.plano === 'AVANCADO' ? 'Avançado' : 'Básico'})</label>
              {editandoMarcaId ? (
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  {fotosAtual.map((m) => (
                    <div key={m.id} style={{ textAlign: 'center' }}>
                      <img src={m.url} alt="" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)', display: 'block' }} />
                      <button type="button" className="btn-link" onClick={() => removerMidia(m.id)}>excluir</button>
                    </div>
                  ))}
                  {fotosAtual.length < limites.fotos ? (
                    <div style={{ textAlign: 'center' }}>
                      <button
                        type="button" onClick={() => fotoMidiaRef.current?.click()} disabled={enviandoFotoMidia}
                        style={{ width: 80, height: 80, borderRadius: 8, border: '1px dashed var(--border)', background: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: 'var(--ink-soft)', cursor: 'pointer' }}
                      >
                        {enviandoFotoMidia ? '…' : '+'}
                      </button>
                      <input ref={fotoMidiaRef} type="file" accept="image/png,image/jpeg" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) enviarFotoMidia(f); e.target.value = '' }} />
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--ink-soft)', maxWidth: 140, alignSelf: 'center' }}>
                      Limite de {limites.fotos} fotos do plano atingido{perfil?.plano === 'BASICO' ? ' — faça upgrade pra Avançado pra ter mais.' : '.'}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Salve a marca primeiro para poder enviar as fotos.</div>
              )}
            </div>
            <div className="campo">
              <label>Vídeos curtos de destaque (até 30s cada{limites.videos > 0 ? `, até ${limites.videos} no plano ${perfil?.plano === 'AVANCADO' ? 'Avançado' : 'Básico'}` : ''})</label>
              {!editandoMarcaId ? (
                <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Salve a marca primeiro para poder enviar vídeos.</div>
              ) : limites.videos === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Vídeos são exclusivos do plano Avançado — veja em "Minha assinatura".</div>
              ) : (
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  {videosAtual.map((m) => (
                    <div key={m.id} style={{ textAlign: 'center' }}>
                      <video src={m.url} controls style={{ width: 140, height: 90, borderRadius: 8, border: '1px solid var(--border)', background: '#000' }} />
                      <div><button type="button" className="btn-link" onClick={() => removerMidia(m.id)}>excluir</button></div>
                    </div>
                  ))}
                  {videosAtual.length < limites.videos ? (
                    <div style={{ textAlign: 'center' }}>
                      <button type="button" className="btn secundario" disabled={enviandoVideo} onClick={() => videoRef.current?.click()}>{enviandoVideo ? 'Enviando…' : '+ Vídeo'}</button>
                      <input ref={videoRef} type="file" accept="video/mp4,video/webm,video/quicktime" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) enviarVideo(f); e.target.value = '' }} />
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--ink-soft)', maxWidth: 140, alignSelf: 'center' }}>Limite de {limites.videos} vídeos do plano atingido.</div>
                  )}
                </div>
              )}
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>Limite de 30 segundos por vídeo, verificado no navegador antes do envio.</div>
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
            <div className="campo">
              <label>WhatsApp (um ou mais números)</label>
              {editandoMarcaId ? (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                    {whatsappsAtual.map((w) => (
                      <div key={w.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px' }}>
                        <span>{w.numero}{w.rotulo && <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}> — {w.rotulo}</span>}</span>
                        <button type="button" className="btn-link" onClick={() => removerWhatsappMarca(w.id)}>remover</button>
                      </div>
                    ))}
                    {whatsappsAtual.length === 0 && <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Nenhum número cadastrado ainda.</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input value={novoWhatsappNumero} onChange={(e) => setNovoWhatsappNumero(e.target.value)} placeholder="5562999999999" style={{ flex: 1, minWidth: 140 }} />
                    <input value={novoWhatsappRotulo} onChange={(e) => setNovoWhatsappRotulo(e.target.value)} placeholder="Rótulo (opcional, ex.: Atendimento)" style={{ flex: 1, minWidth: 140 }} />
                    <button type="button" className="btn secundario" disabled={salvandoWhatsappMarca || !novoWhatsappNumero.trim()} onClick={adicionarWhatsappMarca}>{salvandoWhatsappMarca ? '…' : '+ Adicionar'}</button>
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Salve a marca primeiro para poder adicionar números de WhatsApp.</div>
              )}
            </div>
            <div className="linha-campos">
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
          nome={usuario?.nome ?? ''} fotoUrl={fotoUrl} tagline={tagline} bio={bio} disponivel={seguirAgenda ? disponivelAgora : disponivel}
          totalMarcas={marcas.length} statProdutos={statProdutos} statClientes={perfil?.statClientes ? String(perfil.statClientes) : ''}
          onClose={() => setPreview(false)}
        />
      )}
    </div>
  )
}
