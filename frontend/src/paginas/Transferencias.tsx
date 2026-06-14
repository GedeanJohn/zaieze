import { useCallback, useEffect, useState } from 'react'
import { api, mensagemDeErro, rotuloStatusTransf, usuarioLogado } from '../api'

interface LojaR { id: string; nome: string }
interface VarP { id: string; cor: string; tamanho: string; estoque: number }
interface ProdP { id: string; nome: string; referencia?: string | null; variacoes: VarP[] }

interface ItemT {
  id: string
  quantidadeEnviada: number
  quantidadeRecebida: number | null
  origemVariacao: { cor: string; tamanho: string; produto: { nome: string; referencia?: string | null } }
}
interface Transf {
  id: string
  status: string
  observacao?: string | null
  createdAt: string
  recebidaEm?: string | null
  lojaOrigem: { id: string; nome: string }
  lojaDestino: { id: string; nome: string }
  itens: ItemT[]
}

interface LinhaT { produtoId: string; variacaoId: string; quantidade: number }
interface FormT { lojaOrigemId: string; lojaDestinoId: string; observacao: string; itens: LinhaT[] }

const LINHA: LinhaT = { produtoId: '', variacaoId: '', quantidade: 1 }
const grid = { display: 'grid', gridTemplateColumns: '1.7fr 1.2fr 80px 36px', gap: 8, alignItems: 'end', marginBottom: 8 } as const
const STATUS = ['', 'EM_TRANSITO', 'RECEBIDA', 'CANCELADA']

function dataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}
function divergencia(t: Transf): number {
  if (t.status !== 'RECEBIDA') return 0
  return t.itens.reduce((s, i) => s + (i.quantidadeEnviada - (i.quantidadeRecebida ?? i.quantidadeEnviada)), 0)
}

export default function Transferencias() {
  const usuario = usuarioLogado()!
  const ehGerente = usuario.role === 'GERENTE'
  const minhaLoja = usuario.loja?.id ?? ''
  const podeCancelar = usuario.role === 'GESTOR' || usuario.role === 'ESTOQUISTA' || usuario.role === 'SUPER_ADMIN'

  const [lojas, setLojas] = useState<LojaR[]>([])
  const [transfs, setTransfs] = useState<Transf[]>([])
  const [statusFiltro, setStatusFiltro] = useState('')
  const [produtos, setProdutos] = useState<ProdP[]>([])
  const [form, setForm] = useState<FormT | null>(null)
  const [receber, setReceber] = useState<{ t: Transf; rec: Record<string, number> } | null>(null)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  useEffect(() => {
    api.get('/lojas').then(({ data }) => setLojas(data.map((l: LojaR) => ({ id: l.id, nome: l.nome }))))
  }, [])

  const carregar = useCallback(async () => {
    const { data } = await api.get('/transferencias', { params: statusFiltro ? { status: statusFiltro } : {} })
    setTransfs(data)
  }, [statusFiltro])

  useEffect(() => { carregar() }, [carregar])

  async function carregarProdutos(lojaOrigemId: string) {
    if (!lojaOrigemId) return setProdutos([])
    const { data } = await api.get('/produtos', { params: { lojaId: lojaOrigemId, ativo: 'true' } })
    setProdutos(data)
  }

  async function abrirNova() {
    setErro(''); setAviso('')
    const origem = ehGerente ? minhaLoja : ''
    await carregarProdutos(origem)
    setForm({ lojaOrigemId: origem, lojaDestinoId: '', observacao: '', itens: [{ ...LINHA }] })
  }

  async function mudarOrigem(lojaOrigemId: string) {
    if (!form) return
    await carregarProdutos(lojaOrigemId)
    setForm({ ...form, lojaOrigemId, lojaDestinoId: form.lojaDestinoId === lojaOrigemId ? '' : form.lojaDestinoId, itens: [{ ...LINHA }] })
  }

  function variacoesDe(produtoId: string): VarP[] {
    return produtos.find((p) => p.id === produtoId)?.variacoes ?? []
  }
  function mudarLinha(i: number, patch: Partial<LinhaT>) {
    if (!form) return
    const itens = form.itens.map((l, idx) => {
      if (idx !== i) return l
      const novo = { ...l, ...patch }
      if (patch.produtoId !== undefined) novo.variacaoId = ''
      return novo
    })
    setForm({ ...form, itens })
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return
    setErro('')
    if (!form.lojaOrigemId || !form.lojaDestinoId) return setErro('Escolha a loja de origem e a de destino.')
    if (form.lojaOrigemId === form.lojaDestinoId) return setErro('Origem e destino devem ser diferentes.')
    if (form.itens.some((l) => !l.variacaoId || Number(l.quantidade) < 1)) return setErro('Cada item precisa de variação e quantidade ≥ 1.')
    const corpo = {
      lojaOrigemId: form.lojaOrigemId,
      lojaDestinoId: form.lojaDestinoId,
      observacao: form.observacao || undefined,
      itens: form.itens.map((l) => ({ origemVariacaoId: l.variacaoId, quantidade: Number(l.quantidade) })),
    }
    try {
      await api.post('/transferencias', corpo)
      setForm(null)
      setAviso('Transferência enviada. Aguardando confirmação de recebimento no destino.')
      carregar()
    } catch (err) {
      setErro(mensagemDeErro(err))
    }
  }

  function podeReceber(t: Transf): boolean {
    return t.status === 'EM_TRANSITO' && (!ehGerente || t.lojaDestino.id === minhaLoja)
  }

  async function salvarReceber(e: React.FormEvent) {
    e.preventDefault()
    if (!receber) return
    setErro('')
    const corpo = { itens: receber.t.itens.map((i) => ({ itemId: i.id, quantidadeRecebida: receber.rec[i.id] ?? 0 })) }
    try {
      await api.post(`/transferencias/${receber.t.id}/receber`, corpo)
      const div = receber.t.itens.reduce((s, i) => s + (i.quantidadeEnviada - (receber.rec[i.id] ?? 0)), 0)
      setReceber(null)
      setAviso(div > 0 ? `Recebimento confirmado com DIVERGÊNCIA de ${div} peça(s) — verifique extravio.` : 'Recebimento confirmado sem divergência.')
      carregar()
    } catch (err) {
      setErro(mensagemDeErro(err))
    }
  }

  async function cancelar(t: Transf) {
    if (!window.confirm('Cancelar a transferência? O estoque volta para a loja de origem.')) return
    try {
      await api.post(`/transferencias/${t.id}/cancelar`, {})
      carregar()
    } catch (err) {
      alert(mensagemDeErro(err))
    }
  }

  const recTotalEnviado = receber ? receber.t.itens.reduce((s, i) => s + i.quantidadeEnviada, 0) : 0
  const recTotalRecebido = receber ? receber.t.itens.reduce((s, i) => s + (receber.rec[i.id] ?? 0), 0) : 0

  return (
    <>
      <header>
        <h1>Transferências</h1>
        <button className="btn" onClick={abrirNova}>+ Nova transferência</button>
      </header>

      {aviso && <div className="sucesso">{aviso}</div>}
      {erro && !form && !receber && <div className="alerta">{erro}</div>}

      <div className="cartao">
        <div className="campo" style={{ maxWidth: 240 }}>
          <label>Status</label>
          <select value={statusFiltro} onChange={(e) => setStatusFiltro(e.target.value)}>
            {STATUS.map((s) => <option key={s} value={s}>{s ? rotuloStatusTransf[s] : 'Todas'}</option>)}
          </select>
        </div>
        <table>
          <thead>
            <tr><th>Data</th><th>Origem → Destino</th><th>Itens</th><th>Status</th><th>Divergência</th><th></th></tr>
          </thead>
          <tbody>
            {transfs.map((t) => {
              const div = divergencia(t)
              return (
                <tr key={t.id}>
                  <td>{dataHora(t.createdAt)}</td>
                  <td>{t.lojaOrigem.nome} <span style={{ color: 'var(--accent)' }}>→</span> {t.lojaDestino.nome}</td>
                  <td style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
                    {t.itens.map((i) => `${i.quantidadeEnviada}× ${i.origemVariacao.produto.nome} ${i.origemVariacao.cor}/${i.origemVariacao.tamanho}${i.quantidadeRecebida != null && i.quantidadeRecebida !== i.quantidadeEnviada ? ` (recebido ${i.quantidadeRecebida})` : ''}`).join(' · ')}
                  </td>
                  <td><span className={`selo ${t.status === 'RECEBIDA' ? 'ok' : t.status === 'CANCELADA' ? 'baixo' : 'FREQUENTE'}`}>{rotuloStatusTransf[t.status]}</span></td>
                  <td>{div > 0 ? <span className="selo baixo">⚠ {div} peça(s)</span> : t.status === 'RECEBIDA' ? <span style={{ color: 'var(--ok)' }}>OK</span> : '—'}</td>
                  <td>
                    {podeReceber(t) && <a href="#" onClick={(e) => { e.preventDefault(); setReceber({ t, rec: Object.fromEntries(t.itens.map((i) => [i.id, i.quantidadeEnviada])) }) }}>receber</a>}
                    {t.status === 'EM_TRANSITO' && podeCancelar && <> · <a href="#" onClick={(e) => { e.preventDefault(); cancelar(t) }}>cancelar</a></>}
                  </td>
                </tr>
              )
            })}
            {transfs.length === 0 && (
              <tr><td colSpan={6} style={{ color: 'var(--ink-soft)' }}>Nenhuma transferência.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Nova transferência */}
      {form && (
        <div className="modal-fundo" onClick={() => setForm(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={salvar}>
            <h2>Nova transferência</h2>
            {erro && <div className="alerta">{erro}</div>}
            <div className="linha-campos">
              <div className="campo">
                <label>Loja de origem*</label>
                <select value={form.lojaOrigemId} onChange={(e) => mudarOrigem(e.target.value)} disabled={ehGerente} required>
                  <option value="">— Origem —</option>
                  {lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
                </select>
              </div>
              <div className="campo">
                <label>Loja de destino*</label>
                <select value={form.lojaDestinoId} onChange={(e) => setForm({ ...form, lojaDestinoId: e.target.value })} required>
                  <option value="">— Destino —</option>
                  {lojas.filter((l) => l.id !== form.lojaOrigemId).map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
                </select>
              </div>
            </div>

            <h3 style={{ marginBottom: 8 }}>Itens a enviar</h3>
            {!form.lojaOrigemId && <p style={{ color: 'var(--ink-soft)', fontSize: 13 }}>Escolha a loja de origem para listar os produtos.</p>}
            {form.lojaOrigemId && (
              <>
                <div style={{ ...grid, fontSize: 12, color: 'var(--ink-soft)' }}>
                  <span>Produto</span><span>Variação (estoque)</span><span>Qtd</span><span></span>
                </div>
                {form.itens.map((l, i) => (
                  <div style={grid} key={i}>
                    <select value={l.produtoId} onChange={(e) => mudarLinha(i, { produtoId: e.target.value })} required>
                      <option value="">— Produto —</option>
                      {produtos.map((p) => <option key={p.id} value={p.id}>{p.referencia ? `${p.referencia} · ` : ''}{p.nome}</option>)}
                    </select>
                    <select value={l.variacaoId} onChange={(e) => mudarLinha(i, { variacaoId: e.target.value })} disabled={!l.produtoId} required>
                      <option value="">— Cor/Tam —</option>
                      {variacoesDe(l.produtoId).map((v) => <option key={v.id} value={v.id} disabled={v.estoque <= 0}>{v.cor}/{v.tamanho} ({v.estoque})</option>)}
                    </select>
                    <input type="number" min="1" value={l.quantidade} onChange={(e) => mudarLinha(i, { quantidade: Number(e.target.value) })} />
                    <button type="button" title="Remover" style={{ background: 'none', border: 'none', color: 'var(--danger)', fontSize: 18, cursor: 'pointer' }}
                      onClick={() => setForm({ ...form, itens: form.itens.filter((_, idx) => idx !== i) })} disabled={form.itens.length === 1}>×</button>
                  </div>
                ))}
                <button type="button" className="btn secundario" onClick={() => setForm({ ...form, itens: [...form.itens, { ...LINHA }] })}>+ Adicionar item</button>
              </>
            )}

            <div className="campo" style={{ marginTop: 14 }}>
              <label>Observação</label>
              <input value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
            </div>
            <div className="acoes">
              <button type="button" className="btn secundario" onClick={() => setForm(null)}>Cancelar</button>
              <button className="btn">Enviar transferência</button>
            </div>
          </form>
        </div>
      )}

      {/* Confirmar recebimento */}
      {receber && (
        <div className="modal-fundo" onClick={() => setReceber(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={salvarReceber} style={{ width: 'min(560px, 92vw)' }}>
            <h2>Confirmar recebimento</h2>
            <p style={{ color: 'var(--ink-soft)', fontSize: 13, marginTop: 0 }}>
              {receber.t.lojaOrigem.nome} → {receber.t.lojaDestino.nome}. Informe o que realmente chegou; a diferença é registrada como divergência.
            </p>
            {erro && <div className="alerta">{erro}</div>}
            <table>
              <thead><tr><th>Produto</th><th>Grade</th><th>Enviado</th><th>Recebido</th></tr></thead>
              <tbody>
                {receber.t.itens.map((i) => (
                  <tr key={i.id}>
                    <td>{i.origemVariacao.produto.nome}</td>
                    <td style={{ color: 'var(--ink-soft)' }}>{i.origemVariacao.cor}/{i.origemVariacao.tamanho}</td>
                    <td>{i.quantidadeEnviada}</td>
                    <td style={{ width: 90 }}>
                      <input type="number" min="0" max={i.quantidadeEnviada} value={receber.rec[i.id] ?? 0}
                        onChange={(e) => setReceber({ ...receber, rec: { ...receber.rec, [i.id]: Math.min(Number(e.target.value), i.quantidadeEnviada) } })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 10, fontSize: 14 }}>
              Total: recebido <strong>{recTotalRecebido}</strong> de <strong>{recTotalEnviado}</strong>
              {recTotalEnviado - recTotalRecebido > 0 && <span style={{ color: 'var(--danger)', fontWeight: 600 }}> · divergência {recTotalEnviado - recTotalRecebido}</span>}
            </div>
            <div className="acoes">
              <button type="button" className="btn secundario" onClick={() => setReceber(null)}>Cancelar</button>
              <button className="btn">Confirmar recebimento</button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
