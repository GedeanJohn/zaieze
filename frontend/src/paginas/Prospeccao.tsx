import { useEffect, useState } from 'react'
import { api, mensagemDeErro } from '../api'
import { useToast } from '../componentes/Toast'

interface Empresa {
  id: string
  googlePlaceId: string | null
  nome: string
  categoria: string | null
  telefone: string | null
  site: string | null
  endereco: string | null
  cidade: string | null
  uf: string | null
  notaGoogle: string | null
  totalAvaliacoes: number | null
  horarioFuncionamento: string[] | null
}
interface Busca {
  id: string
  segmento: string
  cidade: string
  uf: string
  quantidade: number
  simulada: boolean
  createdAt: string
  empresas: Empresa[]
}
interface BuscaResumo { id: string; segmento: string; cidade: string; uf: string; simulada: boolean; createdAt: string; _count: { empresas: number }; criadoPor: { nome: string } }

const fmtData = (iso: string) => new Date(iso).toLocaleString('pt-BR')

/** Captador Leads Zaieze — prospecção de empresas novas (fora do SaaS) via Google Places, pro time
 * comercial da própria ZAIEZE encontrar leads pra vender o ZAIEZE. NÃO é a feature "Radar de
 * Oportunidades" (essa é sobre a carteira de clientes já existente de uma loja tenant). */
export default function Prospeccao() {
  const [segmento, setSegmento] = useState('')
  const [cidade, setCidade] = useState('')
  const [uf, setUf] = useState('')
  const [raioKm, setRaioKm] = useState('20')
  const [tipoEmpresa, setTipoEmpresa] = useState('')
  const [perfilIdeal, setPerfilIdeal] = useState('')
  const [quantidade, setQuantidade] = useState('10')
  const [buscando, setBuscando] = useState(false)
  const [resultado, setResultado] = useState<Busca | null>(null)
  const [historico, setHistorico] = useState<BuscaResumo[]>([])
  const avisar = useToast()

  function carregarHistorico() {
    api.get('/admin/prospeccao/buscas').then(({ data }) => setHistorico(data.buscas)).catch(() => {})
  }
  useEffect(() => { carregarHistorico() }, [])

  async function buscar(e: React.FormEvent) {
    e.preventDefault()
    setBuscando(true)
    try {
      const { data } = await api.post('/admin/prospeccao/buscas', {
        segmento, cidade, uf,
        raioKm: raioKm ? Number(raioKm) : undefined,
        tipoEmpresa: tipoEmpresa || undefined,
        perfilIdeal: perfilIdeal || undefined,
        quantidade: Number(quantidade),
      })
      setResultado(data)
      carregarHistorico()
    } catch (e2) { avisar(mensagemDeErro(e2), 'erro') } finally { setBuscando(false) }
  }

  async function abrirBusca(id: string) {
    try {
      const { data } = await api.get(`/admin/prospeccao/buscas/${id}`)
      setResultado(data)
    } catch (e) { avisar(mensagemDeErro(e), 'erro') }
  }

  return (
    <>
      <header><h1>🧭 Captador Leads Zaieze</h1></header>
      <div className="cartao" style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
        Busca empresas <strong>de fora do SaaS</strong> (prospecção pro time comercial vender o ZAIEZE) — não confundir
        com o "Radar de Oportunidades" das lojas, que olha a carteira de clientes já existente delas. Fonte: Google
        Places. <strong>Não traz CNPJ nem Instagram</strong> (a API não fornece); o telefone vira link de WhatsApp
        como boa prática, sem garantia de ser o WhatsApp comercial da empresa.
      </div>

      <form onSubmit={buscar} className="cartao">
        <h2 style={{ marginTop: 0 }}>Nova busca</h2>
        <div className="linha-campos">
          <div className="campo"><label>Segmento</label><input value={segmento} onChange={(e) => setSegmento(e.target.value)} placeholder="ex.: lojas de moda feminina" required minLength={2} /></div>
          <div className="campo"><label>Tipo de empresa (opcional)</label><input value={tipoEmpresa} onChange={(e) => setTipoEmpresa(e.target.value)} placeholder="ex.: varejo, indústria" /></div>
        </div>
        <div className="linha-campos">
          <div className="campo"><label>Cidade</label><input value={cidade} onChange={(e) => setCidade(e.target.value)} required minLength={2} /></div>
          <div className="campo" style={{ maxWidth: 100 }}><label>UF</label><input value={uf} onChange={(e) => setUf(e.target.value.toUpperCase())} maxLength={2} required /></div>
          <div className="campo" style={{ maxWidth: 140 }}><label>Raio (km)</label><input type="number" min="1" value={raioKm} onChange={(e) => setRaioKm(e.target.value)} /></div>
          <div className="campo" style={{ maxWidth: 140 }}><label>Quantidade (máx. 20)</label><input type="number" min="1" max="20" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} required /></div>
        </div>
        <div className="campo">
          <label>Perfil ideal de cliente (opcional)</label>
          <textarea rows={2} value={perfilIdeal} onChange={(e) => setPerfilIdeal(e.target.value)} placeholder="ex.: lojas com Instagram ativo e mais de uma unidade" />
        </div>
        <div className="acoes"><button className="btn" disabled={buscando}>{buscando ? 'Buscando…' : 'Buscar oportunidades'}</button></div>
      </form>

      {resultado && (
        <div className="cartao">
          <h2 style={{ marginTop: 0 }}>
            {resultado.segmento} em {resultado.cidade}/{resultado.uf} · {resultado.empresas.length} encontrada(s)
          </h2>
          {resultado.simulada && (
            <div className="alerta" style={{ marginBottom: 10 }}>
              Resultados <strong>simulados</strong> — configure <code>GOOGLE_PLACES_API_KEY</code> no servidor pra buscar empresas de verdade.
            </div>
          )}
          <table>
            <thead><tr><th>Nome</th><th>Categoria</th><th>Telefone</th><th>Site</th><th>Endereço</th><th>Nota</th><th>Horário</th></tr></thead>
            <tbody>
              {resultado.empresas.map((e) => (
                <tr key={e.id}>
                  <td>{e.nome}</td>
                  <td>{e.categoria ?? '—'}</td>
                  <td>
                    {e.telefone
                      ? <a href={`https://wa.me/${e.telefone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">{e.telefone}</a>
                      : '—'}
                  </td>
                  <td>{e.site ? <a href={e.site} target="_blank" rel="noreferrer">site</a> : '—'}</td>
                  <td style={{ fontSize: 12 }}>{e.endereco ?? '—'}</td>
                  <td>{e.notaGoogle ? `★ ${e.notaGoogle} (${e.totalAvaliacoes ?? 0})` : '—'}</td>
                  <td style={{ fontSize: 12 }}>{e.horarioFuncionamento?.[0] ?? '—'}</td>
                </tr>
              ))}
              {resultado.empresas.length === 0 && <tr><td colSpan={7} style={{ color: 'var(--ink-soft)' }}>Nenhuma empresa encontrada.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <div className="cartao">
        <h2 style={{ marginTop: 0 }}>Buscas anteriores</h2>
        <table>
          <thead><tr><th>Segmento</th><th>Cidade/UF</th><th>Empresas</th><th>Feita por</th><th>Data</th><th></th></tr></thead>
          <tbody>
            {historico.map((h) => (
              <tr key={h.id}>
                <td>{h.segmento}</td>
                <td>{h.cidade}/{h.uf}</td>
                <td>{h._count.empresas} {h.simulada && <span className="selo ATACADO">simulada</span>}</td>
                <td>{h.criadoPor.nome}</td>
                <td>{fmtData(h.createdAt)}</td>
                <td><a href="#" onClick={(e) => { e.preventDefault(); abrirBusca(h.id) }}>ver resultados</a></td>
              </tr>
            ))}
            {historico.length === 0 && <tr><td colSpan={6} style={{ color: 'var(--ink-soft)' }}>Nenhuma busca ainda.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  )
}
