import { useCallback, useEffect, useState } from 'react'
import { api, mensagemDeErro, usuarioLogado } from '../api'
import { SeletorLoja, useLojaAtiva } from '../componentes/SeletorLoja'

interface Variacao {
  id?: string
  cor: string
  tamanho: string
  sku?: string
  codigoBarras?: string | null
  estoque: number
  estoqueMinimo: number
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
  categoria?: { nome: string } | null
  marca?: { nome: string } | null
  colecao?: { nome: string } | null
  fotos?: string[]
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
  fotos: string[]
  videos: string[]
  variacoes: Variacao[]
}

const VARIACAO_VAZIA: Variacao = { cor: '', tamanho: '', codigoBarras: '', estoque: 0, estoqueMinimo: 2 }

const GENEROS: [string, string][] = [
  ['FEMININO', 'Feminino'],
  ['MASCULINO', 'Masculino'],
  ['UNISSEX', 'Unissex'],
  ['INFANTIL', 'Infantil'],
]
const rotuloGenero = Object.fromEntries(GENEROS) as Record<string, string>

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
}

export default function Produtos() {
  const usuario = usuarioLogado()!
  const gerente = usuario.role !== 'VENDEDORA'
  const escopo = useLojaAtiva()
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [busca, setBusca] = useState('')
  const [form, setForm] = useState<FormProduto | null>(null)
  const [erro, setErro] = useState('')
  const [enviandoFoto, setEnviandoFoto] = useState(false)
  const [enviandoVideo, setEnviandoVideo] = useState(false)

  const carregar = useCallback(async () => {
    if (!escopo.pronto) return
    const params = { ...escopo.params, ativo: 'true', ...(busca ? { busca } : {}) }
    const { data } = await api.get('/produtos', { params })
    setProdutos(data)
  }, [busca, escopo.pronto, escopo.params])

  async function excluir(p: Produto) {
    if (!confirm(`Excluir o produto "${p.nome}"? A mídia (fotos/vídeos) também será apagada. Esta ação não pode ser desfeita.`)) return
    try {
      const { data } = await api.delete(`/produtos/${p.id}`, { params: escopo.params })
      if (data?.desativado) alert('O produto tem vendas registradas, então foi desativado (some da lista) e a mídia foi apagada — o histórico de vendas é preservado.')
      carregar()
    } catch (e) { alert(mensagemDeErro(e)) }
  }

  useEffect(() => { carregar() }, [carregar])

  function estoqueTotal(p: Produto) {
    return p.variacoes.reduce((s, v) => s + v.estoque, 0)
  }
  function temEstoqueBaixo(p: Produto) {
    return p.variacoes.some((v) => v.estoque <= v.estoqueMinimo)
  }

  function abrirNovo() {
    setErro('')
    setForm({ nome: '', genero: 'FEMININO', referencia: '', precoVarejo: '', fotos: [], videos: [], variacoes: [{ ...VARIACAO_VAZIA }] })
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
      fotos: p.fotos ?? [],
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
    const limpa = (s?: string) => (s && s.trim() ? s.trim() : undefined)
    const corpo = {
      referencia: limpa(form.referencia),
      nome: form.nome,
      genero: form.genero,
      descricao: limpa(form.descricao),
      categoria: limpa(form.categoria),
      marca: limpa(form.marca),
      colecao: limpa(form.colecao),
      precoVarejo: Number(form.precoVarejo),
      precoAtacado: form.precoAtacado ? Number(form.precoAtacado) : undefined,
      custo: form.custo ? Number(form.custo) : undefined,
      composicao: limpa(form.composicao),
      modelagem: limpa(form.modelagem),
      ncm: limpa(form.ncm),
      fornecedor: limpa(form.fornecedor),
      pesoGramas: form.pesoGramas ? Number(form.pesoGramas) : undefined,
      faixaEtaria: limpa(form.faixaEtaria),
      fotos: form.fotos,
      videos: form.videos,
      variacoes: form.variacoes.map((v) => ({
        cor: v.cor,
        tamanho: v.tamanho,
        codigoBarras: limpa(v.codigoBarras ?? ''),
        estoque: Number(v.estoque),
        estoqueMinimo: Number(v.estoqueMinimo),
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
      setForm((f) => (f ? { ...f, fotos: [...f.fotos, ...novas] } : f))
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
    const numerico = campo === 'estoque' || campo === 'estoqueMinimo'
    const variacoes = form.variacoes.map((v, idx) =>
      idx === i ? { ...v, [campo]: numerico ? Number(valor) : valor } : v,
    )
    setForm({ ...form, variacoes })
  }

  return (
    <>
      <header>
        <h1>Produtos</h1>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <SeletorLoja escopo={escopo} />
          {gerente && <button className="btn" onClick={abrirNovo} disabled={!escopo.pronto}>+ Novo produto</button>}
        </div>
      </header>

      <div className="cartao">
        <div className="campo">
          <label>Buscar (nome ou referência)</label>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Ex.: Vestido ou LUNA" />
        </div>
        <table>
          <thead>
            <tr><th>Ref.</th><th>Modelo</th><th>Gênero</th><th>Tipo</th><th>Preço varejo</th><th>Grade</th><th>Estoque</th><th></th></tr>
          </thead>
          <tbody>
            {produtos.map((p) => (
              <tr key={p.id}>
                <td style={{ fontFamily: 'Consolas, monospace', fontSize: 12 }}>{p.referencia ?? '—'}</td>
                <td>{p.nome}</td>
                <td style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{rotuloGenero[p.genero] ?? p.genero}</td>
                <td>{p.categoria?.nome ?? '—'}</td>
                <td>R$ {Number(p.precoVarejo).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
                  {p.variacoes.map((v) => `${v.cor} ${v.tamanho} (${v.estoque})`).join(' · ')}
                </td>
                <td>
                  <span className={`selo ${temEstoqueBaixo(p) ? 'baixo' : 'ok'}`}>
                    {estoqueTotal(p)} un{temEstoqueBaixo(p) ? ' ⚠' : ''}
                  </span>
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>{gerente && <>
                  <a href="#" onClick={(e) => { e.preventDefault(); abrirEdicao(p) }}>editar</a>
                  {' · '}
                  <a href="#" style={{ color: 'var(--danger)' }} onClick={(e) => { e.preventDefault(); excluir(p) }}>excluir</a>
                </>}</td>
              </tr>
            ))}
            {produtos.length === 0 && (
              <tr><td colSpan={8} style={{ color: 'var(--ink-soft)' }}>Nenhum produto encontrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {form && (
        <div className="modal-fundo" onClick={() => setForm(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={salvar}>
            <h2>{form.id ? 'Editar produto' : 'Novo produto'}</h2>
            {erro && <div className="alerta">{erro}</div>}

            {/* Essenciais */}
            <div className="linha-campos">
              <div className="campo">
                <label>
                  Referência do modelo{' '}
                  <button type="button" className="btn-link" onClick={sugerirReferencia}>sugerir</button>
                </label>
                <input
                  value={form.referencia ?? ''}
                  onChange={(e) => setForm({ ...form, referencia: e.target.value })}
                  placeholder="Ex.: VP26-VESTLONG-JULIA (vazio = gerado)"
                />
              </div>
              <div className="campo">
                <label>Nome do modelo*</label>
                <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex.: Júlia" required />
              </div>
            </div>
            <div className="linha-campos">
              <div className="campo">
                <label>Gênero*</label>
                <select value={form.genero} onChange={(e) => setForm({ ...form, genero: e.target.value })}>
                  {GENEROS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div className="campo">
                <label>Tipo de peça (categoria)</label>
                <input value={form.categoria ?? ''} onChange={(e) => setForm({ ...form, categoria: e.target.value })} placeholder="Ex.: Vestido Longo" />
              </div>
              <div className="campo">
                <label>Preço varejo (R$)*</label>
                <input type="number" step="0.01" min="0.01" value={form.precoVarejo} onChange={(e) => setForm({ ...form, precoVarejo: e.target.value })} required />
              </div>
            </div>

            {/* Fotos */}
            <h3 style={{ marginBottom: 8 }}>Fotos da peça</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              {form.fotos.map((url, i) => (
                <div key={i} style={{ position: 'relative', width: 72, height: 96 }}>
                  <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6, border: '1px solid #00000022' }} />
                  <button
                    type="button" className="remover" title="Remover foto"
                    style={{ position: 'absolute', top: -8, right: -8 }}
                    onClick={() => setForm({ ...form, fotos: form.fotos.filter((_, idx) => idx !== i) })}
                  >×</button>
                </div>
              ))}
              {form.fotos.length === 0 && <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Nenhuma foto ainda.</span>}
            </div>
            <label className="btn secundario" style={{ cursor: 'pointer', display: 'inline-block' }}>
              {enviandoFoto ? 'Enviando…' : '+ Adicionar fotos'}
              <input type="file" accept="image/*" multiple onChange={enviarFotos} disabled={enviandoFoto} style={{ display: 'none' }} />
            </label>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', margin: '4px 0 14px' }}>As fotos são otimizadas e hospedadas no CDN automaticamente.</div>

            {/* Vídeos */}
            <h3 style={{ marginBottom: 8 }}>Vídeos da peça</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              {form.videos.map((url, i) => (
                <div key={i} style={{ position: 'relative', width: 120 }}>
                  <video src={url} style={{ width: '100%', borderRadius: 6, border: '1px solid #00000022' }} controls preload="metadata" />
                  <button
                    type="button" className="remover" title="Remover vídeo"
                    style={{ position: 'absolute', top: -8, right: -8 }}
                    onClick={() => setForm({ ...form, videos: form.videos.filter((_, idx) => idx !== i) })}
                  >×</button>
                </div>
              ))}
              {form.videos.length === 0 && <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Nenhum vídeo ainda.</span>}
            </div>
            <label className="btn secundario" style={{ cursor: 'pointer', display: 'inline-block' }}>
              {enviandoVideo ? 'Enviando e convertendo…' : '+ Adicionar vídeo'}
              <input type="file" accept="video/*" multiple onChange={enviarVideos} disabled={enviandoVideo} style={{ display: 'none' }} />
            </label>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', margin: '4px 0 14px' }}>O vídeo é convertido para MP4 e hospedado no CDN. Pode levar alguns segundos. Máx 60&nbsp;MB.</div>

            {/* Grade */}
            <h3 style={{ marginBottom: 8 }}>Grade (cor × tamanho)</h3>
            <div className="grade-variacoes" style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
              <span>Cor</span><span>Tamanho</span><span>Cód. barras (EAN)</span><span>Estoque</span><span>Mínimo</span><span></span>
            </div>
            {form.variacoes.map((v, i) => (
              <div className="grade-variacoes" key={i}>
                <input value={v.cor} onChange={(e) => mudarVariacao(i, 'cor', e.target.value)} placeholder="Preto" required />
                <input value={v.tamanho} onChange={(e) => mudarVariacao(i, 'tamanho', e.target.value)} placeholder="P" required />
                <input value={v.codigoBarras ?? ''} onChange={(e) => mudarVariacao(i, 'codigoBarras', e.target.value)} placeholder="opcional" />
                <input type="number" min="0" value={v.estoque} onChange={(e) => mudarVariacao(i, 'estoque', e.target.value)} />
                <input type="number" min="0" value={v.estoqueMinimo} onChange={(e) => mudarVariacao(i, 'estoqueMinimo', e.target.value)} />
                <button
                  type="button" className="remover" title="Remover"
                  onClick={() => setForm({ ...form, variacoes: form.variacoes.filter((_, idx) => idx !== i) })}
                  disabled={form.variacoes.length === 1}
                >×</button>
              </div>
            ))}
            <button type="button" className="btn secundario" onClick={() => setForm({ ...form, variacoes: [...form.variacoes, { ...VARIACAO_VAZIA }] })}>
              + Adicionar variação
            </button>

            {/* Opcionais */}
            <details className="mais-detalhes">
              <summary>Mais detalhes (opcional)</summary>
              <div className="linha-campos">
                <div className="campo">
                  <label>Marca</label>
                  <input value={form.marca ?? ''} onChange={(e) => setForm({ ...form, marca: e.target.value })} />
                </div>
                <div className="campo">
                  <label>Coleção / estação</label>
                  <input value={form.colecao ?? ''} onChange={(e) => setForm({ ...form, colecao: e.target.value })} placeholder="Ex.: Verão/Primavera 2026" />
                </div>
              </div>
              <div className="linha-campos">
                <div className="campo">
                  <label>Composição / tecido</label>
                  <input value={form.composicao ?? ''} onChange={(e) => setForm({ ...form, composicao: e.target.value })} placeholder="Ex.: 95% viscose, 5% elastano" />
                </div>
                <div className="campo">
                  <label>Modelagem / caimento</label>
                  <input value={form.modelagem ?? ''} onChange={(e) => setForm({ ...form, modelagem: e.target.value })} placeholder="Ex.: evasê, slim" />
                </div>
              </div>
              <div className="linha-campos">
                <div className="campo">
                  <label>Preço atacado (R$)</label>
                  <input type="number" step="0.01" min="0" value={form.precoAtacado ?? ''} onChange={(e) => setForm({ ...form, precoAtacado: e.target.value })} />
                </div>
                <div className="campo">
                  <label>Custo (R$)</label>
                  <input type="number" step="0.01" min="0" value={form.custo ?? ''} onChange={(e) => setForm({ ...form, custo: e.target.value })} />
                </div>
              </div>
              <div className="linha-campos">
                <div className="campo">
                  <label>Fornecedor / confecção</label>
                  <input value={form.fornecedor ?? ''} onChange={(e) => setForm({ ...form, fornecedor: e.target.value })} />
                </div>
                <div className="campo">
                  <label>NCM (fiscal)</label>
                  <input value={form.ncm ?? ''} onChange={(e) => setForm({ ...form, ncm: e.target.value })} />
                </div>
              </div>
              <div className="linha-campos">
                <div className="campo">
                  <label>Peso (g)</label>
                  <input type="number" min="0" value={form.pesoGramas ?? ''} onChange={(e) => setForm({ ...form, pesoGramas: e.target.value })} />
                </div>
                <div className="campo">
                  <label>Faixa etária (infantil)</label>
                  <input value={form.faixaEtaria ?? ''} onChange={(e) => setForm({ ...form, faixaEtaria: e.target.value })} placeholder="Ex.: 4-6 anos" />
                </div>
              </div>
              <div className="campo">
                <label>Descrição</label>
                <textarea rows={2} value={form.descricao ?? ''} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
              </div>
            </details>

            <div className="acoes">
              <button type="button" className="btn secundario" onClick={() => setForm(null)}>Cancelar</button>
              <button className="btn">Salvar</button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
