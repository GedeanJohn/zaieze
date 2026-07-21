import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useLojaAtiva } from '../componentes/SeletorLoja'
import { useIdioma } from '../lib/i18n'

interface Inteligencia {
  campeoes: { produto: string; referencia: string | null; qtd: number }[]
  ruptura: { produto: string; referencia: string | null; cor: string; tamanho: string; estoque: number; vendidos30: number; diasEstimados: number }[]
}

export default function EstoqueInteligente() {
  const escopo = useLojaAtiva()
  const { t } = useIdioma()
  const [intel, setIntel] = useState<Inteligencia | null>(null)
  const [semAcesso, setSemAcesso] = useState(false)

  const carregar = useCallback(async () => {
    if (!escopo.pronto) return
    try {
      const { data } = await api.get('/estoque/inteligencia', { params: escopo.params })
      setIntel(data)
    } catch (e) {
      if ((e as { response?: { status?: number } }).response?.status === 403) setSemAcesso(true)
    }
  }, [escopo.pronto, escopo.params])

  useEffect(() => { carregar() }, [carregar])

  if (semAcesso) {
    return (
      <div className="cartao">
        <h2 style={{ marginTop: 0 }}>{t('estoqueInteligente.titulo')}</h2>
        <p>{t('estoqueInteligente.semAcessoTexto')}</p>
        <Link className="btn" to="/planos">{t('estoqueInteligente.assinarAddon')}</Link>
      </div>
    )
  }

  return (
    <>
      <header>
        <h1>{t('estoqueInteligente.titulo')}</h1>
        <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>{t('estoqueInteligente.subtitulo')}</div>
      </header>

      {intel && (intel.campeoes.length > 0 || intel.ruptura.length > 0) ? (
        <div className="grade-paineis" style={{ marginTop: 16 }}>
          <div className="cartao">
            <h2 className="painel-titulo">{t('estq.campeoesTitulo')}</h2>
            <table>
              <thead><tr><th>{t('estq.colProduto')}</th><th>{t('estq.colRef')}</th><th>{t('estq.colVendidos')}</th></tr></thead>
              <tbody>
                {intel.campeoes.map((c, i) => (
                  <tr key={i}><td>{c.produto}</td><td style={{ fontFamily: 'Consolas, monospace', fontSize: 12 }}>{c.referencia ?? '—'}</td><td><strong>{c.qtd}</strong></td></tr>
                ))}
                {intel.campeoes.length === 0 && <tr><td colSpan={3} style={{ color: 'var(--ink-soft)' }}>{t('estq.semVendasPeriodo')}</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="cartao">
            <h2 className="painel-titulo">{t('estq.rupturaTitulo')}</h2>
            <table>
              <thead><tr><th>{t('estq.colProduto')}</th><th>{t('estq.colGrade')}</th><th>{t('estq.colEstoque')}</th><th>{t('estq.colAcabaEm')}</th></tr></thead>
              <tbody>
                {intel.ruptura.map((r, i) => (
                  <tr key={i}><td>{r.produto}</td><td style={{ color: 'var(--ink-soft)' }}>{r.cor}/{r.tamanho}</td><td>{r.estoque}</td><td><span className="selo baixo">{t('estq.diaSufixo', { n: r.diasEstimados })}</span></td></tr>
                ))}
                {intel.ruptura.length === 0 && <tr><td colSpan={4} style={{ color: 'var(--ok)' }}>{t('estq.nenhumRisco')}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="cartao" style={{ color: 'var(--ink-soft)' }}>{t('estoqueInteligente.semDados')}</div>
      )}
    </>
  )
}
