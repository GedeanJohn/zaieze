import { useEffect, useState } from 'react'
import { api, mensagemDeErro } from '../api'
import { useToast } from '../componentes/Toast'

const fmtData = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—')

// ── Base de leads própria da ZAIEZE (cross-tenant, uso exclusivo do SUPER_ADMIN) ──
interface ZaiezeLeadAmostra {
  id: string; nome: string; telefone: string | null; cidade: string | null; uf: string | null
  redeNome: string; lojaNome: string; vendedoraNome: string | null; origemCanal: string | null
  segmento: string; entradaEm: string
}
interface ZaiezeLeadsResumo { total: number; ultimaSincronizacaoEm: string | null; amostra: ZaiezeLeadAmostra[] }

export default function LeadsZaieze() {
  const [resumo, setResumo] = useState<ZaiezeLeadsResumo | null>(null)
  const [sincronizando, setSincronizando] = useState(false)
  const avisar = useToast()

  function carregar() {
    api.get('/admin/zaiezeleads').then(({ data }) => setResumo(data)).catch(() => {})
  }
  useEffect(() => { carregar() }, [])

  async function sincronizar() {
    setSincronizando(true)
    try {
      const { data } = await api.post('/admin/zaiezeleads/sincronizar')
      avisar(`Base sincronizada: ${data.sincronizados} contato(s).`)
      carregar()
    } catch (e) { avisar(mensagemDeErro(e), 'erro') } finally { setSincronizando(false) }
  }

  async function exportar(formato: 'xlsx' | 'csv' | 'txt' | 'sql') {
    try {
      const { data } = await api.get('/admin/zaiezeleads/exportar', { params: { formato }, responseType: 'blob' })
      const url = URL.createObjectURL(data as Blob)
      const a = document.createElement('a')
      a.href = url; a.download = `zaiezeleads.${formato}`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    } catch (e) { avisar(mensagemDeErro(e), 'erro') }
  }

  if (!resumo) return <p style={{ color: 'var(--ink-soft)' }}>Carregando…</p>

  return (
    <>
      <header><h1>📇 Leads ZAIEZE</h1></header>

      <div className="cartao">
        <h2 style={{ marginTop: 0 }}>Base de leads própria da ZAIEZE ({resumo.total})</h2>
        <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 0 }}>
          Cópia agregada de todo contato cadastrado em qualquer marca do SaaS. Última sincronização: {fmtData(resumo.ultimaSincronizacaoEm)}.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          <button className="btn secundario" onClick={sincronizar} disabled={sincronizando}>{sincronizando ? 'Sincronizando…' : 'Sincronizar agora'}</button>
          <button className="btn" onClick={() => exportar('xlsx')}>Baixar .xlsx</button>
          <button className="btn" onClick={() => exportar('csv')}>Baixar .csv</button>
          <button className="btn" onClick={() => exportar('txt')}>Baixar .txt</button>
          <button className="btn" onClick={() => exportar('sql')}>Baixar .sql</button>
        </div>
        <table>
          <thead><tr><th>Nome</th><th>Telefone</th><th>Cidade/UF</th><th>Marca</th><th>Vendedora</th><th>Canal</th><th>Segmento</th><th>Entrada</th></tr></thead>
          <tbody>
            {resumo.amostra.map((l) => (
              <tr key={l.id}>
                <td>{l.nome}</td>
                <td>{l.telefone ?? '—'}</td>
                <td>{l.cidade ? `${l.cidade}/${l.uf ?? ''}` : '—'}</td>
                <td>{l.redeNome} <span style={{ color: 'var(--ink-soft)' }}>· {l.lojaNome}</span></td>
                <td>{l.vendedoraNome ?? '—'}</td>
                <td>{l.origemCanal ?? '—'}</td>
                <td><span className={`selo ${l.segmento}`}>{l.segmento}</span></td>
                <td>{fmtData(l.entradaEm)}</td>
              </tr>
            ))}
            {resumo.amostra.length === 0 && <tr><td colSpan={8} style={{ color: 'var(--ink-soft)' }}>Nenhum contato sincronizado ainda.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  )
}
