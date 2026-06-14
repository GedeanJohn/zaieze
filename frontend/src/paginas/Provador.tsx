import { useCallback, useEffect, useState } from 'react'
import { api, formataReal, mensagemDeErro } from '../api'
import { SeletorLoja, useLojaAtiva } from '../componentes/SeletorLoja'

interface ProdutoOpcao { id: string; nome: string; referencia?: string | null }
interface Peca { id: string; nome: string; referencia?: string | null; precoVarejo: string; fotos: string[]; categoria?: { nome: string } | null }
interface Looks { base: Peca; complementos: Peca[]; sugestaoLook: string; viaIa: boolean }

function Card({ p, destaque }: { p: Peca; destaque?: boolean }) {
  return (
    <div className="cartao" style={{ textAlign: 'center', borderColor: destaque ? 'var(--accent)' : 'var(--border)' }}>
      {p.fotos[0]
        ? <img src={p.fotos[0]} alt={p.nome} style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: 8 }} />
        : <div style={{ height: 160, borderRadius: 8, background: 'var(--accent-soft)', display: 'grid', placeItems: 'center', fontSize: 40 }}>👗</div>}
      <div style={{ fontFamily: 'Georgia, serif', fontSize: 16, marginTop: 8 }}>{p.nome}</div>
      <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{p.categoria?.nome ?? '—'} · {formataReal(p.precoVarejo)}</div>
    </div>
  )
}

export default function Provador() {
  const escopo = useLojaAtiva()
  const [produtos, setProdutos] = useState<ProdutoOpcao[]>([])
  const [sel, setSel] = useState('')
  const [looks, setLooks] = useState<Looks | null>(null)
  const [erro, setErro] = useState('')
  const [carregandoLook, setCarregandoLook] = useState(false)

  const carregar = useCallback(async () => {
    if (!escopo.pronto) return
    const { data } = await api.get('/produtos', { params: { ...escopo.params, ativo: 'true' } })
    setProdutos(data)
  }, [escopo.pronto, escopo.params])

  useEffect(() => { carregar() }, [carregar])

  async function montar(produtoId: string) {
    setSel(produtoId); setErro(''); setLooks(null)
    if (!produtoId) return
    setCarregandoLook(true)
    try {
      const { data } = await api.get(`/provador/${produtoId}/looks`, { params: escopo.params })
      setLooks(data)
    } catch (e) {
      setErro(mensagemDeErro(e))
    } finally {
      setCarregandoLook(false)
    }
  }

  return (
    <>
      <header>
        <h1>🪞 Provador Virtual</h1>
        <SeletorLoja escopo={escopo} />
      </header>

      <div className="cartao">
        <div className="campo" style={{ maxWidth: 420, marginBottom: 0 }}>
          <label>Escolha uma peça para montar o look</label>
          <select value={sel} onChange={(e) => montar(e.target.value)}>
            <option value="">— Selecione um produto —</option>
            {produtos.map((p) => <option key={p.id} value={p.id}>{p.referencia ? `${p.referencia} · ` : ''}{p.nome}</option>)}
          </select>
        </div>
      </div>

      {erro && <div className="alerta">{erro}</div>}
      {carregandoLook && <p style={{ color: 'var(--ink-soft)' }}>Montando o look…</p>}

      {looks && (
        <>
          <div className="cartao" style={{ background: 'var(--accent-soft)', borderColor: 'var(--accent)' }}>
            <strong>✨ Sugestão de styling{looks.viaIa ? ' (IA)' : ''}:</strong>
            <div style={{ marginTop: 6, fontSize: 15 }}>{looks.sugestaoLook}</div>
          </div>

          <h2 className="painel-titulo" style={{ marginTop: 16 }}>Peça base</h2>
          <div className="grade-cards"><Card p={looks.base} destaque /></div>

          <h2 className="painel-titulo" style={{ marginTop: 16 }}>Combina com</h2>
          <div className="grade-cards">
            {looks.complementos.map((c) => <Card key={c.id} p={c} />)}
            {looks.complementos.length === 0 && <div className="cartao" style={{ color: 'var(--ink-soft)' }}>Sem peças de outras categorias com estoque para combinar.</div>}
          </div>
        </>
      )}
    </>
  )
}
