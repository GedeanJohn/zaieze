import { useEffect, useState } from 'react'
import { api, formataReal, mensagemDeErro } from '../api'
import { useToast } from '../componentes/Toast'
import { entrarComoUsuario } from '../lib/impersonar'

interface RedeAdmin {
  id: string; nome: string; slug: string; ativo: boolean; criadoEm: string; lojas: number; usuarios: number
  gestor: { id: string; nome: string; email: string; telefone: string | null } | null
  assentos: { ativos: number; ocupados: number; mrr: number }
}

const fmtData = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—')

/** Contato direto dos gestores de marca (clientes pagantes do SaaS) — dados completos pra
 * verificar e falar com quem é responsável por cada loja/rede, inclusive as pendentes/inativas. */
export default function GestoresMarca() {
  const [redes, setRedes] = useState<RedeAdmin[]>([])
  const [ocupado, setOcupado] = useState(false)
  const [senhaGestorGerada, setSenhaGestorGerada] = useState<{ rede: string; nome: string; senha: string } | null>(null)
  const avisar = useToast()

  function carregar() {
    api.get('/admin/redes').then(({ data }) => setRedes(data.redes)).catch(() => {})
  }
  useEffect(() => { carregar() }, [])

  async function ativarCortesia(r: RedeAdmin) {
    if (!window.confirm(`Ativar ${r.nome} em modo CORTESIA (grátis)? Destrava o acesso e cancela qualquer cobrança pendente no Mercado Pago.`)) return
    const codigoPromo = window.prompt('Foi combinado algum código promocional com o lojista? Deixe vazio se não.')?.trim() || undefined
    setOcupado(true)
    try {
      await api.post(`/admin/redes/${r.id}/ativar-cortesia`, { codigoPromo })
      avisar(`${r.nome} ativada (cortesia).` + (codigoPromo ? ` Uso do cupom ${codigoPromo.toUpperCase()} contabilizado.` : ' O lojista já pode acessar.'))
      carregar()
    } catch (e) { avisar(mensagemDeErro(e), 'erro') } finally { setOcupado(false) }
  }

  async function excluirRede(r: RedeAdmin) {
    const digitado = window.prompt(
      `Isso apaga a marca "${r.nome}" PERMANENTEMENTE — lojas, usuários, clientes, produtos, vendas, mensagens, mídias e qualquer cobrança futura no Mercado Pago. Não tem volta.\n\nPara confirmar, digite exatamente o nome da marca:`,
    )
    if (digitado === null) return
    if (digitado.trim() !== r.nome) { avisar('Nome não confere. Nada foi excluído.', 'erro'); return }
    setOcupado(true)
    try {
      await api.delete(`/admin/redes/${r.id}`, { data: { confirmarNome: digitado.trim() } })
      avisar(`${r.nome} excluída permanentemente.`)
      carregar()
    } catch (e) { avisar(mensagemDeErro(e), 'erro') } finally { setOcupado(false) }
  }

  async function entrarComoGestor(r: RedeAdmin) {
    if (!r.gestor) return
    if (!window.confirm(`Entrar como ${r.gestor.nome} (${r.nome})? Fica registrado. Um banner aparece pra você voltar quando quiser.`)) return
    try { await entrarComoUsuario(r.gestor.id) } catch (e) { avisar(mensagemDeErro(e), 'erro') }
  }

  async function resetarSenhaGestor(r: RedeAdmin) {
    if (!r.gestor) return
    if (!window.confirm(`Gerar uma senha provisória nova para ${r.gestor.nome} (${r.nome})? A senha atual dele deixa de funcionar.`)) return
    setOcupado(true)
    try {
      const { data } = await api.post(`/admin/redes/${r.id}/gestor/resetar-senha`)
      setSenhaGestorGerada({ rede: r.nome, nome: data.nome, senha: data.senha })
    } catch (e) { avisar(mensagemDeErro(e), 'erro') } finally { setOcupado(false) }
  }

  return (
    <>
      <header><h1>🏢 Gestores de Marca</h1></header>

      <div className="cartao">
        <h2 style={{ marginTop: 0 }}>Redes (clientes) · {redes.length}</h2>
        {senhaGestorGerada && (
          <div className="sucesso" style={{ marginBottom: 10 }}>
            Senha provisória de <strong>{senhaGestorGerada.nome}</strong> ({senhaGestorGerada.rede}): <strong>{senhaGestorGerada.senha}</strong> — copie e envie manualmente.
            <button type="button" className="btn-link" style={{ marginLeft: 10 }} onClick={() => setSenhaGestorGerada(null)}>fechar</button>
          </div>
        )}
        <div className="tabela-scroll">
          <table>
            <thead><tr><th>Marca</th><th>Endereço</th><th>Gestor</th><th>E-mail</th><th>Telefone</th><th>Vendedoras</th><th>MRR</th><th>Lojas</th><th>Usuários</th><th>Desde</th><th>Ações</th></tr></thead>
            <tbody>
              {redes.map((r) => (
                <tr key={r.id} style={{ opacity: r.ativo ? 1 : 0.5 }}>
                  <td>{r.nome}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{r.slug}.zaieze.com</td>
                  <td>{r.gestor?.nome ?? '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {r.gestor?.email ? <a href={`mailto:${r.gestor.email}`}>{r.gestor.email}</a> : '—'}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {r.gestor?.telefone
                      ? <a href={`https://wa.me/${r.gestor.telefone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">{r.gestor.telefone}</a>
                      : '—'}
                  </td>
                  <td>{r.assentos.ocupados}/{r.assentos.ativos}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{formataReal(r.assentos.mrr)}</td>
                  <td>{r.lojas}</td>
                  <td>{r.usuarios}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtData(r.criadoEm)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {!r.ativo && (
                      <a href="#" onClick={(e) => { e.preventDefault(); ativarCortesia(r) }} style={{ color: '#16a34a', fontWeight: 600 }}>Ativar (cortesia)</a>
                    )}
                    {!r.ativo && ' · '}
                    {r.gestor && (
                      <a href="#" onClick={(e) => { e.preventDefault(); entrarComoGestor(r) }} style={{ fontWeight: 600 }}>Entrar como</a>
                    )}
                    {r.gestor && ' · '}
                    {r.gestor && (
                      <a href="#" onClick={(e) => { e.preventDefault(); resetarSenhaGestor(r) }} style={{ fontWeight: 600 }}>Resetar senha</a>
                    )}
                    {r.gestor && ' · '}
                    <a href="#" onClick={(e) => { e.preventDefault(); excluirRede(r) }} style={{ color: 'var(--danger)', fontWeight: 600 }}>Excluir loja</a>
                  </td>
                </tr>
              ))}
              {redes.length === 0 && <tr><td colSpan={11} style={{ color: 'var(--ink-soft)' }}>Nenhuma rede ainda.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
