import { useEffect, useRef, useState } from 'react'
import JsBarcode from 'jsbarcode'
import html2canvas from 'html2canvas'
import { api, mensagemDeErro, usuarioLogado } from '../api'
import { useIdioma } from '../lib/i18n'

export interface VariacaoEtq { id: string; cor: string; estampa: string; tamanho: string; codigoBarras: string | null; estoque: number }
export interface ProdutoEtq { id: string; nome: string; referencia?: string | null; precoVarejo: string; precoAtacado?: string | null; variacoes: VariacaoEtq[] }

interface Props {
  produto: ProdutoEtq
  params: Record<string, string>
  onClose: () => void
  onAtualizado: () => void
}

type TipoImpressao = 'TERMICA' | 'A4'
interface Preset { id: string; label: string; w: number; h: number; cols?: number }

function presets(t: (chave: string) => string): Record<TipoImpressao, Preset[]> {
  return {
    TERMICA: [
      { id: 'termica-50x30', label: t('etq.presetTermica5030'), w: 50, h: 30 },
      { id: 'termica-40x25', label: t('etq.presetTermica4025'), w: 40, h: 25 },
      { id: 'termica-60x40', label: t('etq.presetTermica6040'), w: 60, h: 40 },
    ],
    A4: [
      { id: 'a4-18-63x46', label: t('etq.presetA418'), w: 63.5, h: 46.6, cols: 3 },
    ],
  }
}

function Barcode({ valor, larguraMm }: { valor: string; larguraMm: number }) {
  const ref = useRef<SVGSVGElement>(null)
  useEffect(() => {
    if (!ref.current || !valor) return
    try {
      JsBarcode(ref.current, valor, {
        format: 'CODE128', displayValue: true, width: Math.max(1, larguraMm / 34),
        height: Math.max(20, larguraMm * 0.5), fontSize: 11, margin: 0,
      })
    } catch (e) { console.error('Falha ao desenhar código de barras', e) /* etiqueta segue sem travar */ }
  }, [valor, larguraMm])
  return <svg ref={ref} />
}

export default function EtiquetasModal({ produto, params, onClose, onAtualizado }: Props) {
  const { t } = useIdioma()
  const usuario = usuarioLogado()
  const [variacoes, setVariacoes] = useState<VariacaoEtq[]>(produto.variacoes)
  const [selecionadas, setSelecionadas] = useState<Record<string, number>>(
    () => Object.fromEntries(produto.variacoes.map((v) => [v.id, 1])),
  )
  const [tipo, setTipo] = useState<TipoImpressao>('TERMICA')
  const [presetId, setPresetId] = useState('termica-50x30')
  const [customW, setCustomW] = useState('50')
  const [customH, setCustomH] = useState('30')
  const [customCols, setCustomCols] = useState('3')
  const [gerando, setGerando] = useState(false)
  const [erro, setErro] = useState('')
  const [imprimindo, setImprimindo] = useState(false)

  // Peças cadastradas antes desta feature podem não ter código de barras ainda — gera na hora.
  useEffect(() => {
    const semCodigo = produto.variacoes.filter((v) => !v.codigoBarras)
    if (semCodigo.length === 0) return
    setGerando(true)
    Promise.all(semCodigo.map((v) => api.post(`/produtos/variacoes/${v.id}/gerar-codigo-barras`, {}, { params })))
      .then((respostas) => {
        setVariacoes((atual) => atual.map((v) => {
          const gerada = respostas.find((r) => r.data.id === v.id)
          return gerada ? { ...v, codigoBarras: gerada.data.codigoBarras } : v
        }))
        onAtualizado()
      })
      .catch((e) => setErro(mensagemDeErro(e)))
      .finally(() => setGerando(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const listaPresets = presets(t)[tipo]
  const presetAtual = listaPresets.find((p) => p.id === presetId)
  const usandoCustom = presetId === 'custom'
  const larguraMm = usandoCustom ? Number(customW) || 50 : presetAtual?.w ?? 50
  const alturaMm = usandoCustom ? Number(customH) || 30 : presetAtual?.h ?? 30
  const colunas = tipo === 'A4' ? (usandoCustom ? Number(customCols) || 3 : presetAtual?.cols ?? 3) : 1

  const itensParaImprimir = variacoes.flatMap((v) => Array.from({ length: selecionadas[v.id] ?? 0 }, () => v))

  if (imprimindo) {
    return (
      <EtiquetasImpressao
        produto={produto} itens={itensParaImprimir} tipo={tipo} larguraMm={larguraMm} alturaMm={alturaMm} colunas={colunas}
        nomeMarca={usuario?.rede?.nome ?? ''} onFechar={() => setImprimindo(false)}
      />
    )
  }

  return (
    <div className="modal-fundo" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(640px, 94vw)' }}>
        <h2>{t('etq.titulo', { nome: produto.nome })}</h2>
        {erro && <div className="alerta">{erro}</div>}
        {gerando && <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 8 }}>{t('etq.gerandoCodigos')}</div>}

        <div className="cartao" style={{ padding: 8, maxHeight: 280, overflowY: 'auto' }}>
          <table>
            <thead><tr><th>{t('prod.corLabel')}</th><th>{t('prod.tamanhoLabel')}</th><th>{t('etq.codigo')}</th><th>{t('etq.quantidade')}</th></tr></thead>
            <tbody>
              {variacoes.map((v) => (
                <tr key={v.id}>
                  <td>{v.cor}{v.estampa ? ` ${v.estampa}` : ''}</td>
                  <td>{v.tamanho}</td>
                  <td style={{ fontFamily: 'Consolas, monospace', fontSize: 12 }}>{v.codigoBarras ?? '—'}</td>
                  <td>
                    <input
                      type="number" min={0} max={200} style={{ width: 70 }}
                      value={selecionadas[v.id] ?? 0}
                      onChange={(e) => setSelecionadas({ ...selecionadas, [v.id]: Math.max(0, Number(e.target.value)) })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="linha-campos" style={{ marginTop: 12 }}>
          <div className="campo">
            <label>{t('etq.tipoImpressao')}</label>
            <select value={tipo} onChange={(e) => { const novo = e.target.value as TipoImpressao; setTipo(novo); setPresetId(presets(t)[novo][0].id) }}>
              <option value="TERMICA">{t('etq.termica')}</option>
              <option value="A4">{t('etq.a4')}</option>
            </select>
          </div>
          <div className="campo">
            <label>{t('etq.tamanho')}</label>
            <select value={presetId} onChange={(e) => setPresetId(e.target.value)}>
              {listaPresets.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              <option value="custom">{t('etq.personalizado')}</option>
            </select>
          </div>
        </div>
        {usandoCustom && (
          <div className="linha-campos">
            <div className="campo"><label>{t('etq.larguraMm')}</label><input type="number" min={20} value={customW} onChange={(e) => setCustomW(e.target.value)} /></div>
            <div className="campo"><label>{t('etq.alturaMm')}</label><input type="number" min={15} value={customH} onChange={(e) => setCustomH(e.target.value)} /></div>
            {tipo === 'A4' && (
              <div className="campo"><label>{t('etq.colunas')}</label><input type="number" min={1} max={6} value={customCols} onChange={(e) => setCustomCols(e.target.value)} /></div>
            )}
          </div>
        )}

        <div className="acoes">
          <button type="button" className="btn secundario" onClick={onClose}>{t('comum.cancelar')}</button>
          <button type="button" className="btn" disabled={itensParaImprimir.length === 0} onClick={() => setImprimindo(true)}>
            {t('etq.gerarEtiquetas', { n: itensParaImprimir.length })}
          </button>
        </div>
      </div>
    </div>
  )
}

function EtiquetasImpressao({ produto, itens, tipo, larguraMm, alturaMm, colunas, nomeMarca, onFechar }: {
  produto: ProdutoEtq; itens: VariacaoEtq[]; tipo: TipoImpressao; larguraMm: number; alturaMm: number; colunas: number
  nomeMarca: string; onFechar: () => void
}) {
  const { t } = useIdioma()
  const precoVarejo = Number(produto.precoVarejo)
  const precoAtacado = produto.precoAtacado != null ? Number(produto.precoAtacado) : null
  const folhaRef = useRef<HTMLDivElement>(null)
  const [baixando, setBaixando] = useState(false)

  async function baixarImagem() {
    if (!folhaRef.current) return
    setBaixando(true)
    try {
      const canvas = await html2canvas(folhaRef.current, { scale: 3, backgroundColor: '#ffffff' })
      const link = document.createElement('a')
      link.download = `etiquetas-${produto.referencia ?? produto.nome}.png`.replace(/\s+/g, '-')
      link.href = canvas.toDataURL('image/png')
      link.click()
    } finally {
      setBaixando(false)
    }
  }

  return (
    <div className="etq-print-root">
      <EtiquetasEstilos tipo={tipo} larguraMm={larguraMm} alturaMm={alturaMm} colunas={colunas} />
      <div className="etq-acoes etq-noprint">
        <span className="etq-dica">{t('etq.dicaPdf')}</span>
        <button className="btn secundario" onClick={onFechar}>{t('comum.voltar')}</button>
        <button className="btn secundario" disabled={baixando} onClick={baixarImagem}>{baixando ? t('etq.baixando') : t('etq.baixarPng')}</button>
        <button className="btn" onClick={() => window.print()}>{t('etq.imprimir')}</button>
      </div>
      <div ref={folhaRef} className={`etq-folha etq-imprimivel ${tipo === 'A4' ? 'etq-grade' : 'etq-pilha'}`}>
        {itens.map((v, i) => (
          <div className="etq-etiqueta" key={i}>
            <div className="etq-marca">{nomeMarca}</div>
            <div className="etq-modelo">{[produto.referencia, produto.nome].filter(Boolean).join(' · ')}</div>
            <div className="etq-cortam">{v.cor}{v.estampa ? `/${v.estampa}` : ''} — {v.tamanho}</div>
            <div className="etq-precos">
              <span>{t('etq.varejoAbrev')} R$ {precoVarejo.toFixed(2)}</span>
              {precoAtacado != null && <span>{t('etq.atacadoAbrev')} R$ {precoAtacado.toFixed(2)}</span>}
            </div>
            <div className="etq-barra"><Barcode valor={v.codigoBarras ?? ''} larguraMm={larguraMm} /></div>
          </div>
        ))}
        {itens.length === 0 && <div style={{ padding: 20, color: '#999' }}>{t('etq.nenhumaEtiqueta')}</div>}
      </div>
    </div>
  )
}

function EtiquetasEstilos({ tipo, larguraMm, alturaMm, colunas }: { tipo: TipoImpressao; larguraMm: number; alturaMm: number; colunas: number }) {
  const paginaSize = tipo === 'TERMICA' ? `${larguraMm}mm ${alturaMm}mm` : 'A4'
  return (
    <style>{`
      .etq-print-root { background: #f3f3f3; min-height: 100vh; padding: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: #111; }
      .etq-acoes { max-width: 900px; margin: 0 auto 14px; display: flex; gap: 10px; align-items: center; justify-content: flex-end; }
      .etq-dica { font-size: 12px; color: #666; margin-right: auto; }
      .etq-folha { background: #fff; margin: 0 auto; width: fit-content; }
      .etq-pilha { display: flex; flex-direction: column; gap: 4mm; }
      .etq-grade { display: grid; grid-template-columns: repeat(${colunas}, ${larguraMm}mm); gap: 1mm; padding: 8mm; }
      .etq-etiqueta {
        width: ${larguraMm}mm; height: ${alturaMm}mm; border: 1px dashed #ccc; box-sizing: border-box;
        padding: 2mm; display: flex; flex-direction: column; justify-content: space-between; gap: 1mm;
        overflow: hidden; break-inside: avoid; page-break-inside: avoid;
      }
      .etq-marca { font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: .3px; line-height: 1.1; }
      .etq-modelo { font-size: 7pt; color: #444; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 1.1; }
      .etq-cortam { font-size: 8pt; font-weight: 600; line-height: 1.1; }
      .etq-precos { display: flex; gap: 6px; font-size: 8pt; font-weight: 700; line-height: 1.1; }
      .etq-barra { display: flex; justify-content: center; }
      .etq-barra svg { max-width: 100%; height: auto; }
      @media print {
        body * { visibility: hidden; }
        .etq-imprimivel, .etq-imprimivel * { visibility: visible; }
        .etq-imprimivel { position: absolute; top: 0; left: 0; }
        .etq-etiqueta { border: none; }
        .etq-pilha .etq-etiqueta:not(:last-child) { break-after: page; page-break-after: always; }
        @page { size: ${paginaSize}; margin: 0; }
      }
    `}</style>
  )
}
