import { useEffect, useState } from 'react'
import { api, formataReal, mensagemDeErro, usuarioLogado } from '../../api'
import { useToast } from '../../componentes/Toast'

interface Perfil {
  codigo: string
  link: string
  chavePixTipo: string | null
  chavePix: string | null
  taxStatus: 'PF' | 'PJ' | 'MEI' | null
  aceiteTermosVersao: string | null
  termosVigentes: string
  aceitouVersaoVigente: boolean
}
interface Metricas { cliques: number; redesIndicadas: number; pendente: number; paga: number; doMes: number }
interface Comissao {
  id: string; redeNome: string; cicloEm: string; valorBaseAssinatura: number
  percentualComissao: number; valorComissao: number; status: 'PENDENTE' | 'PAGA'; pagoEm: string | null
}

const fmtData = (iso: string) => new Date(iso).toLocaleDateString('pt-BR')

/** Painel do afiliado — shell próprio, independente do Layout do CRM (afiliado não tem rede/loja). */
export default function PainelAfiliado() {
  const usuario = usuarioLogado()
  const avisar = useToast()
  const [aba, setAba] = useState<'geral' | 'comissoes' | 'pix' | 'termos'>('geral')
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [metricas, setMetricas] = useState<Metricas | null>(null)
  const [comissoes, setComissoes] = useState<Comissao[]>([])
  const [tipoPix, setTipoPix] = useState<'EMAIL' | 'CPF' | 'TELEFONE' | 'ALEATORIA'>('EMAIL')
  const [chavePix, setChavePix] = useState('')
  const [taxStatus, setTaxStatus] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [salvandoFiscal, setSalvandoFiscal] = useState(false)

  function carregar() {
    api.get('/afiliados/minha').then(({ data }) => {
      setPerfil(data)
      setTipoPix(data.chavePixTipo ?? 'EMAIL')
      setChavePix(data.chavePix ?? '')
      setTaxStatus(data.taxStatus ?? '')
    }).catch((e) => avisar(mensagemDeErro(e), 'erro'))
    api.get('/afiliados/minha/metricas').then(({ data }) => setMetricas(data)).catch(() => {})
    api.get('/afiliados/minha/comissoes').then(({ data }) => setComissoes(data.comissoes)).catch(() => {})
  }
  useEffect(() => { carregar() }, [])

  function copiarLink() {
    if (!perfil) return
    navigator.clipboard?.writeText(perfil.link).then(() => avisar('Link copiado.')).catch(() => {})
  }

  async function salvarPix(e: React.FormEvent) {
    e.preventDefault(); setSalvando(true)
    try {
      await api.patch('/afiliados/minha/pix', { tipo: tipoPix, chave: chavePix })
      avisar('Chave Pix salva.')
      carregar()
    } catch (e2) { avisar(mensagemDeErro(e2), 'erro') } finally { setSalvando(false) }
  }

  async function salvarFiscal(e: React.FormEvent) {
    e.preventDefault(); setSalvandoFiscal(true)
    try {
      await api.patch('/afiliados/minha/fiscal', { taxStatus })
      avisar('Enquadramento salvo.')
      carregar()
    } catch (e2) { avisar(mensagemDeErro(e2), 'erro') } finally { setSalvandoFiscal(false) }
  }

  async function aceitarTermos() {
    try {
      await api.post('/afiliados/minha/aceite-termos')
      avisar('Termos aceitos.')
      carregar()
    } catch (e) { avisar(mensagemDeErro(e), 'erro') }
  }

  function sair() {
    localStorage.removeItem('modacrm_token')
    localStorage.removeItem('modacrm_usuario')
    window.location.href = '/login'
  }

  if (!perfil || !metricas) return <div style={{ padding: 24, color: 'var(--ink-soft)' }}>Carregando…</div>

  const precisaAceitar = !perfil.aceitouVersaoVigente

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0 }}>🤝 Painel do Afiliado</h1>
          <span style={{ color: 'var(--ink-soft)', fontSize: 13 }}>{usuario?.nome}</span>
        </div>
        <button className="btn secundario" onClick={sair}>Sair</button>
      </header>

      {precisaAceitar ? (
        <div className="cartao">
          <h2 style={{ marginTop: 0 }}>Aceite os termos do programa de afiliados</h2>
          <p style={{ color: 'var(--ink-soft)' }}>
            Antes de acessar seu link e suas comissões, você precisa aceitar os termos do programa de afiliados ({perfil.termosVigentes}).
          </p>
          <button className="btn" onClick={aceitarTermos}>Aceitar termos</button>
        </div>
      ) : (
        <>
          <nav style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {([
              ['geral', 'Visão geral'],
              ['comissoes', 'Comissões'],
              ['pix', 'Minha chave Pix'],
            ] as const).map(([id, label]) => (
              <button key={id} type="button" className={aba === id ? 'btn' : 'btn secundario'} onClick={() => setAba(id)}>{label}</button>
            ))}
          </nav>

          {aba === 'geral' && (
            <>
              <div className="cartao">
                <h2 style={{ marginTop: 0 }}>Seu link de indicação</h2>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input readOnly value={perfil.link} style={{ flex: 1, minWidth: 220 }} />
                  <button type="button" className="btn secundario" onClick={copiarLink}>Copiar</button>
                </div>
                <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 8 }}>
                  Compartilhe esse link — quem assinar um plano por ele fica vinculado a você, e você ganha comissão
                  vitalícia sobre o valor recorrente enquanto a assinatura continuar ativa.
                </p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                <div className="cartao"><div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Cliques no link</div><div style={{ fontSize: 24, fontWeight: 700 }}>{metricas.cliques}</div></div>
                <div className="cartao"><div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Redes indicadas</div><div style={{ fontSize: 24, fontWeight: 700 }}>{metricas.redesIndicadas}</div></div>
                <div className="cartao"><div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Comissão do mês</div><div style={{ fontSize: 24, fontWeight: 700 }}>{formataReal(metricas.doMes)}</div></div>
                <div className="cartao"><div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Pendente</div><div style={{ fontSize: 24, fontWeight: 700, color: '#d97706' }}>{formataReal(metricas.pendente)}</div></div>
                <div className="cartao"><div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>Já pago</div><div style={{ fontSize: 24, fontWeight: 700, color: '#16a34a' }}>{formataReal(metricas.paga)}</div></div>
              </div>
            </>
          )}

          {aba === 'comissoes' && (
            <div className="cartao">
              <h2 style={{ marginTop: 0 }}>Comissões por ciclo</h2>
              <table>
                <thead><tr><th>Rede</th><th>Ciclo</th><th>Base</th><th>%</th><th>Comissão</th><th>Status</th><th>Pago em</th></tr></thead>
                <tbody>
                  {comissoes.map((c) => (
                    <tr key={c.id}>
                      <td>{c.redeNome}</td>
                      <td>{fmtData(c.cicloEm)}</td>
                      <td>{formataReal(c.valorBaseAssinatura)}</td>
                      <td>{c.percentualComissao}%</td>
                      <td><strong>{formataReal(c.valorComissao)}</strong></td>
                      <td><span className={`selo ${c.status === 'PAGA' ? 'ok' : 'ATACADO'}`}>{c.status}</span></td>
                      <td>{c.pagoEm ? fmtData(c.pagoEm) : '—'}</td>
                    </tr>
                  ))}
                  {comissoes.length === 0 && <tr><td colSpan={7} style={{ color: 'var(--ink-soft)' }}>Nenhuma comissão ainda.</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {aba === 'pix' && (
            <form className="cartao" onSubmit={salvarPix}>
              <h2 style={{ marginTop: 0 }}>Minha chave Pix</h2>
              <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 0 }}>
                Destino do repasse manual da sua comissão (transferência feita por fora, não é uma cobrança automática).
              </p>
              <div className="linha-campos">
                <div className="campo">
                  <label>Tipo</label>
                  <select value={tipoPix} onChange={(e) => setTipoPix(e.target.value as typeof tipoPix)}>
                    <option value="EMAIL">E-mail</option>
                    <option value="CPF">CPF</option>
                    <option value="TELEFONE">Telefone</option>
                    <option value="ALEATORIA">Chave aleatória</option>
                  </select>
                </div>
                <div className="campo">
                  <label>Chave Pix</label>
                  <input value={chavePix} onChange={(e) => setChavePix(e.target.value)} required minLength={4} />
                </div>
              </div>
              <div className="acoes">
                <button className="btn" disabled={salvando}>Salvar</button>
              </div>
            </form>
          )}

          {aba === 'pix' && (
            <form className="cartao" onSubmit={salvarFiscal}>
              <h2 style={{ marginTop: 0 }}>Enquadramento fiscal</h2>
              <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 0 }}>
                Informe se você recebe como pessoa física, PJ ou MEI — isso ajuda a definir a retenção
                de imposto (se aplicável) na hora do repasse. Consulte seu contador em caso de dúvida.
              </p>
              <div className="campo" style={{ maxWidth: 220 }}>
                <label>Enquadramento</label>
                <select value={taxStatus} onChange={(e) => setTaxStatus(e.target.value)} required>
                  <option value="" disabled>Selecione</option>
                  <option value="PF">Pessoa física</option>
                  <option value="PJ">PJ</option>
                  <option value="MEI">MEI</option>
                </select>
              </div>
              <div className="acoes">
                <button className="btn" disabled={salvandoFiscal}>Salvar</button>
              </div>
            </form>
          )}
        </>
      )}
    </div>
  )
}
