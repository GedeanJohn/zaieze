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

  const carregar = useCallback(async () => {
    if (!escopo.pronto) return
    const params = { ...escopo.params, ...(busca ? { busca } : {}) }
    const { data } = await api.get('/produtos', { params })
    setProdutos(data)
  }, [busca, escopo.pronto, escopo.params])

  useEffect(() => { carregar() }, [carregar])

  function estoqueTotal(p: Produto) {
    return p.variacoes.reduce((s, v) => s + v.estoque, 0)
  }
  function temEstoqueBaixo(p: Produto) {
    return p.variacoes.some((v) => v.estoque <= v.estoqueMinimo)
  }

  function abrirNovo() {
    setErro('')
    setForm({ nome: '', genero: 'FEMININO', referencia: '', precoVarejo: '', variacoes: [{ ...VARIACAO_VAZIA }] })
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
                <td>{gerente && <a href="#" onClick={(e) => { e.preventDefault(); abrirEdicao(p) }}>editar</a>}</td>
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
