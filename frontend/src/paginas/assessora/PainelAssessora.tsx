import { useEffect, useState } from 'react'
import { api, formataReal, mensagemDeErro, usuarioLogado } from '../../api'
import { useToast } from '../../componentes/Toast'
import { HOST } from '../../host'

interface Perfil { slug: string; bio: string | null; whatsapp: string | null; instagram: string | null; site: string | null }
interface Marca {
  id: string; redeId: string | null; nome: string; logoUrl: string | null
  descricao: string | null; formasPagamento: string | null; modoEnvio: string | null; condicoesCompra: string | null
  tamanhos: string | null; valores: string | null; endereco: string | null; cnpj: string | null
  instagram: string | null; facebook: string | null; whatsapp: string | null; telegram: string | null; tiktok: string | null; site: string | null
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
  tamanhos: '', valores: '', endereco: '', cnpj: '', instagram: '', facebook: '', whatsapp: '', telegram: '', tiktok: '', site: '',
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
  const [salvandoPerfil, setSalvandoPerfil] = useState(false)

  const [marcas, setMarcas] = useState<Marca[]>([])
  const [formMarca, setFormMarca] = useState<typeof marcaVazia | null>(null)
  const [editandoMarcaId, setEditandoMarcaId] = useState<string | null>(null)
  const [salvandoMarca, setSalvandoMarca] = useState(false)

  const [vendas, setVendas] = useState<Venda[]>([])
  const [filtroDe, setFiltroDe] = useState(''); const [filtroAte, setFiltroAte] = useState(''); const [filtroMarca, setFiltroMarca] = useState('')
  const [formVenda, setFormVenda] = useState<{ assessorMarcaId: string; data: string; valorVenda: string; percentualComissao: string; observacao: string } | null>(null)
  const [salvandoVenda, setSalvandoVenda] = useState(false)

  function carregarPerfil() {
    api.get('/assessores/minha').then(({ data }) => {
      setPerfil(data); setBio(data.bio ?? ''); setWhatsapp(data.whatsapp ?? ''); setInstagram(data.instagram ?? ''); setSite(data.site ?? '')
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
      await api.patch('/assessores/minha', { bio: bio || null, whatsapp: whatsapp || null, instagram: instagram || null, site: site || null })
      avisar('Perfil salvo.')
      carregarPerfil()
    } catch (e2) { avisar(mensagemDeErro(e2), 'erro') } finally { setSalvandoPerfil(false) }
  }

  function abrirNovaMarca() { setEditandoMarcaId(null); setFormMarca(marcaVazia) }
  function abrirEditarMarca(m: Marca) {
    setEditandoMarcaId(m.id)
    setFormMarca({
      nome: m.nome, logoUrl: m.logoUrl ?? '', descricao: m.descricao ?? '', formasPagamento: m.formasPagamento ?? '',
      modoEnvio: m.modoEnvio ?? '', condicoesCompra: m.condicoesCompra ?? '', tamanhos: m.tamanhos ?? '', valores: m.valores ?? '',
      endereco: m.endereco ?? '', cnpj: m.cnpj ?? '', instagram: m.instagram ?? '', facebook: m.facebook ?? '', whatsapp: m.whatsapp ?? '',
      telegram: m.telegram ?? '', tiktok: m.tiktok ?? '', site: m.site ?? '',
      percentualComissaoSugerido: m.percentualComissaoSugerido != null ? String(m.percentualComissaoSugerido) : '', ativo: m.ativo,
    })
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
      a.href = url; a.download = `vendas-${perfil?.slug ?? 'corretora'}.${formato}`
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
          <h1 style={{ margin: 0 }}>Painel do Corretor de Moda</h1>
          <span style={{ color: 'var(--ink-soft)', fontSize: 13 }}>{usuario?.nome}</span>
        </div>
        <button className="btn secundario" onClick={sair}>Sair</button>
      </header>

      <div className="cartao" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>Sua vitrine pública:</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input readOnly value={linkPublico} style={{ minWidth: 220 }} />
          <button type="button" className="btn secundario" onClick={() => { navigator.clipboard?.writeText(linkPublico); avisar('Link copiado.') }}>Copiar</button>
          <a className="btn" href={HOST.tipo === 'landing' ? linkPublico : `${linkPublico}?tenant=${perfil.slug}`} target="_blank" rel="noreferrer">Ver vitrine</a>
          <a className="btn secundario" href={`/api/assessores/publico/${perfil.slug}/catalogo.pdf`} target="_blank" rel="noreferrer">Baixar catálogo em PDF</a>
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
        <form className="cartao" onSubmit={salvarPerfil}>
          <h2 style={{ marginTop: 0 }}>Apresentação (capa da vitrine)</h2>
          <div className="campo">
            <label>Bio / apresentação</label>
            <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={4} maxLength={600} placeholder="Conte quem você é e como trabalha com as marcas que representa." />
          </div>
          <div className="linha-campos">
            <div className="campo"><label>WhatsApp pessoal</label><input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="Ex.: 5562999999999" /></div>
            <div className="campo"><label>Instagram pessoal</label><input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="https://instagram.com/..." /></div>
            <div className="campo"><label>Site</label><input value={site} onChange={(e) => setSite(e.target.value)} placeholder="https://..." /></div>
          </div>
          <div className="acoes"><button className="btn" disabled={salvandoPerfil}>Salvar</button></div>
        </form>
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
    </div>
  )
}
