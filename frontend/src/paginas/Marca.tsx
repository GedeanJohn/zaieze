import { useEffect, useRef, useState } from 'react'
import { api, mensagemDeErro } from '../api'
import PreviewLoja from '../componentes/PreviewLoja'
import { useToast } from '../componentes/Toast'
import { useIdioma } from '../lib/i18n'

interface Marca {
  nome: string
  logoUrl: string | null
  bannerUrl: string | null
  descricaoPublica: string | null
  corPrimaria: string
  corSecundaria: string
  slaEntrouMin: number
  slaAtendidoMin: number
  slaNegociandoMin: number
  slaApertadoPct: number
  slaAutoRedistribuir: boolean
  pedidoMinimoAtacado: number
  textoDisparoPadrao: string | null
  disparoVendedoraEditavel: boolean
}

interface Sugestao { cor: string; origem: 'logo' | 'banner' }

/** Extrai as cores dominantes de uma imagem (arquivo local ou URL) usando canvas — roda no navegador, sem custo de IA.
 *  Para URL de outra origem (ex.: CDN), depende do servidor liberar CORS; se não liberar, falha em silêncio (recurso opcional). */
async function extrairCoresDominantes(origem: File | string, max = 5): Promise<string[]> {
  const url = typeof origem === 'string' ? origem : URL.createObjectURL(origem)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      if (typeof origem === 'string') el.crossOrigin = 'anonymous'
      el.onload = () => resolve(el)
      el.onerror = reject
      el.src = url
    })
    const tam = 60
    const canvas = document.createElement('canvas')
    canvas.width = tam; canvas.height = tam
    const ctx = canvas.getContext('2d')
    if (!ctx) return []
    ctx.drawImage(img, 0, 0, tam, tam)
    const { data } = ctx.getImageData(0, 0, tam, tam)
    const passo = 24
    const contagem = new Map<string, number>()
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]]
      if (a < 200) continue
      const maxC = Math.max(r, g, b), minC = Math.min(r, g, b)
      if (maxC > 245 && minC > 235) continue // quase branco (fundo comum em logo)
      if (maxC < 20) continue // quase preto
      const chave = [r, g, b].map((v) => Math.round(v / passo) * passo).join(',')
      contagem.set(chave, (contagem.get(chave) ?? 0) + 1)
    }
    return [...contagem.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, max)
      .map(([chave]) => '#' + chave.split(',').map((v) => Math.min(255, Number(v)).toString(16).padStart(2, '0')).join(''))
  } catch {
    return []
  } finally {
    if (typeof origem !== 'string') URL.revokeObjectURL(url)
  }
}

export default function Marca() {
  const { t } = useIdioma()
  const [marca, setMarca] = useState<Marca | null>(null)
  const avisar = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const bannerRef = useRef<HTMLInputElement>(null)
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([])
  const [alvoCor, setAlvoCor] = useState<'corPrimaria' | 'corSecundaria'>('corPrimaria')
  const [preview, setPreview] = useState(false)

  function aplicarSugestoes(origem: 'logo' | 'banner', cores: string[]) {
    setSugestoes((prev) => {
      const resto = prev.filter((s) => s.origem !== origem)
      const novas = cores.map((cor) => ({ cor, origem }))
      return origem === 'logo' ? [...novas, ...resto] : [...resto, ...novas]
    })
  }

  useEffect(() => {
    api.get('/marca').then(({ data }) => {
      setMarca(data)
      if (data.logoUrl) extrairCoresDominantes(data.logoUrl).then((cores) => aplicarSugestoes('logo', cores))
      if (data.bannerUrl) extrairCoresDominantes(data.bannerUrl).then((cores) => aplicarSugestoes('banner', cores))
    })
  }, [])

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!marca) return
    try {
      const { data } = await api.patch('/marca', {
        nome: marca.nome.trim(),
        descricaoPublica: marca.descricaoPublica?.trim() || null,
        corPrimaria: marca.corPrimaria,
        corSecundaria: marca.corSecundaria,
        slaEntrouMin: marca.slaEntrouMin,
        slaAtendidoMin: marca.slaAtendidoMin,
        slaNegociandoMin: marca.slaNegociandoMin,
        slaApertadoPct: marca.slaApertadoPct,
        slaAutoRedistribuir: marca.slaAutoRedistribuir,
        pedidoMinimoAtacado: marca.pedidoMinimoAtacado,
        textoDisparoPadrao: marca.textoDisparoPadrao ?? '',
        disparoVendedoraEditavel: marca.disparoVendedoraEditavel,
      })
      setMarca(data)
      avisar(t('marca.identidadeSalva'))
    } catch (err) { avisar(mensagemDeErro(err), 'erro') }
  }

  async function enviarLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0]
    if (!arquivo || !marca) return
    extrairCoresDominantes(arquivo).then((cores) => aplicarSugestoes('logo', cores))
    const fd = new FormData()
    fd.append('file', arquivo)
    try {
      const { data } = await api.post('/marca/logo', fd, { params: marca.logoUrl ? { anterior: marca.logoUrl } : {} })
      setMarca(data)
      avisar(t('marca.logoAtualizada'))
    } catch (err) { avisar(mensagemDeErro(err), 'erro') }
    finally { if (fileRef.current) fileRef.current.value = '' }
  }

  async function enviarBanner(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0]
    if (!arquivo || !marca) return
    extrairCoresDominantes(arquivo).then((cores) => aplicarSugestoes('banner', cores))
    const fd = new FormData()
    fd.append('file', arquivo)
    try {
      const { data } = await api.post('/marca/banner', fd, { params: marca.bannerUrl ? { anterior: marca.bannerUrl } : {} })
      setMarca(data)
      avisar(t('marca.bannerAtualizado'))
    } catch (err) { avisar(mensagemDeErro(err), 'erro') }
    finally { if (bannerRef.current) bannerRef.current.value = '' }
  }

  async function removerBanner() {
    if (!marca) return
    try {
      const { data } = await api.delete('/marca/banner')
      setMarca(data)
      avisar(t('marca.bannerRemovido'))
    } catch (err) { avisar(mensagemDeErro(err), 'erro') }
  }

  if (!marca) return <p style={{ color: 'var(--ink-soft)' }}>{t('marca.carregando')}</p>

  return (
    <>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <h1>{t('marca.titulo')}</h1>
        <button type="button" className="btn secundario" onClick={() => setPreview(true)}>{t('marca.visualizarLoja')}</button>
      </header>
      <div className="cartao" style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
        {t('marca.explicacao1')} <strong>{t('marca.catalogoPublicoDestaque')}</strong> {t('marca.explicacao2')}
      </div>

      <div className="cartao">
        <h2 style={{ marginTop: 0 }}>{t('marca.logoTitulo')}</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <div style={{
            width: 140, height: 140, borderRadius: 12, background: marca.corSecundaria,
            display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #00000022', overflow: 'hidden',
          }}>
            {marca.logoUrl
              ? <img src={marca.logoUrl} alt="Logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
              : <span style={{ color: '#999', fontSize: 12 }}>{t('marca.semLogo')}</span>}
          </div>
          <div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={enviarLogo} />
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 6 }}>{t('marca.logoFormatos')}</div>
          </div>
        </div>
      </div>

      <div className="cartao">
        <h2 style={{ marginTop: 0 }}>{t('marca.bannerTitulo')}</h2>
        <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 0 }}>
          {t('marca.bannerExplicacao1')} <strong>{t('marca.catalogoPublicoDestaque')}</strong>{t('marca.bannerExplicacao2')}
        </p>
        <div style={{
          width: '100%', maxWidth: 520, aspectRatio: '3 / 1', borderRadius: 12, background: '#00000010',
          display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #00000022', overflow: 'hidden',
        }}>
          {marca.bannerUrl
            ? <img src={marca.bannerUrl} alt="Banner" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ color: '#999', fontSize: 12 }}>{t('marca.semBanner')}</span>}
        </div>
        <div style={{ marginTop: 10, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <input ref={bannerRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={enviarBanner} />
          {marca.bannerUrl && (
            <button type="button" onClick={removerBanner}
              style={{ background: 'none', border: '1px solid #00000033', color: 'var(--ink-soft)', padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
              {t('marca.removerBanner')}
            </button>
          )}
        </div>
      </div>

      <form className="cartao" onSubmit={salvar}>
        <h2 style={{ marginTop: 0 }}>{t('marca.coresAtendimentoTitulo')}</h2>

        <div className="campo">
          <label>{t('marca.nomeMarcaLabel')}</label>
          <input
            value={marca.nome}
            minLength={2}
            maxLength={80}
            required
            onChange={(e) => setMarca({ ...marca, nome: e.target.value })}
            placeholder={t('marca.nomeMarcaPlaceholder')}
          />
          <small style={{ color: 'var(--ink-soft)' }}>
            {t('marca.nomeMarcaAviso')}
          </small>
        </div>

        <div className="campo">
          <label>{t('marca.descricaoLojaLabel')}</label>
          <textarea
            rows={3} maxLength={500}
            value={marca.descricaoPublica ?? ''}
            onChange={(e) => setMarca({ ...marca, descricaoPublica: e.target.value })}
            placeholder={t('marca.descricaoLojaPlaceholder')}
          />
          <small style={{ color: 'var(--ink-soft)' }}>
            {t('marca.descricaoLojaAviso', { n: (marca.descricaoPublica ?? '').length })}
          </small>
        </div>

        <div className="linha-campos">
          <div className="campo">
            <label>{t('marca.corPrimariaLabel')}</label>
            <input type="color" value={marca.corPrimaria} onChange={(e) => setMarca({ ...marca, corPrimaria: e.target.value })} style={{ height: 42, padding: 4 }} />
          </div>
          <div className="campo">
            <label>{t('marca.corFundoLabel')}</label>
            <input type="color" value={marca.corSecundaria} onChange={(e) => setMarca({ ...marca, corSecundaria: e.target.value })} style={{ height: 42, padding: 4 }} />
          </div>
        </div>

        {sugestoes.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{t('marca.sugestoesTexto')}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" onClick={() => setAlvoCor('corPrimaria')}
                  style={{ fontSize: 11, padding: '3px 10px', borderRadius: 999, border: '1px solid #0000002a', cursor: 'pointer', background: alvoCor === 'corPrimaria' ? '#0a0a0b' : 'transparent', color: alvoCor === 'corPrimaria' ? '#fff' : '#0a0a0b' }}>
                  {t('marca.corPrimariaBtn')}
                </button>
                <button type="button" onClick={() => setAlvoCor('corSecundaria')}
                  style={{ fontSize: 11, padding: '3px 10px', borderRadius: 999, border: '1px solid #0000002a', cursor: 'pointer', background: alvoCor === 'corSecundaria' ? '#0a0a0b' : 'transparent', color: alvoCor === 'corSecundaria' ? '#fff' : '#0a0a0b' }}>
                  {t('marca.corFundoBtn')}
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {sugestoes.map((s, i) => (
                <button key={s.origem + s.cor + i} type="button" title={s.cor} onClick={() => setMarca({ ...marca, [alvoCor]: s.cor })}
                  style={{
                    width: 34, height: 34, borderRadius: 9, background: s.cor, cursor: 'pointer', padding: 0,
                    border: marca[alvoCor] === s.cor ? '2px solid #0a0a0b' : '1px solid #00000022',
                  }} />
              ))}
            </div>
          </div>
        )}

        <h3 style={{ margin: '8px 0 4px' }}>{t('marca.slaTitulo')}</h3>
        <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 0 }}>
          {t('marca.slaExplicacao1')} <strong>{t('marca.atrasadoDestaque')}</strong>{t('marca.slaExplicacao2')} <strong>{t('marca.entrouDestaque')}</strong> {t('marca.slaExplicacao3')}
        </p>
        <div className="linha-campos">
          <div className="campo">
            <label>{t('marca.entrouRespostaLabel')}</label>
            <input type="number" min={1} value={marca.slaEntrouMin} onChange={(e) => setMarca({ ...marca, slaEntrouMin: Number(e.target.value) })} />
          </div>
          <div className="campo">
            <label>{t('marca.atendidoAvancarLabel')}</label>
            <input type="number" min={1} value={marca.slaAtendidoMin} onChange={(e) => setMarca({ ...marca, slaAtendidoMin: Number(e.target.value) })} />
          </div>
          <div className="campo">
            <label>{t('marca.negociandoFecharLabel')}</label>
            <input type="number" min={1} value={marca.slaNegociandoMin} onChange={(e) => setMarca({ ...marca, slaNegociandoMin: Number(e.target.value) })} />
          </div>
        </div>
        <div className="campo">
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked={marca.slaAutoRedistribuir} onChange={(e) => setMarca({ ...marca, slaAutoRedistribuir: e.target.checked })} style={{ width: 'auto' }} />
            {t('marca.redistribuirAutoLabel')}
          </label>
        </div>
        <h3 style={{ margin: '8px 0 4px' }}>{t('marca.coresCardTitulo')}</h3>
        <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 0 }}>
          {t('marca.coresCardExplicacao1')}
          <span style={{ color: '#16a34a', fontWeight: 700 }}> {t('marca.verde')}</span> {t('marca.noPrazo')}
          <span style={{ color: '#d97706', fontWeight: 700 }}> {t('marca.laranja')}</span> {t('marca.apertado')}
          <span style={{ color: '#dc2626', fontWeight: 700 }}> {t('marca.vermelho')}</span> {t('marca.atrasadoParen')}
        </p>
        <div className="linha-campos">
          <div className="campo" style={{ maxWidth: 280 }}>
            <label>{t('marca.laranjaQuandoLabel')}</label>
            <input type="number" min={1} max={90} value={marca.slaApertadoPct} onChange={(e) => setMarca({ ...marca, slaApertadoPct: Number(e.target.value) })} />
          </div>
        </div>
        <h3 style={{ margin: '8px 0 4px' }}>{t('marca.atacadoVarejoTitulo')}</h3>
        <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 0 }}>
          {t('marca.atacadoVarejoExplicacao1')} <strong>{t('marca.atacadoDestaque')}</strong> {t('marca.atacadoVarejoExplicacao2')} <strong>{t('marca.precoAtacadoDestaque')}</strong> {t('marca.atacadoVarejoExplicacao3')}
        </p>
        <div className="linha-campos">
          <div className="campo" style={{ maxWidth: 220 }}>
            <label>{t('marca.pedidoMinimoLabel')}</label>
            <input type="number" min={2} value={marca.pedidoMinimoAtacado} onChange={(e) => setMarca({ ...marca, pedidoMinimoAtacado: Number(e.target.value) })} />
          </div>
        </div>
        <h3 style={{ margin: '8px 0 4px' }}>{t('marca.textoDisparoTitulo')}</h3>
        <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 0 }}>
          {t('marca.textoDisparoExplicacao')} {'{primeiroNome}'} {'{nome}'} {'{loja}'} {'{vendedora}'}.
        </p>
        <div className="campo">
          <textarea rows={3} value={marca.textoDisparoPadrao ?? ''} placeholder={t('marca.textoDisparoPlaceholder')}
            onChange={(e) => setMarca({ ...marca, textoDisparoPadrao: e.target.value })} />
        </div>
        <div className="campo">
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked={marca.disparoVendedoraEditavel} onChange={(e) => setMarca({ ...marca, disparoVendedoraEditavel: e.target.checked })} style={{ width: 'auto' }} />
            {t('marca.permitirEdicaoLabel')}
          </label>
        </div>
        <div className="acoes">
          <button className="btn">{t('comum.salvar')}</button>
        </div>
      </form>

      {preview && (
        <PreviewLoja
          nome={marca.nome}
          logoUrl={marca.logoUrl}
          bannerUrl={marca.bannerUrl}
          corPrimaria={marca.corPrimaria}
          corSecundaria={marca.corSecundaria}
          onClose={() => setPreview(false)}
        />
      )}
    </>
  )
}
