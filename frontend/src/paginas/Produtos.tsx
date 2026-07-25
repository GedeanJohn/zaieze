import { useCallback, useEffect, useState } from 'react'
import { api, mensagemDeErro, usuarioLogado } from '../api'
import { useLojaAtiva } from '../componentes/SeletorLoja'
import EtiquetasModal, { type ProdutoEtq } from '../componentes/EtiquetasModal'
import { useIdioma } from '../lib/i18n'

/** Sanitiza um campo de valor monetário digitado à mão: aceita vírgula OU ponto como separador
 *  decimal (só um), descarta o resto. Mantém o separador tal como o usuário digitou (não força
 *  virar ponto na tela) — só a conversão para Number no envio troca vírgula por ponto. */
function sanitizarMoeda(v: string): string {
  let s = v.replace(/[^0-9,.]/g, '')
  const i = s.search(/[,.]/)
  if (i !== -1) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/[,.]/g, '')
  return s
}

/** Converte um valor monetário digitado (com vírgula ou ponto) para number. */
function moedaParaNumero(v: string | null | undefined): number | undefined {
  if (!v || !v.trim()) return undefined
  const n = Number(v.replace(',', '.'))
  return Number.isNaN(n) ? undefined : n
}

interface Variacao {
  id?: string
  cor: string
  estampa: string
  tamanho: string
  livre?: boolean // transitório (UI): tamanho em modo "Outro" (texto livre); não é enviado ao backend
  sku?: string
  codigoBarras?: string | null
  estoque: number
  estoqueMinimo: number
  estoqueVarejo?: number // reserva exclusiva de varejo (≤ estoque)
}

interface Produto {
  id: string
  referencia?: string | null
  nome: string
  genero: string
  descricao?: string | null
  precoVarejo: string
  precoAtacado?: string | null
  custo?: string | null
  composicao?: string | null
  modelagem?: string | null
  ncm?: string | null
  fornecedor?: string | null
  pesoGramas?: number | null
  faixaEtaria?: string | null
  destaque?: boolean
  destaqueEspecial?: boolean
  categoria?: { nome: string } | null
  marca?: { nome: string } | null
  colecao?: { nome: string } | null
  fotos?: string[]
  fotosCores?: string[]
  videos?: string[]
  ativo: boolean
  variacoes: Variacao[]
}

interface FormProduto {
  id?: string
  referencia?: string
  nome: string
  genero: string
  descricao?: string
  categoria?: string
  marca?: string
  colecao?: string
  precoVarejo: string
  precoAtacado?: string
  custo?: string
  composicao?: string
  modelagem?: string
  ncm?: string
  fornecedor?: string
  pesoGramas?: string
  faixaEtaria?: string
  destaque: boolean
  destaqueEspecial: boolean
  fotos: string[]
  fotosCores: string[]
  videos: string[]
  variacoes: Variacao[]
}

const VARIACAO_VAZIA: Variacao = { cor: '', estampa: '', tamanho: '', codigoBarras: '', estoque: 0, estoqueMinimo: 2, estoqueVarejo: 0 }

// Tamanhos sugeridos (Brasil) — viram um menu de seleção (funciona no mobile, ao contrário do datalist);
// a opção "Outro…" libera digitação para tamanhos fora desta lista.
// Letras (roupa) + numéricas (roupa/jeans 36–56) + calçado/infantil (16–46) + Único.
const TAMANHOS_SUGERIDOS = [
  'PP', 'P', 'M', 'G', 'GG', 'XG', 'XGG', 'G1', 'G2', 'G3', 'Único',
  '16', '17', '18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '31', '32',
  '33', '34', '35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46', '48', '50', '52', '54', '56',
]

// Sugestões de estampa/padronagem — campo opcional e texto livre; só autocomplete.
const ESTAMPAS_SUGERIDAS = [
  'Liso', 'Floral', 'Paisley', 'Listrado', 'Xadrez', 'Poá', 'Animal Print',
  'Geométrico', 'Étnico', 'Mandala', 'Tie-dye', 'Abstrato', 'Estampado',
]

const CODIGOS_GENERO = ['FEMININO', 'MASCULINO', 'UNISSEX', 'INFANTIL'] as const
function generos(t: (chave: string) => string): [string, string][] {
  return CODIGOS_GENERO.map((c) => [c, t(`prod.genero.${c.toLowerCase()}`)])
}
function rotuloGenero(codigo: string, t: (chave: string) => string): string {
  return t(`prod.genero.${codigo.toLowerCase()}`)
}

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
}

export default function Produtos() {
  const usuario = usuarioLogado()!
  const gerente = usuario.role !== 'VENDEDORA'
  const escopo = useLojaAtiva()
  const { t } = useIdioma()
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [busca, setBusca] = useState('')
  const [form, setForm] = useState<FormProduto | null>(null)
  const [erro, setErro] = useState('')
  const [enviandoFoto, setEnviandoFoto] = useState(false)
  const [enviandoVideo, setEnviandoVideo] = useState(false)
  const [colecoes, setColecoes] = useState<{ id: string; nome: string }[]>([])
  const [etiquetas, setEtiquetas] = useState<ProdutoEtq | null>(null)

  function abrirEtiquetas(p: Produto) {
    setEtiquetas({
      id: p.id,
      nome: p.nome,
      referencia: p.referencia,
      precoVarejo: p.precoVarejo,
      precoAtacado: p.precoAtacado,
      variacoes: p.variacoes.map((v) => ({
        id: v.id!, cor: v.cor, estampa: v.estampa, tamanho: v.tamanho, codigoBarras: v.codigoBarras ?? null, estoque: v.estoque,
      })),
    })
  }

  const carregar = useCallback(async () => {
    if (!escopo.pronto) return
    const params = { ...escopo.params, ativo: 'true', ...(busca ? { busca } : {}) }
    const { data } = await api.get('/produtos', { params })
    setProdutos(data)
  }, [busca, escopo.pronto, escopo.params])

  async function excluir(p: Produto) {
    if (!confirm(t('prod.confirmExcluir', { nome: p.nome }))) return
    try {
      const { data } = await api.delete(`/produtos/${p.id}`, { params: escopo.params })
      if (data?.desativado) alert(t('prod.desativadoAviso'))
      carregar()
    } catch (e) { alert(mensagemDeErro(e)) }
  }

  useEffect(() => { carregar() }, [carregar])

  // Coleções da marca (para o select no cadastro de produto).
  useEffect(() => {
    if (!escopo.pronto) return
    api.get('/produtos/taxonomias/listar', { params: escopo.params })
      .then(({ data }) => setColecoes(data.colecoes ?? []))
      .catch(() => { /* sem taxonomias */ })
  }, [escopo.pronto, escopo.params])

  function estoqueTotal(p: Produto) {
    return p.variacoes.reduce((s, v) => s + v.estoque, 0)
  }
  function temEstoqueBaixo(p: Produto) {
    return p.variacoes.some((v) => v.estoque <= v.estoqueMinimo)
  }

  function abrirNovo() {
    setErro('')
    setForm({ nome: '', genero: 'FEMININO', referencia: '', precoVarejo: '', destaque: false, destaqueEspecial: false, fotos: [], fotosCores: [], videos: [], variacoes: [{ ...VARIACAO_VAZIA }] })
  }

  function abrirEdicao(p: Produto) {
    setErro('')
    setForm({
      id: p.id,
      referencia: p.referencia ?? '',
      nome: p.nome,
      genero: p.genero,
      descricao: p.descricao ?? '',
      categoria: p.categoria?.nome ?? '',
      marca: p.marca?.nome ?? '',
      colecao: p.colecao?.nome ?? '',
      precoVarejo: p.precoVarejo,
      precoAtacado: p.precoAtacado ?? '',
      custo: p.custo ?? '',
      composicao: p.composicao ?? '',
      modelagem: p.modelagem ?? '',
      ncm: p.ncm ?? '',
      fornecedor: p.fornecedor ?? '',
      pesoGramas: p.pesoGramas != null ? String(p.pesoGramas) : '',
      faixaEtaria: p.faixaEtaria ?? '',
      destaque: p.destaque ?? false,
      destaqueEspecial: p.destaqueEspecial ?? false,
      fotos: p.fotos ?? [],
      fotosCores: (p.fotos ?? []).map((_, i) => p.fotosCores?.[i] ?? ''),
      videos: p.videos ?? [],
      variacoes: p.variacoes.map((v) => ({ ...v, codigoBarras: v.codigoBarras ?? '' })),
    })
  }

  function sugerirReferencia() {
    if (!form) return
    const base = [form.colecao, form.categoria, form.nome]
      .filter(Boolean)
      .map((s) => norm(s as string).slice(0, 8))
      .join('-')
    setForm({ ...form, referencia: base })
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return
    setErro('')
    const precoVarejo = moedaParaNumero(form.precoVarejo)
    if (!precoVarejo || precoVarejo <= 0) { setErro(t('prod.precoVarejoObrigatorio')); return }
    const limpa = (s?: string) => (s && s.trim() ? s.trim() : undefined)
    const corpo = {
      referencia: limpa(form.referencia),
      nome: form.nome,
      genero: form.genero,
      descricao: limpa(form.descricao),
      categoria: limpa(form.categoria),
      marca: limpa(form.marca),
      colecao: limpa(form.colecao),
      precoVarejo,
      precoAtacado: moedaParaNumero(form.precoAtacado),
      custo: moedaParaNumero(form.custo),
      composicao: limpa(form.composicao),
      modelagem: limpa(form.modelagem),
      ncm: limpa(form.ncm),
      fornecedor: limpa(form.fornecedor),
      pesoGramas: form.pesoGramas ? Number(form.pesoGramas) : undefined,
      faixaEtaria: limpa(form.faixaEtaria),
      destaque: form.destaque,
      destaqueEspecial: form.destaqueEspecial,
      fotos: form.fotos,
      fotosCores: form.fotos.map((_, i) => form.fotosCores[i] ?? ''),
      videos: form.videos,
      variacoes: form.variacoes.map((v) => ({
        cor: v.cor,
        estampa: (v.estampa ?? '').trim(),
        tamanho: v.tamanho,
        codigoBarras: limpa(v.codigoBarras ?? ''),
        estoque: Number(v.estoque),
        estoqueMinimo: Number(v.estoqueMinimo),
        estoqueVarejo: Math.min(Number(v.estoqueVarejo ?? 0), Number(v.estoque)),
      })),
    }
    try {
      if (form.id) await api.patch(`/produtos/${form.id}`, corpo, { params: escopo.params })
      else await api.post('/produtos', corpo, { params: escopo.params })
      setForm(null)
      carregar()
    } catch (err) {
      setErro(mensagemDeErro(err))
    }
  }

  async function enviarFotos(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivos = e.target.files
    if (!arquivos || !arquivos.length || !form) return
    setEnviandoFoto(true)
    setErro('')
    try {
      const novas: string[] = []
      for (const arquivo of Array.from(arquivos)) {
        const fd = new FormData()
        fd.append('file', arquivo)
        const { data } = await api.post('/midia/imagem', fd, { params: escopo.params })
        novas.push(data.url)
      }
      setForm((f) => (f ? { ...f, fotos: [...f.fotos, ...novas], fotosCores: [...f.fotosCores, ...novas.map(() => '')] } : f))
    } catch (err) {
      setErro(mensagemDeErro(err))
    } finally {
      setEnviandoFoto(false)
      e.target.value = ''
    }
  }

  async function enviarVideos(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivos = e.target.files
    if (!arquivos || !arquivos.length || !form) return
    setEnviandoVideo(true)
    setErro('')
    try {
      const novas: string[] = []
      for (const arquivo of Array.from(arquivos)) {
        const fd = new FormData()
        fd.append('file', arquivo)
        const { data } = await api.post('/midia/video', fd, { params: escopo.params })
        novas.push(data.url)
      }
      setForm((f) => (f ? { ...f, videos: [...f.videos, ...novas] } : f))
    } catch (err) {
      setErro(mensagemDeErro(err))
    } finally {
      setEnviandoVideo(false)
      e.target.value = ''
    }
  }

  function mudarVariacao(i: number, campo: keyof Variacao, valor: string) {
    if (!form) return
    const numerico = campo === 'estoque' || campo === 'estoqueMinimo' || campo === 'estoqueVarejo'
    const variacoes = form.variacoes.map((v, idx) =>
      idx === i ? { ...v, [campo]: numerico ? Number(valor) : valor } : v,
    )
    setForm({ ...form, variacoes })
  }

  return (
    <>
      <header>
        <h1>{t('prod.titulo')}</h1>
        {gerente && <button className="btn" onClick={abrirNovo} disabled={!escopo.pronto}>{t('prod.novoProduto')}</button>}
      </header>

      <div className="cartao">
        <div className="campo">
          <label>{t('prod.buscarLabel')}</label>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={t('prod.buscarPlaceholder')} />
        </div>
        <table>
          <thead>
            <tr><th>{t('prod.colRef')}</th><th>{t('prod.colModelo')}</th><th>{t('prod.colGenero')}</th><th>{t('prod.colTipo')}</th><th>{t('prod.colPrecoVarejo')}</th><th>{t('prod.colGrade')}</th><th>{t('prod.colEstoque')}</th><th></th></tr>
          </thead>
          <tbody>
            {produtos.map((p) => (
              <tr key={p.id}>
                <td style={{ fontFamily: 'Consolas, monospace', fontSize: 12 }}>{p.referencia ?? '—'}</td>
                <td>{p.nome}</td>
                <td style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{rotuloGenero(p.genero, t)}</td>
                <td>{p.categoria?.nome ?? '—'}</td>
                <td>R$ {Number(p.precoVarejo).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
                  {p.variacoes.map((v) => `${v.cor}${v.estampa ? ` ${v.estampa}` : ''} ${v.tamanho} (${v.estoque})`).join(' · ')}
                </td>
                <td>
                  <span className={`selo ${temEstoqueBaixo(p) ? 'baixo' : 'ok'}`}>
                    {estoqueTotal(p)} un{temEstoqueBaixo(p) ? ' ⚠' : ''}
                  </span>
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>{gerente && <>
                  <a href="#" onClick={(e) => { e.preventDefault(); abrirEdicao(p) }}>{t('prod.editarLink')}</a>
                  {' · '}
                  <a href="#" onClick={(e) => { e.preventDefault(); abrirEtiquetas(p) }}>{t('prod.etiquetasLink')}</a>
                  {' · '}
                  <a href="#" style={{ color: 'var(--danger)' }} onClick={(e) => { e.preventDefault(); excluir(p) }}>{t('prod.excluirLink')}</a>
                </>}</td>
              </tr>
            ))}
            {produtos.length === 0 && (
              <tr><td colSpan={8} style={{ color: 'var(--ink-soft)' }}>{t('prod.nenhumProdutoEncontrado')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {form && (
        <div className="modal-fundo" onClick={() => setForm(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={salvar} style={{ width: 'min(960px, 96vw)' }}>
            <h2>{form.id ? t('prod.editarProduto') : t('prod.novoProdutoTitulo')}</h2>
            {erro && <div className="alerta">{erro}</div>}

            {/* Coleção: a peça/modelo é vinculada a uma das coleções já criadas (em Coleções). */}
            <div className="campo">
              <label>{t('prod.colecaoLabel')}</label>
              <select value={form.colecao ?? ''} onChange={(e) => setForm({ ...form, colecao: e.target.value })}>
                <option value="">{colecoes.length ? t('prod.selecioneColecao') : t('prod.nenhumaColecaoCriada')}</option>
                {colecoes.map((c) => <option key={c.id} value={c.nome}>{c.nome}</option>)}
              </select>
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>{t('prod.escolhaColecaoTexto')}</div>
            </div>

            {/* Essenciais */}
            <div className="linha-campos">
              <div className="campo">
                <label>
                  {t('prod.referenciaLabel')}{' '}
                  <button type="button" className="btn-link" onClick={sugerirReferencia}>{t('prod.sugerir')}</button>
                </label>
                <input
                  value={form.referencia ?? ''}
                  onChange={(e) => setForm({ ...form, referencia: e.target.value })}
                  placeholder={t('prod.referenciaPlaceholder')}
                />
              </div>
              <div className="campo">
                <label>{t('prod.nomeModeloLabel')}</label>
                <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder={t('prod.nomeModeloPlaceholder')} required />
              </div>
            </div>
            <div className="linha-campos">
              <div className="campo">
                <label>{t('prod.generoLabel')}</label>
                <select value={form.genero} onChange={(e) => setForm({ ...form, genero: e.target.value })}>
                  {generos(t).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div className="campo">
                <label>{t('prod.tipoLabel')}</label>
                <input value={form.categoria ?? ''} onChange={(e) => setForm({ ...form, categoria: e.target.value })} placeholder={t('prod.tipoPlaceholder')} />
              </div>
              <div className="campo">
                <label>{t('prod.precoVarejoLabel')}</label>
                <input type="text" inputMode="decimal" placeholder="0,00" value={form.precoVarejo} onChange={(e) => setForm({ ...form, precoVarejo: sanitizarMoeda(e.target.value) })} onFocus={(e) => e.target.select()} onMouseUp={(e) => e.preventDefault()} required />
              </div>
            </div>

            <div className="linha-campos">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400 }}>
                <input type="checkbox" checked={form.destaque} onChange={(e) => setForm({ ...form, destaque: e.target.checked })} />
                {t('prod.destaqueLabel')}
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400 }}>
                <input type="checkbox" checked={form.destaqueEspecial} onChange={(e) => setForm({ ...form, destaqueEspecial: e.target.checked })} />
                {t('prod.destaqueEspecialLabel')}
              </label>
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', margin: '-6px 0 14px' }}>
              {t('prod.destaqueAjuda')} {t('prod.destaqueEspecialAjuda')}
            </div>

            {/* Fotos */}
            <h3 style={{ marginBottom: 8 }}>{t('prod.fotosTitulo')}</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              {form.fotos.map((url, i) => {
                const cores = [...new Set(form.variacoes.map((v) => v.cor.trim()).filter(Boolean))]
                return (
                  <div key={i} style={{ width: 72 }}>
                    <div style={{ position: 'relative', width: 72, height: 96 }}>
                      <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6, border: '1px solid #00000022' }} />
                      <button
                        type="button" className="remover" title={t('prod.removerFoto')}
                        style={{ position: 'absolute', top: -8, right: -8 }}
                        onClick={() => setForm({ ...form, fotos: form.fotos.filter((_, idx) => idx !== i), fotosCores: form.fotosCores.filter((_, idx) => idx !== i) })}
                      >×</button>
                    </div>
                    <select
                      value={form.fotosCores[i] ?? ''}
                      onChange={(e) => setForm({ ...form, fotosCores: form.fotos.map((_, idx) => idx === i ? e.target.value : (form.fotosCores[idx] ?? '')) })}
                      style={{ width: 72, fontSize: 11, marginTop: 4, padding: '2px 4px' }}
                      title={t('prod.corFotoTitle')}
                    >
                      <option value="">{t('prod.todas')}</option>
                      {cores.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                )
              })}
              {form.fotos.length === 0 && <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{t('prod.nenhumaFotoAinda')}</span>}
            </div>
            <label className="btn secundario" style={{ cursor: 'pointer', display: 'inline-block' }}>
              {enviandoFoto ? t('prod.enviando') : t('prod.adicionarFotos')}
              <input type="file" accept="image/*" multiple onChange={enviarFotos} disabled={enviandoFoto} style={{ display: 'none' }} />
            </label>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', margin: '4px 0 14px' }}>{t('prod.fotosExplicacao1')} <strong>{t('prod.corDestaque')}</strong> {t('prod.fotosExplicacao2')}</div>

            {/* Vídeos */}
            <h3 style={{ marginBottom: 8 }}>{t('prod.videosTitulo')}</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              {form.videos.map((url, i) => (
                <div key={i} style={{ position: 'relative', width: 120 }}>
                  <video src={url} style={{ width: '100%', borderRadius: 6, border: '1px solid #00000022' }} controls preload="metadata" />
                  <button
                    type="button" className="remover" title={t('prod.removerVideo')}
                    style={{ position: 'absolute', top: -8, right: -8 }}
                    onClick={() => setForm({ ...form, videos: form.videos.filter((_, idx) => idx !== i) })}
                  >×</button>
                </div>
              ))}
              {form.videos.length === 0 && <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{t('prod.nenhumVideoAinda')}</span>}
            </div>
            <label className="btn secundario" style={{ cursor: 'pointer', display: 'inline-block' }}>
              {enviandoVideo ? t('prod.enviandoConvertendo') : t('prod.adicionarVideo')}
              <input type="file" accept="video/*" multiple onChange={enviarVideos} disabled={enviandoVideo} style={{ display: 'none' }} />
            </label>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', margin: '4px 0 14px' }}>{t('prod.videoExplicacao')}</div>

            {/* Grade */}
            <h3 style={{ marginBottom: 8 }}>{t('prod.gradeTitulo')}</h3>
            <div className="grade-variacoes gv-head" style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
              <span>{t('prod.corLabel')}</span><span>{t('prod.estampaLabel')}</span><span>{t('prod.tamanhoLabel')}</span><span>{t('prod.codBarrasLabel')}</span><span>{t('prod.colEstoque')}</span><span title={t('prod.reservaVarejoTitle')}>{t('prod.varejoLabel')}</span><span>{t('prod.minimoLabel')}</span><span></span>
            </div>
            <datalist id="estampas-sugeridas">
              {ESTAMPAS_SUGERIDAS.map((es) => <option key={es} value={es} />)}
            </datalist>
            {form.variacoes.map((v, i) => (
              <div className="grade-variacoes" key={i}>
                <div className="gv-cell">
                  <span>{t('prod.corLabel')}</span>
                  <input value={v.cor} onChange={(e) => mudarVariacao(i, 'cor', e.target.value)} placeholder={t('prod.corPlaceholder')} required />
                </div>
                <div className="gv-cell">
                  <span>{t('prod.estampaLabel')}</span>
                  <input value={v.estampa ?? ''} onChange={(e) => mudarVariacao(i, 'estampa', e.target.value)} placeholder={t('prod.estampaPlaceholder')} list="estampas-sugeridas" />
                </div>
                <div className="gv-cell">
                  <span>{t('prod.tamanhoLabel')}</span>
                  {v.livre || (v.tamanho !== '' && !TAMANHOS_SUGERIDOS.includes(v.tamanho)) ? (
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <input
                        value={v.tamanho} onChange={(e) => mudarVariacao(i, 'tamanho', e.target.value)}
                        placeholder={t('prod.tamanhoPlaceholder')} required autoFocus style={{ flex: 1, minWidth: 0 }}
                      />
                      <button
                        type="button" title={t('prod.escolherDaLista')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--ink-soft)' }}
                        onClick={() => setForm({ ...form, variacoes: form.variacoes.map((x, idx) => idx === i ? { ...x, tamanho: '', livre: false } : x) })}
                      >↩</button>
                    </div>
                  ) : (
                    <select
                      value={v.tamanho} required
                      onChange={(e) => {
                        const val = e.target.value
                        if (val === '__outro__') setForm({ ...form, variacoes: form.variacoes.map((x, idx) => idx === i ? { ...x, tamanho: '', livre: true } : x) })
                        else mudarVariacao(i, 'tamanho', val)
                      }}
                    >
                      <option value="" disabled>{t('prod.tamanhoLabel')}</option>
                      {TAMANHOS_SUGERIDOS.map((tm) => <option key={tm} value={tm}>{tm}</option>)}
                      <option value="__outro__">{t('prod.outro')}</option>
                    </select>
                  )}
                </div>
                <div className="gv-cell">
                  <span>{t('prod.codBarrasLabel')}</span>
                  <input value={v.codigoBarras ?? ''} onChange={(e) => mudarVariacao(i, 'codigoBarras', e.target.value)} placeholder={t('prod.codBarrasPlaceholder')} />
                </div>
                <div className="gv-cell">
                  <span>{t('prod.colEstoque')}</span>
                  <input type="number" min="0" value={v.estoque} onChange={(e) => mudarVariacao(i, 'estoque', e.target.value)} onFocus={(e) => e.target.select()} onMouseUp={(e) => e.preventDefault()} />
                </div>
                <div className="gv-cell">
                  <span title={t('prod.reservaVarejoTitle')}>{t('prod.varejoLabel')}</span>
                  <input type="number" min="0" max={v.estoque} value={v.estoqueVarejo ?? 0} onChange={(e) => mudarVariacao(i, 'estoqueVarejo', e.target.value)} onFocus={(e) => e.target.select()} onMouseUp={(e) => e.preventDefault()} title={t('prod.reservaVarejoTitle2')} />
                </div>
                <div className="gv-cell">
                  <span>{t('prod.minimoLabel')}</span>
                  <input type="number" min="0" value={v.estoqueMinimo} onChange={(e) => mudarVariacao(i, 'estoqueMinimo', e.target.value)} onFocus={(e) => e.target.select()} onMouseUp={(e) => e.preventDefault()} />
                </div>
                <button
                  type="button" className="remover" title={t('prod.remover')}
                  onClick={() => setForm({ ...form, variacoes: form.variacoes.filter((_, idx) => idx !== i) })}
                  disabled={form.variacoes.length === 1}
                >×</button>
              </div>
            ))}
            <button type="button" className="btn secundario" onClick={() => setForm({ ...form, variacoes: [...form.variacoes, { ...VARIACAO_VAZIA }] })}>
              {t('prod.adicionarVariacao')}
            </button>

            {/* Opcionais */}
            <details className="mais-detalhes">
              <summary>{t('prod.maisDetalhes')}</summary>
              <div className="linha-campos">
                <div className="campo">
                  <label>{t('prod.marcaLabel')}</label>
                  <input value={form.marca ?? ''} onChange={(e) => setForm({ ...form, marca: e.target.value })} />
                </div>
              </div>
              <div className="linha-campos">
                <div className="campo">
                  <label>{t('prod.composicaoLabel')}</label>
                  <input value={form.composicao ?? ''} onChange={(e) => setForm({ ...form, composicao: e.target.value })} placeholder={t('prod.composicaoPlaceholder')} />
                </div>
                <div className="campo">
                  <label>{t('prod.modelagemLabel')}</label>
                  <input value={form.modelagem ?? ''} onChange={(e) => setForm({ ...form, modelagem: e.target.value })} placeholder={t('prod.modelagemPlaceholder')} />
                </div>
              </div>
              <div className="linha-campos">
                <div className="campo">
                  <label>{t('prod.precoAtacadoLabel')}</label>
                  <input type="text" inputMode="decimal" placeholder="0,00" value={form.precoAtacado ?? ''} onChange={(e) => setForm({ ...form, precoAtacado: sanitizarMoeda(e.target.value) })} onFocus={(e) => e.target.select()} onMouseUp={(e) => e.preventDefault()} />
                </div>
                <div className="campo">
                  <label>{t('prod.custoLabel')}</label>
                  <input type="text" inputMode="decimal" placeholder="0,00" value={form.custo ?? ''} onChange={(e) => setForm({ ...form, custo: sanitizarMoeda(e.target.value) })} onFocus={(e) => e.target.select()} onMouseUp={(e) => e.preventDefault()} />
                </div>
              </div>
              <div className="linha-campos">
                <div className="campo">
                  <label>{t('prod.fornecedorLabel')}</label>
                  <input value={form.fornecedor ?? ''} onChange={(e) => setForm({ ...form, fornecedor: e.target.value })} />
                </div>
                <div className="campo">
                  <label>{t('prod.ncmLabel')}</label>
                  <input value={form.ncm ?? ''} onChange={(e) => setForm({ ...form, ncm: e.target.value })} />
                </div>
              </div>
              <div className="linha-campos">
                <div className="campo">
                  <label>{t('prod.pesoLabel')}</label>
                  <input type="number" min="0" value={form.pesoGramas ?? ''} onChange={(e) => setForm({ ...form, pesoGramas: e.target.value })} onFocus={(e) => e.target.select()} onMouseUp={(e) => e.preventDefault()} />
                </div>
                <div className="campo">
                  <label>{t('prod.faixaEtariaLabel')}</label>
                  <input value={form.faixaEtaria ?? ''} onChange={(e) => setForm({ ...form, faixaEtaria: e.target.value })} placeholder={t('prod.faixaEtariaPlaceholder')} />
                </div>
              </div>
              <div className="campo">
                <label>{t('prod.descricaoLabel')}</label>
                <textarea rows={2} value={form.descricao ?? ''} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
              </div>
            </details>

            <div className="acoes">
              <button type="button" className="btn secundario" onClick={() => setForm(null)}>{t('comum.cancelar')}</button>
              <button className="btn">{t('comum.salvar')}</button>
            </div>
          </form>
        </div>
      )}

      {etiquetas && (
        <EtiquetasModal
          produto={etiquetas}
          params={escopo.params}
          onClose={() => setEtiquetas(null)}
          onAtualizado={carregar}
        />
      )}
    </>
  )
}
