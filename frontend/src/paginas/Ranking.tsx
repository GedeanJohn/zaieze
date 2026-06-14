import { useCallback, useEffect, useState } from 'react'
import { api, formataReal, mensagemDeErro, usuarioLogado } from '../api'
import { SeletorLoja, useLojaAtiva } from '../componentes/SeletorLoja'

interface LinhaRank {
  posicao: number; id: string; nome: string; equipe: string | null
  total: number; vendas: number; ticketMedio: number; meta: number | null; pctMeta: number | null
}
interface Comissao { vendedoraId: string; comissao: number; atingiuMeta: boolean }
interface Regra { id: string; escopo: string; alvo: string; percentual: string; percentualMeta: string | null }
interface Opcao { id: string; nome: string }

const MEDALHAS = ['🥇', '🥈', '🥉']

export default function Ranking() {
  const usuario = usuarioLogado()!
  const gerente = usuario.role !== 'VENDEDORA'
  const escopo = useLojaAtiva()

  const [rank, setRank] = useState<LinhaRank[]>([])
  const [comissoes, setComissoes] = useState<Record<string, Comissao>>({})
  const [regras, setRegras] = useState<Regra[]>([])
  const [categorias, setCategorias] = useState<Opcao[]>([])
  const [marcas, setMarcas] = useState<Opcao[]>([])
  const [form, setForm] = useState<{ escopo: string; refId: string; percentual: string; percentualMeta: string } | null>(null)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    if (!escopo.pronto) return
    const [r, c] = await Promise.all([
      api.get('/ranking', { params: escopo.params }),
      api.get('/comissoes', { params: escopo.params }),
    ])
    setRank(r.data)
    setComissoes(Object.fromEntries((c.data as Comissao[]).map((x) => [x.vendedoraId, x])))
    if (gerente) {
      const [reg, tax] = await Promise.all([
        api.get('/comissoes/regras', { params: escopo.params }),
        api.get('/produtos/taxonomias/listar', { params: escopo.params }),
      ])
      setRegras(reg.data)
      setCategorias(tax.data.categorias)
      setMarcas(tax.data.marcas)
    }
  }, [escopo.pronto, escopo.params, gerente])

  useEffect(() => { carregar() }, [carregar])

  async function salvarRegra(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return
    setErro('')
    try {
      await api.post('/comissoes/regras', {
        escopo: form.escopo,
        refId: form.escopo === 'PADRAO' ? undefined : form.refId,
        percentual: Number(form.percentual),
        percentualMeta: form.percentualMeta ? Number(form.percentualMeta) : undefined,
      }, { params: escopo.params })
      setForm(null)
      carregar()
    } catch (err) {
      setErro(mensagemDeErro(err))
    }
  }

  const podio = rank.slice(0, 3)

  return (
    <>
      <header>
        <h1>🏆 Ranking & Comissão</h1>
        <SeletorLoja escopo={escopo} />
      </header>

      {/* Pódio */}
      {podio.length > 0 && (
        <div className="grade-cards" style={{ marginBottom: 16 }}>
          {podio.map((v) => (
            <div key={v.id} className="cartao" style={{ textAlign: 'center', borderColor: v.posicao === 1 ? 'var(--accent)' : 'var(--border)' }}>
              <div style={{ fontSize: 34 }}>{MEDALHAS[v.posicao - 1]}</div>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: 18 }}>{v.nome}</div>
              <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{formataReal(v.total)}</div>
              <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
                {v.vendas} venda(s){v.pctMeta != null ? ` · ${v.pctMeta}% da meta` : ''}
              </div>
              {comissoes[v.id] && (
                <div style={{ marginTop: 6, fontSize: 14, color: 'var(--accent)' }}>
                  comissão {formataReal(comissoes[v.id].comissao)}{comissoes[v.id].atingiuMeta ? ' 🎯' : ''}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Tabela completa */}
      <div className="cartao">
        <h2 className="painel-titulo">Classificação do mês</h2>
        <table>
          <thead>
            <tr><th>#</th><th>Vendedora</th><th>Vendas</th><th>Faturamento</th><th>Meta</th><th>Comissão</th></tr>
          </thead>
          <tbody>
            {rank.map((v) => (
              <tr key={v.id} style={{ background: v.id === usuario.id ? 'var(--accent-soft)' : undefined }}>
                <td>{v.posicao <= 3 ? MEDALHAS[v.posicao - 1] : v.posicao}</td>
                <td>{v.nome}<div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{v.equipe ?? 'Sem equipe'}</div></td>
                <td>{v.vendas}</td>
                <td>{formataReal(v.total)}</td>
                <td style={{ minWidth: 120 }}>
                  {v.meta != null
                    ? <><span style={{ fontSize: 13 }}>{v.pctMeta}%</span><div className="barra-meta"><span style={{ width: `${Math.min(100, v.pctMeta ?? 0)}%` }} /></div></>
                    : <span style={{ color: 'var(--ink-soft)' }}>—</span>}
                </td>
                <td>{comissoes[v.id] ? <strong style={{ color: 'var(--accent)' }}>{formataReal(comissoes[v.id].comissao)}</strong> : '—'}</td>
              </tr>
            ))}
            {rank.length === 0 && <tr><td colSpan={6} style={{ color: 'var(--ink-soft)' }}>Sem vendedoras.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Regras de comissão (gerente) */}
      {gerente && (
        <div className="cartao">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 className="painel-titulo" style={{ margin: 0 }}>Regras de comissão</h2>
            <button className="btn secundario" onClick={() => setForm({ escopo: 'CATEGORIA', refId: '', percentual: '', percentualMeta: '' })}>+ Nova regra</button>
          </div>
          {erro && <div className="alerta" style={{ marginTop: 12 }}>{erro}</div>}
          <table style={{ marginTop: 12 }}>
            <thead><tr><th>Escopo</th><th>Alvo</th><th>% base</th><th>% na meta</th></tr></thead>
            <tbody>
              {regras.map((r) => (
                <tr key={r.id}>
                  <td>{r.escopo}</td>
                  <td>{r.alvo}</td>
                  <td>{Number(r.percentual)}%</td>
                  <td>{r.percentualMeta != null ? `${Number(r.percentualMeta)}%` : '—'}</td>
                </tr>
              ))}
              {regras.length === 0 && <tr><td colSpan={4} style={{ color: 'var(--ink-soft)' }}>Nenhuma regra — usa a comissão padrão da vendedora.</td></tr>}
            </tbody>
          </table>
          <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 8 }}>
            A regra mais específica vence: produto › categoria › marca › padrão. O “% na meta” entra quando a vendedora bate a meta do mês.
          </p>
        </div>
      )}

      {form && (
        <div className="modal-fundo" onClick={() => setForm(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={salvarRegra} style={{ width: 'min(520px, 92vw)' }}>
            <h2>Nova regra de comissão</h2>
            {erro && <div className="alerta">{erro}</div>}
            <div className="linha-campos">
              <div className="campo">
                <label>Escopo</label>
                <select value={form.escopo} onChange={(e) => setForm({ ...form, escopo: e.target.value, refId: '' })}>
                  <option value="CATEGORIA">Categoria</option>
                  <option value="MARCA">Marca</option>
                  <option value="PADRAO">Padrão da loja</option>
                </select>
              </div>
              {form.escopo !== 'PADRAO' && (
                <div className="campo">
                  <label>Alvo</label>
                  <select value={form.refId} onChange={(e) => setForm({ ...form, refId: e.target.value })} required>
                    <option value="">— Selecione —</option>
                    {(form.escopo === 'CATEGORIA' ? categorias : marcas).map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div className="linha-campos">
              <div className="campo">
                <label>% base*</label>
                <input type="number" step="0.5" min="0" max="100" value={form.percentual} onChange={(e) => setForm({ ...form, percentual: e.target.value })} required />
              </div>
              <div className="campo">
                <label>% ao bater a meta</label>
                <input type="number" step="0.5" min="0" max="100" value={form.percentualMeta} onChange={(e) => setForm({ ...form, percentualMeta: e.target.value })} />
              </div>
            </div>
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
