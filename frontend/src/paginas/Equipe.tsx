import { useCallback, useEffect, useState } from 'react'
import { api, mensagemDeErro, usuarioLogado } from '../api'
import ConvidarModal from '../componentes/ConvidarModal'
import { useToast } from '../componentes/Toast'
import CampoSenha from '../componentes/CampoSenha'
import { useIdioma } from '../lib/i18n'
import { entrarComoDaEquipe } from '../lib/impersonar'
import { HOST, urlCatalogo } from '../host'

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
  const { t } = useIdioma()
  const ehGestor = usuario.role === 'GESTOR' || usuario.role === 'SUPER_ADMIN'
  // O gestor administra lojas e gestores de estoque (nível rede). O gerente só vê a equipe da própria loja.
  const mostraLojas = ehGestor
  const mostraEstoque = ehGestor

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

  async function entrarComo(id: string, nome: string) {
    if (!window.confirm(`Entrar como ${nome}? Fica registrado. Um banner aparece pra você voltar quando quiser.`)) return
    try { await entrarComoDaEquipe(id) } catch (e) { window.alert(mensagemDeErro(e)) }
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
    const extraConfirm = gDestino ? t('equipe.carteiraSeraTransferida') : t('equipe.semTransferirCarteira')
    if (!confirm(t('equipe.confirmDesligar', { nome: gerenciar.nome, extra: extraConfirm }))) return
    setErro('')
    try {
      const { data } = await api.post(`/usuarios/${gerenciar.id}/desligar`, { paraVendedoraId: gDestino || undefined }, { params: teamParams })
      setGerenciar(null); carregarEquipe()
      alert(t('equipe.desligadaSucesso', { nome: gerenciar.nome }) + (gDestino ? t('equipe.transferidosSufixo', { clientes: data.clientesTransferidos, leads: data.leadsTransferidos }) : ''))
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
        <h1>{t('equipe.titulo')}</h1>
        {aba === 'equipe' && (
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn" onClick={() => setConvidar(true)} disabled={!teamPronto}>{t('equipe.convidarPorLink')}</button>
            <button className="btn secundario" onClick={() => setForm({ nome: '', email: '', role: 'VENDEDORA' })} disabled={!teamPronto}>{t('equipe.novoComSenha')}</button>
          </div>
        )}
        {aba === 'lojas' && (
          <button className="btn" onClick={() => setFormLoja({ nome: '', slug: '', gerente: { nome: '', email: '', senha: '', telefone: '' } })}>{t('equipe.novaLoja')}</button>
        )}
        {aba === 'estoque' && (
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn" onClick={() => setConvidarE(true)}>{t('equipe.convidarPorLink')}</button>
            <button className="btn secundario" onClick={() => setFormE({ nome: '', email: '', senha: '' })}>{t('equipe.novoComSenha')}</button>
          </div>
        )}
      </header>

      {(usuario.role === 'GESTOR' || usuario.role === 'GERENTE') && <SolicitacoesSenhaSection />}

      {/* Abas (só fazem sentido para o gestor com multi-loja) */}
      {(mostraLojas || mostraEstoque) && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <button className={`btn ${aba === 'equipe' ? '' : 'secundario'}`} onClick={() => setAba('equipe')}>{t('equipe.abaEquipeDaLoja')}</button>
          {mostraLojas && <button className={`btn ${aba === 'lojas' ? '' : 'secundario'}`} onClick={() => setAba('lojas')}>{t('equipe.abaLojas')}</button>}
          {mostraEstoque && <button className={`btn ${aba === 'estoque' ? '' : 'secundario'}`} onClick={() => setAba('estoque')}>{t('equipe.abaGestoresEstoque')}</button>}
        </div>
      )}

      {erro && <div className="alerta">{erro}</div>}

      {/* ===================== ABA: EQUIPE DA LOJA ===================== */}
      {aba === 'equipe' && (
        <>
          <div className="cartao" style={{ fontSize: 13, color: 'var(--ink-soft)', display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', justifyContent: 'space-between' }}>
            <span>
              {ehGestor && t('equipe.gerenteAdministraVendedoras')}
            </span>
            {ehGestor && lojas.length > 0 && (
              <span className="campo" style={{ minWidth: 220, marginBottom: 0 }}>
                <label>{t('equipe.lojaLabel')}</label>
                <select value={lojaSel} onChange={(e) => escolherLoja(e.target.value)}>
                  {lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}{l.ativo ? '' : ` ${t('equipe.inativaSufixo')}`}</option>)}
                </select>
              </span>
            )}
          </div>

          {ehGestor && lojas.length > 0 && <MetasConfig onSalvo={carregarMetaLoja} />}

          {ehGestor && lojas.length === 0 ? (
            <div className="cartao" style={{ color: 'var(--ink-soft)' }}>
              {t('equipe.nenhumaLojaCadastrada')} {mostraLojas ? t('equipe.cadastreLojaAbaLojas') : t('equipe.cadastreLojaComecar')}
            </div>
          ) : (
            <div className="cartao">
              <table>
                <thead>
                  <tr><th>{t('equipe.colNome')}</th><th>{t('equipe.colEmail')}</th><th>{t('equipe.colPapel')}</th><th>{t('equipe.colWhatsapp')}</th><th>{t('equipe.colCarteira')}</th><th>{t('equipe.colMetaMensal')}</th><th>{t('equipe.colComissao')}</th><th>{t('equipe.colStatus')}</th><th></th></tr>
                </thead>
                <tbody>
                  {equipe.map((m) => (
                    <tr key={m.id} style={{ opacity: m.ativo ? 1 : 0.5 }}>
                      <td>{m.nome}</td>
                      <td>{m.email}</td>
                      <td>{m.role === 'GERENTE' ? t('equipe.gerenteDeLojaOpt') : t('equipe.vendedoraOpt')}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <span style={{ color: 'var(--ink-soft)' }}>{m.telefone ? formatarWhatsapp(m.telefone) : '—'}</span>
                      </td>
                      <td>{t('equipe.clientesSufixo', { n: m._count?.carteira ?? 0 })}</td>
                      <td>{m.role === 'VENDEDORA' && metaLojaData ? `R$ ${metaLojaData.metaVendedora.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}</td>
                      <td>{m.comissaoPadrao ? `${Number(m.comissaoPadrao)}%` : '—'}</td>
                      <td><span className={`selo ${m.ativo ? 'ok' : 'baixo'}`}>{m.ativo ? t('equipe.ativa') : t('equipe.inativa')}</span></td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <a href="#" onClick={(e) => { e.preventDefault(); setForm({ ...m, comissaoPadrao: m.comissaoPadrao ?? '', senha: '' } as FormMembro) }}>{t('equipe.editar')}</a>
                        {usuario.role === 'GESTOR' && (
                          <>
                            {' · '}
                            <a href="#" onClick={(e) => { e.preventDefault(); entrarComo(m.id, m.nome) }}>entrar como</a>
                          </>
                        )}
                        {m.role === 'VENDEDORA' && m.slugCatalogo && (
                          <>
                            {' · '}
                            <a href={urlCatalogo(HOST.slug!, `/${m.slugCatalogo}`)} target="_blank" rel="noopener noreferrer">{t('equipe.verVitrine')}</a>
                          </>
                        )}
                        {m.role === 'VENDEDORA' && (
                          <>
                            {' · '}
                            <a href="#" onClick={(e) => { e.preventDefault(); alternarAtivo(m) }}>{m.ativo ? t('equipe.desativar') : t('equipe.reativar')}</a>
                            {' · '}
                            <a href="#" onClick={(e) => { e.preventDefault(); abrirGerenciar(m) }}>{t('equipe.substituirDesligar')}</a>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                  {equipe.length === 0 && <tr><td colSpan={9} style={{ color: 'var(--ink-soft)' }}>{t('equipe.nenhumMembro')}</td></tr>}
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
            {t('equipe.lojasVivemTexto1')} <strong>{usuario.rede?.nome ?? t('equipe.suaMarca')}</strong> {t('equipe.lojasVivemTexto2')} <strong>{t('equipe.gerenteDeLojaDestaque')}</strong> {t('equipe.lojasVivemTexto3')}
          </div>
          <table>
            <thead>
              <tr><th>{t('equipe.colLoja')}</th><th>{t('equipe.colEndereco')}</th><th>{t('equipe.colGerentes')}</th><th>{t('equipe.colPessoas')}</th><th>{t('equipe.colClientes')}</th><th>{t('equipe.colStatus')}</th><th></th></tr>
            </thead>
            <tbody>
              {lojas.map((l) => (
                <tr key={l.id} style={{ opacity: l.ativo ? 1 : 0.5 }}>
                  <td>{l.nome}</td>
                  <td style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{l.slug}.{usuario.rede ? '' : ''}…</td>
                  <td>{l.usuarios?.length ? l.usuarios.map((g) => g.nome).join(', ') : <span style={{ color: 'var(--ink-soft)' }}>—</span>}</td>
                  <td>{l._count?.usuarios ?? 0}</td>
                  <td>{l._count?.clientes ?? 0}</td>
                  <td><span className={`selo ${l.ativo ? 'ok' : 'baixo'}`}>{l.ativo ? t('equipe.ativa') : t('equipe.inativa')}</span></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <a href="#" onClick={(e) => { e.preventDefault(); setEditLoja(l) }}>{t('equipe.editar')}</a>
                    {' · '}
                    <a href="#" onClick={(e) => { e.preventDefault(); escolherLoja(l.id); setAba('equipe') }}>{t('equipe.verEquipe')}</a>
                  </td>
                </tr>
              ))}
              {lojas.length === 0 && <tr><td colSpan={7} style={{ color: 'var(--ink-soft)' }}>{t('equipe.nenhumaLojaCadastrada2')}</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* ===================== ABA: GESTORES DE ESTOQUE ===================== */}
      {aba === 'estoque' && mostraEstoque && (
        <div className="cartao">
          <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 12 }}>
            {t('equipe.gestoresEstoqueTexto1')} <strong>{t('equipe.redeDestaque')}</strong>{t('equipe.gestoresEstoqueTexto2')}
          </div>
          <table>
            <thead>
              <tr><th>{t('equipe.colNome')}</th><th>{t('equipe.colEmail')}</th><th>{t('equipe.colTelefone')}</th><th>{t('equipe.colStatus')}</th><th></th></tr>
            </thead>
            <tbody>
              {estoquistas.map((es) => (
                <tr key={es.id} style={{ opacity: es.ativo ? 1 : 0.5 }}>
                  <td>{es.nome}</td>
                  <td>{es.email}</td>
                  <td>{es.telefone ?? '—'}</td>
                  <td><span className={`selo ${es.ativo ? 'ok' : 'baixo'}`}>{es.ativo ? t('equipe.ativo') : t('equipe.inativoCap')}</span></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <a href="#" onClick={(e) => { e.preventDefault(); setFormE({ id: es.id, nome: es.nome, email: es.email, telefone: es.telefone ?? '' }) }}>{t('equipe.editar')}</a>
                    {' · '}
                    <a href="#" onClick={(e) => { e.preventDefault(); alternarEstoquista(es) }}>{es.ativo ? t('equipe.desativar') : t('equipe.ativarLink')}</a>
                    {usuario.role === 'GESTOR' && (
                      <>
                        {' · '}
                        <a href="#" onClick={(e) => { e.preventDefault(); entrarComo(es.id, es.nome) }}>entrar como</a>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {estoquistas.length === 0 && <tr><td colSpan={5} style={{ color: 'var(--ink-soft)' }}>{t('equipe.nenhumGestorEstoque')}</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* ===================== MODAIS ===================== */}
      {convidar && (
        <ConvidarModal
          papeis={ehGestor ? [{ valor: 'VENDEDORA', rotulo: t('equipe.vendedoraOpt') }, { valor: 'GERENTE', rotulo: t('equipe.gerenteDeLojaOpt') }] : [{ valor: 'VENDEDORA', rotulo: t('equipe.vendedoraOpt') }]}
          lojas={ehGestor ? lojas.map((l) => ({ id: l.id, nome: l.nome })) : undefined}
          onClose={() => setConvidar(false)}
        />
      )}

      {convidarE && (
        <ConvidarModal papeis={[{ valor: 'ESTOQUISTA', rotulo: t('papel.ESTOQUISTA') }]} onClose={() => setConvidarE(false)} />
      )}

      {gerenciar && (
        <div className="modal-fundo" onClick={() => setGerenciar(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(520px, 94vw)' }}>
            <h2>{t('equipe.substituirOuDesligarTitulo', { nome: gerenciar.nome })}</h2>
            {erro && <div className="alerta">{erro}</div>}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <button type="button" className={`btn ${gModo === 'substituir' ? '' : 'secundario'}`} onClick={() => setGModo('substituir')}>{t('equipe.substituirPessoa')}</button>
              <button type="button" className={`btn ${gModo === 'desligar' ? '' : 'secundario'}`} onClick={() => setGModo('desligar')}>{t('equipe.desligarBtn')}</button>
            </div>

            {gModo === 'substituir' ? (
              <form onSubmit={substituir}>
                <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 0 }}>
                  {t('equipe.substituirTexto1')} <strong>{t('equipe.outraPessoaDestaque')}</strong> {t('equipe.substituirTexto2')} <strong>{t('equipe.mantendoCarteiraDestaque')}</strong>{t('equipe.substituirTexto3')}
                </p>
                <div className="campo"><label>{t('equipe.nomeNovoTitular')}</label><input value={gForm.nome} onChange={(e) => setGForm({ ...gForm, nome: e.target.value })} required /></div>
                <div className="linha-campos">
                  <div className="campo"><label>{t('equipe.emailNovoLogin')}</label><input type="email" value={gForm.email} onChange={(e) => setGForm({ ...gForm, email: e.target.value })} required /></div>
                  <div className="campo"><label>{t('equipe.senhaMin6')}</label><CampoSenha value={gForm.senha} onChange={(e) => setGForm({ ...gForm, senha: e.target.value })} minLength={6} required /></div>
                </div>
                <div className="acoes">
                  <button type="button" className="btn secundario" onClick={() => setGerenciar(null)}>{t('comum.cancelar')}</button>
                  <button className="btn">{t('equipe.substituirBtn')}</button>
                </div>
              </form>
            ) : (
              <div>
                <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 0 }}>
                  {t('equipe.desligarTexto1')} <strong>{t('equipe.transfereCarteiraDestaque')}</strong> {t('equipe.desligarTexto2')}
                </p>
                <div className="campo">
                  <label>{t('equipe.transferirCarteiraPara')}</label>
                  <select value={gDestino} onChange={(e) => setGDestino(e.target.value)}>
                    <option value="">{t('equipe.naoTransferirOpt')}</option>
                    {equipe.filter((v) => v.role === 'VENDEDORA' && v.ativo && v.id !== gerenciar.id).map((v) => (
                      <option key={v.id} value={v.id}>{v.nome}</option>
                    ))}
                  </select>
                </div>
                <div className="acoes">
                  <button type="button" className="btn secundario" onClick={() => setGerenciar(null)}>{t('comum.cancelar')}</button>
                  <button type="button" className="btn" onClick={desligar}>{t('equipe.desligarBtn')}</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {form && (
        <div className="modal-fundo" onClick={() => setForm(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={salvar}>
            <h2>{form.id ? t('equipe.editarMembro') : t('equipe.novoMembro')}{!form.id && lojaAtualNome ? ` — ${lojaAtualNome}` : ''}</h2>
            {erro && <div className="alerta">{erro}</div>}
            <div className="linha-campos">
              <div className="campo">
                <label>{t('equipe.nomeLabel')}</label>
                <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
              </div>
              <div className="campo">
                <label>{t('equipe.emailLabel')}</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
              </div>
            </div>
            {ehGestor && (
              <div className="campo">
                <label>{t('equipe.funcaoLabel')}</label>
                <select value={form.role ?? 'VENDEDORA'} onChange={(e) => setForm({ ...form, role: e.target.value as 'GERENTE' | 'VENDEDORA' })}>
                  <option value="VENDEDORA">{t('equipe.vendedoraOpt')}</option>
                  <option value="GERENTE">{t('equipe.gerenteDeLojaOpt')}</option>
                </select>
                <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>
                  {form.id ? t('equipe.mudouFuncaoAviso') : t('equipe.podeHaverMaisGerentes')}
                </div>
              </div>
            )}
            <div className="linha-campos">
              <div className="campo">
                <label>{form.id ? t('equipe.novaSenhaOpcional') : t('equipe.senhaMin6')}</label>
                <CampoSenha value={form.senha ?? ''} onChange={(e) => setForm({ ...form, senha: e.target.value })} required={!form.id} minLength={6} />
              </div>
              <div className="campo">
                <label>{form.id ? t('equipe.telefoneWhatsapp') : t('equipe.telefoneWhatsappObrig')}</label>
                <input value={form.telefone ?? ''} onChange={(e) => setForm({ ...form, telefone: e.target.value })} required={!form.id} />
              </div>
            </div>
            <div className="linha-campos">
              <div className="campo">
                <label>{t('equipe.slugCatalogoLabel')}</label>
                <input value={form.slugCatalogo ?? ''} onChange={(e) => setForm({ ...form, slugCatalogo: e.target.value })} placeholder="camila" />
              </div>
              <div className="campo">
                <label>{t('equipe.comissaoPadraoLabel')}</label>
                <input type="number" step="0.1" min="0" max="100" value={form.comissaoPadrao ?? ''} onChange={(e) => setForm({ ...form, comissaoPadrao: e.target.value })} />
              </div>
            </div>
            <div className="acoes">
              <button type="button" className="btn secundario" onClick={() => setForm(null)}>{t('comum.cancelar')}</button>
              <button className="btn">{t('comum.salvar')}</button>
            </div>
          </form>
        </div>
      )}

      {formLoja && (
        <div className="modal-fundo" onClick={() => setFormLoja(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={salvarLoja} style={{ width: 'min(560px, 94vw)' }}>
            <h2>{t('equipe.novaLojaTitulo')}</h2>
            <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 0 }}>
              {t('equipe.novaLojaTexto1')} <strong>{t('equipe.gerenteDeLojaDestaque')}</strong>{t('equipe.novaLojaTexto2')}
            </p>
            {erro && <div className="alerta">{erro}</div>}
            <div className="linha-campos">
              <div className="campo">
                <label>{t('equipe.nomeLojaLabel')}</label>
                <input value={formLoja.nome} onChange={(e) => setFormLoja({ ...formLoja, nome: e.target.value })} required />
              </div>
              <div className="campo">
                <label>{t('equipe.slugEnderecoLabel')}</label>
                <input value={formLoja.slug} onChange={(e) => setFormLoja({ ...formLoja, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} placeholder="loja-shopping" required />
              </div>
            </div>
            <div className="linha-campos">
              <div className="campo">
                <label>{t('equipe.cnpjLabel')}</label>
                <input value={formLoja.cnpj ?? ''} onChange={(e) => setFormLoja({ ...formLoja, cnpj: e.target.value })} />
              </div>
              <div className="campo">
                <label>{t('equipe.telefoneLabel')}</label>
                <input value={formLoja.telefone ?? ''} onChange={(e) => setFormLoja({ ...formLoja, telefone: e.target.value })} placeholder="5562999990011" />
              </div>
            </div>
            <h3 style={{ marginBottom: 6 }}>{t('equipe.gerenteDeLojaTitulo')}</h3>
            <div className="campo">
              <label>{t('equipe.nomeLabel')}</label>
              <input value={formLoja.gerente.nome} onChange={(e) => setFormLoja({ ...formLoja, gerente: { ...formLoja.gerente, nome: e.target.value } })} required />
            </div>
            <div className="linha-campos">
              <div className="campo">
                <label>{t('equipe.emailNovoLogin')}</label>
                <input type="email" value={formLoja.gerente.email} onChange={(e) => setFormLoja({ ...formLoja, gerente: { ...formLoja.gerente, email: e.target.value } })} required />
              </div>
              <div className="campo">
                <label>{t('equipe.senhaMin6')}</label>
                <CampoSenha value={formLoja.gerente.senha} onChange={(e) => setFormLoja({ ...formLoja, gerente: { ...formLoja.gerente, senha: e.target.value } })} minLength={6} required />
              </div>
            </div>
            <div className="campo">
              <label>{t('equipe.whatsappGerenteLabel')}</label>
              <input value={formLoja.gerente.telefone} onChange={(e) => setFormLoja({ ...formLoja, gerente: { ...formLoja.gerente, telefone: e.target.value } })} placeholder="5562999990011" inputMode="tel" required />
              <small style={{ color: 'var(--ink-soft)' }}>{t('equipe.whatsappGerenteAviso')}</small>
            </div>
            <div className="acoes">
              <button type="button" className="btn secundario" onClick={() => setFormLoja(null)}>{t('comum.cancelar')}</button>
              <button className="btn">{t('equipe.criarLoja')}</button>
            </div>
          </form>
        </div>
      )}

      {editLoja && (
        <div className="modal-fundo" onClick={() => setEditLoja(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={salvarEdicaoLoja} style={{ width: 'min(520px, 94vw)' }}>
            <h2>{t('equipe.editarLojaTitulo', { nome: editLoja.nome })}</h2>
            {erro && <div className="alerta">{erro}</div>}
            <div className="campo">
              <label>{t('equipe.nomeLabel')}</label>
              <input value={editLoja.nome} onChange={(e) => setEditLoja({ ...editLoja, nome: e.target.value })} required />
            </div>
            <div className="linha-campos">
              <div className="campo">
                <label>{t('equipe.cnpjLabel')}</label>
                <input value={editLoja.cnpj ?? ''} onChange={(e) => setEditLoja({ ...editLoja, cnpj: e.target.value })} />
              </div>
              <div className="campo">
                <label>{t('equipe.telefoneLabel')}</label>
                <input value={editLoja.telefone ?? ''} onChange={(e) => setEditLoja({ ...editLoja, telefone: e.target.value })} />
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, marginBottom: 8 }}>
              <input type="checkbox" checked={editLoja.ativo} onChange={(e) => setEditLoja({ ...editLoja, ativo: e.target.checked })} style={{ width: 'auto' }} />
              {t('equipe.lojaAtivaLabel')}
            </label>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 8 }}>
              {t('equipe.enderecoNaoAlteravel1')} <strong>{editLoja.slug}</strong>{t('equipe.enderecoNaoAlteravel2')}
            </div>
            <div className="acoes">
              <button type="button" className="btn secundario" onClick={() => setEditLoja(null)}>{t('comum.cancelar')}</button>
              <button className="btn">{t('comum.salvar')}</button>
            </div>
          </form>
        </div>
      )}

      {formE && (
        <div className="modal-fundo" onClick={() => setFormE(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={salvarEstoquista} style={{ width: 'min(520px, 92vw)' }}>
            <h2>{formE.id ? t('equipe.editarGestorEstoque') : t('equipe.novoGestorEstoque')}</h2>
            {erro && <div className="alerta">{erro}</div>}
            <div className="campo">
              <label>{t('equipe.nomeLabel')}</label>
              <input value={formE.nome} onChange={(e) => setFormE({ ...formE, nome: e.target.value })} required />
            </div>
            <div className="linha-campos">
              <div className="campo">
                <label>{t('equipe.emailLabel')}</label>
                <input type="email" value={formE.email} onChange={(e) => setFormE({ ...formE, email: e.target.value })} required />
              </div>
              <div className="campo">
                <label>{formE.id ? t('equipe.colTelefone') : t('equipe.telefoneObrig')}</label>
                <input value={formE.telefone ?? ''} onChange={(e) => setFormE({ ...formE, telefone: e.target.value })} placeholder="5562999990011" required={!formE.id} />
              </div>
            </div>
            <div className="campo">
              <label>{formE.id ? t('equipe.novaSenhaDeixeVazio') : t('equipe.senhaObrig')}</label>
              <CampoSenha value={formE.senha ?? ''} onChange={(e) => setFormE({ ...formE, senha: e.target.value })} required={!formE.id} minLength={6} placeholder={t('equipe.senhaMinPlaceholder')} />
            </div>
            <div className="acoes">
              <button type="button" className="btn secundario" onClick={() => setFormE(null)}>{t('comum.cancelar')}</button>
              <button className="btn">{t('comum.salvar')}</button>
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
  const { t } = useIdioma()
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
      avisar(t('equipe.metasSalvasSucesso'))
      carregar()
      onSalvo()
    } catch (e) { avisar(mensagemDeErro(e), 'erro') } finally { setOcupado(false) }
  }

  if (!cfg) return null
  return (
    <div className="cartao">
      <h2 style={{ marginTop: 0 }}>{t('equipe.metasMensaisTitulo')}</h2>
      <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 12 }}>
        {t('equipe.metasExplicacao')}
      </div>
      <div className="linha-campos">
        <div className="campo">
          <label>{t('equipe.metaMarcaLabel')}</label>
          <input type="number" step="0.01" min="0" value={meta} onChange={(e) => setMeta(e.target.value)} />
        </div>
        <div className="campo">
          <label>{t('equipe.distribuicaoLabel')}</label>
          <select value={modo} onChange={(e) => setModo(e.target.value as 'IGUAL' | 'MANUAL')}>
            <option value="IGUAL">{t('equipe.igualOpt')}</option>
            <option value="MANUAL">{t('equipe.manualOpt')}</option>
          </select>
        </div>
      </div>
      <table>
        <thead>
          <tr><th>{t('equipe.colLoja')}</th><th>{t('equipe.colVendedoras')}</th><th>{t('equipe.colMetaLoja')}</th><th>{t('equipe.colMetaPorVendedora')}</th></tr>
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
          {cfg.lojas.length === 0 && <tr><td colSpan={4} style={{ color: 'var(--ink-soft)' }}>{t('equipe.cadastreLojaPrimeiro')}</td></tr>}
        </tbody>
      </table>
      <div style={{ marginTop: 10 }}>
        <button className="btn" onClick={salvar} disabled={ocupado}>{ocupado ? t('equipe.salvando') : t('equipe.salvarMetas')}</button>
        <span style={{ fontSize: 12, color: 'var(--ink-soft)', marginLeft: 10 }}>
          {t('equipe.valoresAtualizamAposSalvar')}
        </span>
      </div>
    </div>
  )
}

// ── Solicitações de "esqueci minha senha" da equipe (sem WhatsApp cadastrado) ──
interface SolicitacaoSenha { id: string; createdAt: string; usuario: { id: string; nome: string; email: string; role: string } }

function SolicitacoesSenhaSection() {
  const { t } = useIdioma()
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
      <h2 style={{ marginTop: 0, fontSize: 16 }}>{t('equipe.pedidosRedefinicao', { n: lista.length })}</h2>
      <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 0 }}>
        {t('equipe.semWhatsappExplicacao')}
      </p>
      {erro && <div className="alerta">{erro}</div>}
      {gerada && (
        <div className="sucesso" style={{ marginBottom: 10 }}>
          {t('equipe.senhaProvisoriaDe')} <strong>{gerada.nome}</strong>: <strong>{gerada.senha}</strong> {t('equipe.copieEnvie')}
        </div>
      )}
      <table>
        <thead><tr><th>{t('equipe.colNome')}</th><th>{t('equipe.colEmail')}</th><th>{t('equipe.colPapel')}</th><th>{t('equipe.colPedidoEm')}</th><th></th></tr></thead>
        <tbody>
          {lista.map((s) => (
            <tr key={s.id}>
              <td>{s.usuario.nome}</td>
              <td>{s.usuario.email}</td>
              <td>{t(`papel.${s.usuario.role}`)}</td>
              <td>{new Date(s.createdAt).toLocaleString('pt-BR')}</td>
              <td><a href="#" onClick={(e) => { e.preventDefault(); gerar(s) }}>{t('equipe.gerarSenha')}</a></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
