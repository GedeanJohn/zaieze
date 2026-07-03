import { useCallback, useEffect, useState } from 'react'
import { api, mensagemDeErro, rotuloPapel, temFeature, usuarioLogado } from '../api'
import ConvidarModal from '../componentes/ConvidarModal'
import { useToast } from '../componentes/Toast'

interface Membro {
  id: string
  nome: string
  email: string
  role: 'GERENTE' | 'VENDEDORA'
  telefone?: string | null
  slugCatalogo?: string | null
  metaMensal?: string | null
  comissaoPadrao?: string | null
  ativo: boolean
  waNumero?: string | null
  _count?: { carteira: number }
}

/** Formata o número do WhatsApp (dígitos) como +55 (62) 99999-0011 quando possível. */
function formatarWhatsapp(num?: string | null): string {
  const d = (num ?? '').replace(/\D/g, '')
  if (d.length < 8) return num ?? ''
  const br = d.startsWith('55') ? d.slice(2) : d
  if (br.length === 11) return `+55 (${br.slice(0, 2)}) ${br.slice(2, 7)}-${br.slice(7)}`
  if (br.length === 10) return `+55 (${br.slice(0, 2)}) ${br.slice(2, 6)}-${br.slice(6)}`
  return `+${d}`
}

interface FormMembro {
  id?: string
  nome: string
  email: string
  role?: 'GERENTE' | 'VENDEDORA'
  senha?: string
  telefone?: string
  slugCatalogo?: string
  metaMensal?: string
  comissaoPadrao?: string
}

interface Loja {
  id: string
  nome: string
  slug: string
  cnpj?: string | null
  telefone?: string | null
  ativo: boolean
  usuarios?: { id: string; nome: string; email: string }[]
  _count?: { usuarios: number; clientes: number; equipes: number }
}

interface FormLoja {
  nome: string
  slug: string
  cnpj?: string
  telefone?: string
  gerente: { nome: string; email: string; senha: string; telefone: string }
}

interface Estoquista {
  id: string
  nome: string
  email: string
  telefone?: string | null
  ativo: boolean
}

type Aba = 'equipe' | 'lojas' | 'estoque'

export default function Equipe() {
  const usuario = usuarioLogado()!
  const ehGestor = usuario.role === 'GESTOR' || usuario.role === 'SUPER_ADMIN'
  const multiLoja = temFeature('multi_loja')
  // O gestor administra lojas e gestores de estoque (nível rede). O gerente só vê a equipe da própria loja.
  const mostraLojas = ehGestor && multiLoja
  const mostraEstoque = ehGestor && multiLoja

  const [aba, setAba] = useState<Aba>('equipe')

  // ── Lojas da rede (gestor) + loja selecionada para a aba "Equipe da loja" ──
  const [lojas, setLojas] = useState<Loja[]>([])
  const [lojaSel, setLojaSel] = useState<string>(() => (ehGestor ? localStorage.getItem('modacrm_lojaId') ?? '' : ''))
  const teamParams = ehGestor && lojaSel ? { lojaId: lojaSel } : {}
  const teamPronto = !ehGestor || !!lojaSel

  function escolherLoja(id: string) {
    localStorage.setItem('modacrm_lojaId', id)
    setLojaSel(id)
  }

  const carregarLojas = useCallback(async () => {
    if (!ehGestor) return
    const { data } = await api.get('/lojas')
    setLojas(data)
    setLojaSel((atual) => (data.some((l: Loja) => l.id === atual) ? atual : data[0]?.id ?? ''))
  }, [ehGestor])

  useEffect(() => { carregarLojas() }, [carregarLojas])

  // ── Equipe da loja (gerentes + vendedoras) ──
  const [equipe, setEquipe] = useState<Membro[]>([])
  const [form, setForm] = useState<FormMembro | null>(null)
  const [convidar, setConvidar] = useState(false)
  const [gerenciar, setGerenciar] = useState<Membro | null>(null)
  const [gModo, setGModo] = useState<'substituir' | 'desligar'>('substituir')
  const [gForm, setGForm] = useState({ nome: '', email: '', senha: '' })
  const [gDestino, setGDestino] = useState('')
  const [erro, setErro] = useState('')

  const carregarEquipe = useCallback(async () => {
    if (!teamPronto) return
    const { data } = await api.get('/usuarios', { params: teamParams })
    setEquipe(data)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamPronto, lojaSel])

  useEffect(() => { carregarEquipe() }, [carregarEquipe])

  // Meta derivada da loja (meta da loja ÷ nº de vendedoras) — mostrada na coluna da tabela.
  const [metaLojaData, setMetaLojaData] = useState<{ metaVendedora: number } | null>(null)
  const carregarMetaLoja = useCallback(() => {
    if (!teamPronto) { setMetaLojaData(null); return }
    api.get('/metas/loja', { params: teamParams }).then(({ data }) => setMetaLojaData(data)).catch(() => setMetaLojaData(null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamPronto, lojaSel])
  useEffect(() => { carregarMetaLoja() }, [carregarMetaLoja, equipe.length])

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return
    setErro('')
    const corpo: Record<string, unknown> = {
      nome: form.nome,
      email: form.email,
      telefone: form.telefone || undefined,
      slugCatalogo: form.slugCatalogo || undefined,
      comissaoPadrao: form.comissaoPadrao ? Number(form.comissaoPadrao) : undefined,
    }
    if (form.senha) corpo.senha = form.senha
    // Gestor escolhe a função (Gerente de Loja / Vendedora); gerente só cria vendedora.
    if (ehGestor && form.role) corpo.role = form.role
    else if (!form.id) corpo.role = 'VENDEDORA'
    try {
      if (form.id) await api.patch(`/usuarios/${form.id}`, corpo, { params: teamParams })
      else await api.post('/usuarios', corpo, { params: teamParams })
      setForm(null)
      carregarEquipe()
    } catch (err) {
      setErro(mensagemDeErro(err))
    }
  }

  async function alternarAtivo(m: Membro) {
    await api.patch(`/usuarios/${m.id}`, { ativo: !m.ativo }, { params: teamParams })
    carregarEquipe()
  }

  function abrirGerenciar(m: Membro) {
    setGerenciar(m); setGModo('substituir'); setGForm({ nome: '', email: '', senha: '' }); setGDestino(''); setErro('')
  }
  async function substituir(e: React.FormEvent) {
    e.preventDefault()
    if (!gerenciar) return
    setErro('')
    try {
      await api.post(`/usuarios/${gerenciar.id}/substituir`, gForm, { params: teamParams })
      setGerenciar(null); carregarEquipe()
    } catch (err) { setErro(mensagemDeErro(err)) }
  }
  async function desligar() {
    if (!gerenciar) return
    if (!confirm(`Desligar ${gerenciar.nome}?${gDestino ? ' A carteira será transferida.' : ' (sem transferir a carteira)'}`)) return
    setErro('')
    try {
      const { data } = await api.post(`/usuarios/${gerenciar.id}/desligar`, { paraVendedoraId: gDestino || undefined }, { params: teamParams })
      setGerenciar(null); carregarEquipe()
      alert(`${gerenciar.nome} desligada.` + (gDestino ? ` ${data.clientesTransferidos} cliente(s) e ${data.leadsTransferidos} lead(s) transferidos.` : ''))
    } catch (err) { setErro(mensagemDeErro(err)) }
  }

  // ── Lojas: cadastrar / editar ──
  const [formLoja, setFormLoja] = useState<FormLoja | null>(null)
  const [editLoja, setEditLoja] = useState<Loja | null>(null)

  async function salvarLoja(e: React.FormEvent) {
    e.preventDefault()
    if (!formLoja) return
    setErro('')
    try {
      await api.post('/lojas', {
        nome: formLoja.nome,
        slug: formLoja.slug,
        cnpj: formLoja.cnpj || undefined,
        telefone: formLoja.telefone || undefined,
        gerente: formLoja.gerente,
      })
      setFormLoja(null)
      carregarLojas()
    } catch (err) { setErro(mensagemDeErro(err)) }
  }

  async function salvarEdicaoLoja(e: React.FormEvent) {
    e.preventDefault()
    if (!editLoja) return
    setErro('')
    try {
      await api.patch(`/lojas/${editLoja.id}`, {
        nome: editLoja.nome,
        cnpj: editLoja.cnpj || null,
        telefone: editLoja.telefone || null,
        ativo: editLoja.ativo,
      })
      setEditLoja(null)
      carregarLojas()
    } catch (err) { setErro(mensagemDeErro(err)) }
  }

  // ── Gestores de estoque (nível rede) ──
  const [estoquistas, setEstoquistas] = useState<Estoquista[]>([])
  const [formE, setFormE] = useState<{ id?: string; nome: string; email: string; senha?: string; telefone?: string } | null>(null)
  const [convidarE, setConvidarE] = useState(false)

  const carregarEstoquistas = useCallback(async () => {
    if (!mostraEstoque) return
    const { data } = await api.get('/estoquistas')
    setEstoquistas(data)
  }, [mostraEstoque])

  useEffect(() => { carregarEstoquistas() }, [carregarEstoquistas])

  async function salvarEstoquista(e: React.FormEvent) {
    e.preventDefault()
    if (!formE) return
    setErro('')
    const corpo: Record<string, unknown> = { nome: formE.nome, email: formE.email, telefone: formE.telefone || undefined }
    if (formE.senha) corpo.senha = formE.senha
    try {
      if (formE.id) await api.patch(`/estoquistas/${formE.id}`, corpo)
      else await api.post('/estoquistas', corpo)
      setFormE(null)
      carregarEstoquistas()
    } catch (err) { setErro(mensagemDeErro(err)) }
  }

  async function alternarEstoquista(es: Estoquista) {
    await api.patch(`/estoquistas/${es.id}`, { ativo: !es.ativo })
    carregarEstoquistas()
  }

  const lojaAtualNome = lojas.find((l) => l.id === lojaSel)?.nome

  return (
    <>
      <header>
        <h1>Equipe</h1>
        {aba === 'equipe' && (
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn" onClick={() => setConvidar(true)} disabled={!teamPronto}>✉️ Convidar por link</button>
            <button className="btn secundario" onClick={() => setForm({ nome: '', email: '', role: 'VENDEDORA' })} disabled={!teamPronto}>+ Novo (com senha)</button>
          </div>
        )}
        {aba === 'lojas' && (
          <button className="btn" onClick={() => setFormLoja({ nome: '', slug: '', gerente: { nome: '', email: '', senha: '', telefone: '' } })}>+ Nova loja</button>
        )}
        {aba === 'estoque' && (
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn" onClick={() => setConvidarE(true)}>✉️ Convidar por link</button>
            <button className="btn secundario" onClick={() => setFormE({ nome: '', email: '', senha: '' })}>+ Novo (com senha)</button>
          </div>
        )}
      </header>

      {(usuario.role === 'GESTOR' || usuario.role === 'GERENTE') && <SolicitacoesSenhaSection />}

      {/* Abas (só fazem sentido para o gestor com multi-loja) */}
      {(mostraLojas || mostraEstoque) && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <button className={`btn ${aba === 'equipe' ? '' : 'secundario'}`} onClick={() => setAba('equipe')}>👥 Equipe da loja</button>
          {mostraLojas && <button className={`btn ${aba === 'lojas' ? '' : 'secundario'}`} onClick={() => setAba('lojas')}>🏬 Lojas</button>}
          {mostraEstoque && <button className={`btn ${aba === 'estoque' ? '' : 'secundario'}`} onClick={() => setAba('estoque')}>🦺 Gestores de Estoque</button>}
        </div>
      )}

      {erro && <div className="alerta">{erro}</div>}

      {/* ===================== ABA: EQUIPE DA LOJA ===================== */}
      {aba === 'equipe' && (
        <>
          <div className="cartao" style={{ fontSize: 13, color: 'var(--ink-soft)', display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', justifyContent: 'space-between' }}>
            <span>
              Plano <strong>{usuario.rede?.plano ?? '—'}</strong> — lojas e vendedoras ilimitadas; a diferença entre planos é por funcionalidade.
              {ehGestor && ' Cada Gerente de Loja administra as vendedoras da loja dele.'}
            </span>
            {ehGestor && lojas.length > 0 && (
              <span className="campo" style={{ minWidth: 220, marginBottom: 0 }}>
                <label>Loja</label>
                <select value={lojaSel} onChange={(e) => escolherLoja(e.target.value)}>
                  {lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}{l.ativo ? '' : ' (inativa)'}</option>)}
                </select>
              </span>
            )}
          </div>

          {ehGestor && lojas.length > 0 && <MetasConfig onSalvo={carregarMetaLoja} />}

          {ehGestor && lojas.length === 0 ? (
            <div className="cartao" style={{ color: 'var(--ink-soft)' }}>
              Nenhuma loja cadastrada ainda. {mostraLojas ? 'Cadastre uma loja na aba “Lojas” (você define o Gerente de Loja na criação).' : 'Cadastre uma loja para começar.'}
            </div>
          ) : (
            <div className="cartao">
              <table>
                <thead>
                  <tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>WhatsApp</th><th>Carteira</th><th>Meta mensal</th><th>Comissão</th><th>Status</th><th></th></tr>
                </thead>
                <tbody>
                  {equipe.map((m) => (
                    <tr key={m.id} style={{ opacity: m.ativo ? 1 : 0.5 }}>
                      <td>{m.nome}</td>
                      <td>{m.email}</td>
                      <td>{m.role === 'GERENTE' ? 'Gerente de Loja' : 'Vendedora'}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <span style={{ color: 'var(--ink-soft)' }}>{m.waNumero ? formatarWhatsapp(m.waNumero) : '—'}</span>
                      </td>
                      <td>{m._count?.carteira ?? 0} clientes</td>
                      <td>{m.role === 'VENDEDORA' && metaLojaData ? `R$ ${metaLojaData.metaVendedora.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}</td>
                      <td>{m.comissaoPadrao ? `${Number(m.comissaoPadrao)}%` : '—'}</td>
                      <td><span className={`selo ${m.ativo ? 'ok' : 'baixo'}`}>{m.ativo ? 'ativa' : 'inativa'}</span></td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <a href="#" onClick={(e) => { e.preventDefault(); setForm({ ...m, comissaoPadrao: m.comissaoPadrao ?? '', senha: '' } as FormMembro) }}>editar</a>
                        {m.role === 'VENDEDORA' && (
                          <>
                            {' · '}
                            <a href="#" onClick={(e) => { e.preventDefault(); alternarAtivo(m) }}>{m.ativo ? 'desativar' : 'reativar'}</a>
                            {' · '}
                            <a href="#" onClick={(e) => { e.preventDefault(); abrirGerenciar(m) }}>substituir/desligar</a>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                  {equipe.length === 0 && <tr><td colSpan={9} style={{ color: 'var(--ink-soft)' }}>Nenhum membro nesta loja ainda.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ===================== ABA: LOJAS ===================== */}
      {aba === 'lojas' && mostraLojas && (
        <div className="cartao">
          <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 12 }}>
            Cada loja vive em <strong>{usuario.rede?.nome ?? 'sua marca'}</strong> e tem um <strong>Gerente de Loja</strong> (você define na criação; pode adicionar mais na aba “Equipe da loja”). O Gerente aloca as vendedoras da loja dele.
          </div>
          <table>
            <thead>
              <tr><th>Loja</th><th>Endereço (slug)</th><th>Gerente(s)</th><th>Pessoas</th><th>Clientes</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {lojas.map((l) => (
                <tr key={l.id} style={{ opacity: l.ativo ? 1 : 0.5 }}>
                  <td>{l.nome}</td>
                  <td style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{l.slug}.{usuario.rede ? '' : ''}…</td>
                  <td>{l.usuarios?.length ? l.usuarios.map((g) => g.nome).join(', ') : <span style={{ color: 'var(--ink-soft)' }}>—</span>}</td>
                  <td>{l._count?.usuarios ?? 0}</td>
                  <td>{l._count?.clientes ?? 0}</td>
                  <td><span className={`selo ${l.ativo ? 'ok' : 'baixo'}`}>{l.ativo ? 'ativa' : 'inativa'}</span></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <a href="#" onClick={(e) => { e.preventDefault(); setEditLoja(l) }}>editar</a>
                    {' · '}
                    <a href="#" onClick={(e) => { e.preventDefault(); escolherLoja(l.id); setAba('equipe') }}>ver equipe</a>
                  </td>
                </tr>
              ))}
              {lojas.length === 0 && <tr><td colSpan={7} style={{ color: 'var(--ink-soft)' }}>Nenhuma loja cadastrada.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* ===================== ABA: GESTORES DE ESTOQUE ===================== */}
      {aba === 'estoque' && mostraEstoque && (
        <div className="cartao">
          <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 12 }}>
            Gestores de estoque atuam no nível da <strong>rede</strong>: lançam entradas de produção, fazem transferências e ajustes de estoque nas lojas. Pode ter mais de um.
          </div>
          <table>
            <thead>
              <tr><th>Nome</th><th>E-mail</th><th>Telefone</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {estoquistas.map((es) => (
                <tr key={es.id} style={{ opacity: es.ativo ? 1 : 0.5 }}>
                  <td>{es.nome}</td>
                  <td>{es.email}</td>
                  <td>{es.telefone ?? '—'}</td>
                  <td><span className={`selo ${es.ativo ? 'ok' : 'baixo'}`}>{es.ativo ? 'Ativo' : 'Inativo'}</span></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <a href="#" onClick={(e) => { e.preventDefault(); setFormE({ id: es.id, nome: es.nome, email: es.email, telefone: es.telefone ?? '' }) }}>editar</a>
                    {' · '}
                    <a href="#" onClick={(e) => { e.preventDefault(); alternarEstoquista(es) }}>{es.ativo ? 'desativar' : 'ativar'}</a>
                  </td>
                </tr>
              ))}
              {estoquistas.length === 0 && <tr><td colSpan={5} style={{ color: 'var(--ink-soft)' }}>Nenhum gestor de estoque cadastrado.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* ===================== MODAIS ===================== */}
      {convidar && (
        <ConvidarModal
          papeis={ehGestor ? [{ valor: 'VENDEDORA', rotulo: 'Vendedora' }, { valor: 'GERENTE', rotulo: 'Gerente de Loja' }] : [{ valor: 'VENDEDORA', rotulo: 'Vendedora' }]}
          lojas={ehGestor ? lojas.map((l) => ({ id: l.id, nome: l.nome })) : undefined}
          onClose={() => setConvidar(false)}
        />
      )}

      {convidarE && (
        <ConvidarModal papeis={[{ valor: 'ESTOQUISTA', rotulo: 'Gestor de Estoque' }]} onClose={() => setConvidarE(false)} />
      )}

      {gerenciar && (
        <div className="modal-fundo" onClick={() => setGerenciar(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(520px, 94vw)' }}>
            <h2>Substituir ou desligar — {gerenciar.nome}</h2>
            {erro && <div className="alerta">{erro}</div>}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <button type="button" className={`btn ${gModo === 'substituir' ? '' : 'secundario'}`} onClick={() => setGModo('substituir')}>Substituir pessoa</button>
              <button type="button" className={`btn ${gModo === 'desligar' ? '' : 'secundario'}`} onClick={() => setGModo('desligar')}>Desligar</button>
            </div>

            {gModo === 'substituir' ? (
              <form onSubmit={substituir}>
                <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 0 }}>
                  Coloca <strong>outra pessoa</strong> nesta posição <strong>mantendo a carteira</strong>, clientes, leads e histórico. O WhatsApp é desconectado (o novo titular conecta o dele).
                </p>
                <div className="campo"><label>Nome do novo titular*</label><input value={gForm.nome} onChange={(e) => setGForm({ ...gForm, nome: e.target.value })} required /></div>
                <div className="linha-campos">
                  <div className="campo"><label>E-mail (novo login)*</label><input type="email" value={gForm.email} onChange={(e) => setGForm({ ...gForm, email: e.target.value })} required /></div>
                  <div className="campo"><label>Senha* (mín. 6)</label><input type="password" value={gForm.senha} onChange={(e) => setGForm({ ...gForm, senha: e.target.value })} minLength={6} required /></div>
                </div>
                <div className="acoes">
                  <button type="button" className="btn secundario" onClick={() => setGerenciar(null)}>Cancelar</button>
                  <button className="btn">Substituir</button>
                </div>
              </form>
            ) : (
              <div>
                <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 0 }}>
                  Desativa a vendedora e <strong>transfere a carteira</strong> (clientes + leads abertos) para outra vendedora. O histórico de vendas dela é preservado.
                </p>
                <div className="campo">
                  <label>Transferir carteira para</label>
                  <select value={gDestino} onChange={(e) => setGDestino(e.target.value)}>
                    <option value="">— Não transferir (só desativar) —</option>
                    {equipe.filter((v) => v.role === 'VENDEDORA' && v.ativo && v.id !== gerenciar.id).map((v) => (
                      <option key={v.id} value={v.id}>{v.nome}</option>
                    ))}
                  </select>
                </div>
                <div className="acoes">
                  <button type="button" className="btn secundario" onClick={() => setGerenciar(null)}>Cancelar</button>
                  <button type="button" className="btn" onClick={desligar}>Desligar</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {form && (
        <div className="modal-fundo" onClick={() => setForm(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={salvar}>
            <h2>{form.id ? 'Editar membro' : 'Novo membro'}{!form.id && lojaAtualNome ? ` — ${lojaAtualNome}` : ''}</h2>
            {erro && <div className="alerta">{erro}</div>}
            <div className="linha-campos">
              <div className="campo">
                <label>Nome*</label>
                <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
              </div>
              <div className="campo">
                <label>E-mail*</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
              </div>
            </div>
            {ehGestor && (
              <div className="campo">
                <label>Função</label>
                <select value={form.role ?? 'VENDEDORA'} onChange={(e) => setForm({ ...form, role: e.target.value as 'GERENTE' | 'VENDEDORA' })}>
                  <option value="VENDEDORA">Vendedora</option>
                  <option value="GERENTE">Gerente de Loja</option>
                </select>
                <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>
                  {form.id ? 'Mudou de função? Troque aqui (a carteira e o histórico são mantidos).' : 'Pode haver mais de um Gerente de Loja por loja.'}
                </div>
              </div>
            )}
            <div className="linha-campos">
              <div className="campo">
                <label>{form.id ? 'Nova senha (opcional)' : 'Senha* (mín. 6)'}</label>
                <input type="password" value={form.senha ?? ''} onChange={(e) => setForm({ ...form, senha: e.target.value })} required={!form.id} minLength={6} />
              </div>
              <div className="campo">
                <label>{form.id ? 'Telefone/WhatsApp' : 'Telefone/WhatsApp*'}</label>
                <input value={form.telefone ?? ''} onChange={(e) => setForm({ ...form, telefone: e.target.value })} required={!form.id} />
              </div>
            </div>
            <div className="linha-campos">
              <div className="campo">
                <label>Slug do catálogo (loja.com/...)</label>
                <input value={form.slugCatalogo ?? ''} onChange={(e) => setForm({ ...form, slugCatalogo: e.target.value })} placeholder="camila" />
              </div>
              <div className="campo">
                <label>Comissão padrão (%)</label>
                <input type="number" step="0.1" min="0" max="100" value={form.comissaoPadrao ?? ''} onChange={(e) => setForm({ ...form, comissaoPadrao: e.target.value })} />
              </div>
            </div>
            <div className="acoes">
              <button type="button" className="btn secundario" onClick={() => setForm(null)}>Cancelar</button>
              <button className="btn">Salvar</button>
            </div>
          </form>
        </div>
      )}

      {formLoja && (
        <div className="modal-fundo" onClick={() => setFormLoja(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={salvarLoja} style={{ width: 'min(560px, 94vw)' }}>
            <h2>Nova loja</h2>
            <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 0 }}>
              A loja entra na sua marca e já nasce com um <strong>Gerente de Loja</strong>. Depois ele aloca as vendedoras na aba “Equipe da loja”.
            </p>
            {erro && <div className="alerta">{erro}</div>}
            <div className="linha-campos">
              <div className="campo">
                <label>Nome da loja*</label>
                <input value={formLoja.nome} onChange={(e) => setFormLoja({ ...formLoja, nome: e.target.value })} required />
              </div>
              <div className="campo">
                <label>Slug (endereço)*</label>
                <input value={formLoja.slug} onChange={(e) => setFormLoja({ ...formLoja, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} placeholder="loja-shopping" required />
              </div>
            </div>
            <div className="linha-campos">
              <div className="campo">
                <label>CNPJ</label>
                <input value={formLoja.cnpj ?? ''} onChange={(e) => setFormLoja({ ...formLoja, cnpj: e.target.value })} />
              </div>
              <div className="campo">
                <label>Telefone</label>
                <input value={formLoja.telefone ?? ''} onChange={(e) => setFormLoja({ ...formLoja, telefone: e.target.value })} placeholder="5562999990011" />
              </div>
            </div>
            <h3 style={{ marginBottom: 6 }}>Gerente de Loja</h3>
            <div className="campo">
              <label>Nome*</label>
              <input value={formLoja.gerente.nome} onChange={(e) => setFormLoja({ ...formLoja, gerente: { ...formLoja.gerente, nome: e.target.value } })} required />
            </div>
            <div className="linha-campos">
              <div className="campo">
                <label>E-mail (login)*</label>
                <input type="email" value={formLoja.gerente.email} onChange={(e) => setFormLoja({ ...formLoja, gerente: { ...formLoja.gerente, email: e.target.value } })} required />
              </div>
              <div className="campo">
                <label>Senha* (mín. 6)</label>
                <input type="password" value={formLoja.gerente.senha} onChange={(e) => setFormLoja({ ...formLoja, gerente: { ...formLoja.gerente, senha: e.target.value } })} minLength={6} required />
              </div>
            </div>
            <div className="campo">
              <label>WhatsApp do gerente (com DDD)*</label>
              <input value={formLoja.gerente.telefone} onChange={(e) => setFormLoja({ ...formLoja, gerente: { ...formLoja.gerente, telefone: e.target.value } })} placeholder="5562999990011" inputMode="tel" required />
              <small style={{ color: 'var(--ink-soft)' }}>É pra onde vai a senha, caso o gerente a esqueça.</small>
            </div>
            <div className="acoes">
              <button type="button" className="btn secundario" onClick={() => setFormLoja(null)}>Cancelar</button>
              <button className="btn">Criar loja</button>
            </div>
          </form>
        </div>
      )}

      {editLoja && (
        <div className="modal-fundo" onClick={() => setEditLoja(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={salvarEdicaoLoja} style={{ width: 'min(520px, 94vw)' }}>
            <h2>Editar loja — {editLoja.nome}</h2>
            {erro && <div className="alerta">{erro}</div>}
            <div className="campo">
              <label>Nome*</label>
              <input value={editLoja.nome} onChange={(e) => setEditLoja({ ...editLoja, nome: e.target.value })} required />
            </div>
            <div className="linha-campos">
              <div className="campo">
                <label>CNPJ</label>
                <input value={editLoja.cnpj ?? ''} onChange={(e) => setEditLoja({ ...editLoja, cnpj: e.target.value })} />
              </div>
              <div className="campo">
                <label>Telefone</label>
                <input value={editLoja.telefone ?? ''} onChange={(e) => setEditLoja({ ...editLoja, telefone: e.target.value })} />
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, marginBottom: 8 }}>
              <input type="checkbox" checked={editLoja.ativo} onChange={(e) => setEditLoja({ ...editLoja, ativo: e.target.checked })} style={{ width: 'auto' }} />
              Loja ativa
            </label>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 8 }}>
              O endereço (slug <strong>{editLoja.slug}</strong>) não é alterável após a criação.
            </div>
            <div className="acoes">
              <button type="button" className="btn secundario" onClick={() => setEditLoja(null)}>Cancelar</button>
              <button className="btn">Salvar</button>
            </div>
          </form>
        </div>
      )}

      {formE && (
        <div className="modal-fundo" onClick={() => setFormE(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={salvarEstoquista} style={{ width: 'min(520px, 92vw)' }}>
            <h2>{formE.id ? 'Editar gestor de estoque' : 'Novo gestor de estoque'}</h2>
            {erro && <div className="alerta">{erro}</div>}
            <div className="campo">
              <label>Nome*</label>
              <input value={formE.nome} onChange={(e) => setFormE({ ...formE, nome: e.target.value })} required />
            </div>
            <div className="linha-campos">
              <div className="campo">
                <label>E-mail*</label>
                <input type="email" value={formE.email} onChange={(e) => setFormE({ ...formE, email: e.target.value })} required />
              </div>
              <div className="campo">
                <label>{formE.id ? 'Telefone' : 'Telefone*'}</label>
                <input value={formE.telefone ?? ''} onChange={(e) => setFormE({ ...formE, telefone: e.target.value })} placeholder="5562999990011" required={!formE.id} />
              </div>
            </div>
            <div className="campo">
              <label>{formE.id ? 'Nova senha (deixe vazio para manter)' : 'Senha*'}</label>
              <input type="password" value={formE.senha ?? ''} onChange={(e) => setFormE({ ...formE, senha: e.target.value })} required={!formE.id} minLength={6} placeholder="mínimo 6 caracteres" />
            </div>
            <div className="acoes">
              <button type="button" className="btn secundario" onClick={() => setFormE(null)}>Cancelar</button>
              <button className="btn">Salvar</button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}

// ── Configuração das metas (marca → loja → vendedora) — gestor ──
interface LojaMeta { id: string; nome: string; metaManual: number; numVendedoras: number; metaLoja: number; metaVendedora: number }
interface MetasResp { metaMensal: number; metaModo: 'IGUAL' | 'MANUAL'; lojas: LojaMeta[] }

function brl(v: number): string {
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
}

function MetasConfig({ onSalvo }: { onSalvo: () => void }) {
  const [cfg, setCfg] = useState<MetasResp | null>(null)
  const [meta, setMeta] = useState('')
  const [modo, setModo] = useState<'IGUAL' | 'MANUAL'>('IGUAL')
  const [porLoja, setPorLoja] = useState<Record<string, string>>({})
  const avisar = useToast()
  const [ocupado, setOcupado] = useState(false)

  const carregar = useCallback(() => {
    api.get('/metas').then(({ data }) => {
      const d = data as MetasResp
      setCfg(d)
      setMeta(d.metaMensal ? String(d.metaMensal) : '')
      setModo(d.metaModo)
      setPorLoja(Object.fromEntries(d.lojas.map((l) => [l.id, l.metaManual ? String(l.metaManual) : ''])))
    }).catch(() => {})
  }, [])
  useEffect(() => { carregar() }, [carregar])

  async function salvar() {
    setOcupado(true)
    try {
      await api.put('/metas', {
        metaMensal: meta ? Number(meta) : 0,
        metaModo: modo,
        metasPorLoja: modo === 'MANUAL'
          ? Object.fromEntries(Object.entries(porLoja).map(([k, v]) => [k, v ? Number(v) : 0]))
          : undefined,
      })
      avisar('Metas salvas.')
      carregar()
      onSalvo()
    } catch (e) { avisar(mensagemDeErro(e), 'erro') } finally { setOcupado(false) }
  }

  if (!cfg) return null
  return (
    <div className="cartao">
      <h2 style={{ marginTop: 0 }}>🎯 Metas mensais</h2>
      <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 12 }}>
        Defina a meta da marca; ela é distribuída às lojas e, dentro de cada loja, dividida igualmente entre as vendedoras.
      </div>
      <div className="linha-campos">
        <div className="campo">
          <label>Meta da marca (R$/mês)</label>
          <input type="number" step="0.01" min="0" value={meta} onChange={(e) => setMeta(e.target.value)} />
        </div>
        <div className="campo">
          <label>Distribuição entre as lojas</label>
          <select value={modo} onChange={(e) => setModo(e.target.value as 'IGUAL' | 'MANUAL')}>
            <option value="IGUAL">Igual (divide a meta da marca entre as lojas)</option>
            <option value="MANUAL">Manual (defino a meta de cada loja)</option>
          </select>
        </div>
      </div>
      <table>
        <thead>
          <tr><th>Loja</th><th>Vendedoras</th><th>Meta da loja</th><th>Meta por vendedora</th></tr>
        </thead>
        <tbody>
          {cfg.lojas.map((l) => (
            <tr key={l.id}>
              <td>{l.nome}</td>
              <td>{l.numVendedoras}</td>
              <td>
                {modo === 'MANUAL'
                  ? <input type="number" step="0.01" min="0" value={porLoja[l.id] ?? ''} onChange={(e) => setPorLoja({ ...porLoja, [l.id]: e.target.value })} style={{ width: 130 }} />
                  : brl(l.metaLoja)}
              </td>
              <td>{brl(l.metaVendedora)}</td>
            </tr>
          ))}
          {cfg.lojas.length === 0 && <tr><td colSpan={4} style={{ color: 'var(--ink-soft)' }}>Cadastre uma loja primeiro.</td></tr>}
        </tbody>
      </table>
      <div style={{ marginTop: 10 }}>
        <button className="btn" onClick={salvar} disabled={ocupado}>{ocupado ? 'Salvando…' : 'Salvar metas'}</button>
        <span style={{ fontSize: 12, color: 'var(--ink-soft)', marginLeft: 10 }}>
          Os valores "por vendedora" atualizam após salvar.
        </span>
      </div>
    </div>
  )
}

// ── Solicitações de "esqueci minha senha" da equipe (sem WhatsApp cadastrado) ──
interface SolicitacaoSenha { id: string; createdAt: string; usuario: { id: string; nome: string; email: string; role: string } }

function SolicitacoesSenhaSection() {
  const [lista, setLista] = useState<SolicitacaoSenha[]>([])
  const [gerada, setGerada] = useState<{ nome: string; senha: string } | null>(null)
  const [erro, setErro] = useState('')

  function carregar() {
    api.get('/usuarios/solicitacoes-senha').then(({ data }) => setLista(data)).catch(() => {})
  }
  useEffect(() => { carregar() }, [])

  async function gerar(s: SolicitacaoSenha) {
    setErro('')
    try {
      const { data } = await api.post(`/usuarios/solicitacoes-senha/${s.id}/gerar`)
      setGerada({ nome: s.usuario.nome, senha: data.senha })
      carregar()
    } catch (e) { setErro(mensagemDeErro(e)) }
  }

  if (lista.length === 0) return null

  return (
    <div className="cartao" style={{ borderLeft: '4px solid var(--accent)' }}>
      <h2 style={{ marginTop: 0, fontSize: 16 }}>🔑 Pedidos de redefinição de senha ({lista.length})</h2>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 0 }}>
        Sem WhatsApp cadastrado, essas pessoas não recebem a senha provisória sozinhas. Gere uma senha e repasse por WhatsApp.
      </p>
      {erro && <div className="alerta">{erro}</div>}
      {gerada && (
        <div className="sucesso" style={{ marginBottom: 10 }}>
          Senha provisória de <strong>{gerada.nome}</strong>: <strong>{gerada.senha}</strong> — copie e envie por WhatsApp.
        </div>
      )}
      <table>
        <thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Pedido em</th><th></th></tr></thead>
        <tbody>
          {lista.map((s) => (
            <tr key={s.id}>
              <td>{s.usuario.nome}</td>
              <td>{s.usuario.email}</td>
              <td>{rotuloPapel[s.usuario.role as keyof typeof rotuloPapel] ?? s.usuario.role}</td>
              <td>{new Date(s.createdAt).toLocaleString('pt-BR')}</td>
              <td><a href="#" onClick={(e) => { e.preventDefault(); gerar(s) }}>gerar senha</a></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
