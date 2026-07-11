import { useEffect, useState } from 'react'
import { api } from '../../api'

interface Marca {
  id: string; redeId: string | null; nome: string; logoUrl: string | null
  descricao: string | null; formasPagamento: string | null; modoEnvio: string | null; condicoesCompra: string | null
  tamanhos: string | null; valores: string | null; endereco: string | null; cnpj: string | null
  instagram: string | null; facebook: string | null; whatsapp: string | null; telegram: string | null; tiktok: string | null; site: string | null
}
interface Vitrine {
  nome: string; fotoUrl: string | null; bio: string | null
  whatsapp: string | null; instagram: string | null; site: string | null
  marcas: Marca[]
}

/** Cada bullet do textarea vira um item de lista (uma linha = um item). */
function bullets(texto: string | null): string[] {
  return (texto ?? '').split('\n').map((l) => l.trim()).filter(Boolean)
}

function linkWhatsapp(numero: string): string {
  return `https://wa.me/${numero.replace(/\D/g, '')}`
}

export default function VitrineAssessora({ slug }: { slug: string }) {
  const [v, setV] = useState<Vitrine | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    api.get(`/assessores/publico/${slug}`).then(({ data }) => setV(data)).catch(() => setErro('Página não encontrada.'))
  }, [slug])

  if (erro) return <div className="vit-vazio">{erro}</div>
  if (!v) return <div className="vit-vazio">Carregando…</div>

  return (
    <div className="vit-root">
      <VitrineEstilos />

      <header className="vit-capa">
        {v.fotoUrl ? <img className="vit-foto" src={v.fotoUrl} alt={v.nome} /> : <div className="vit-fotoPlaceholder">{v.nome.slice(0, 1).toUpperCase()}</div>}
        <h1 className="vit-nome">{v.nome}</h1>
        <div className="vit-selo">Assessor(a) de Moda</div>
        {v.bio && <p className="vit-bio">{v.bio}</p>}
        <div className="vit-contatos">
          {v.whatsapp && <a className="vit-btnContato" href={linkWhatsapp(v.whatsapp)} target="_blank" rel="noreferrer">WhatsApp</a>}
          {v.instagram && <a className="vit-btnContato alt" href={v.instagram} target="_blank" rel="noreferrer">Instagram</a>}
          {v.site && <a className="vit-btnContato alt" href={v.site} target="_blank" rel="noreferrer">Site</a>}
        </div>
        {v.marcas.length > 0 && (
          <a className="vit-btnPdf" href={`/api/assessores/publico/${slug}/catalogo.pdf`} target="_blank" rel="noreferrer">
            📄 Baixar catálogo em PDF
          </a>
        )}
      </header>

      <main className="vit-marcas">
        {v.marcas.length === 0 && <div className="vit-vazio">Nenhuma marca cadastrada ainda.</div>}
        {v.marcas.map((m) => <CartaoMarca key={m.id} m={m} />)}
      </main>

      <footer className="vit-pe">powered by ZAIEZE</footer>
    </div>
  )
}

function CartaoMarca({ m }: { m: Marca }) {
  const descricao = bullets(m.descricao)
  const formasPagamento = bullets(m.formasPagamento)
  const modoEnvio = bullets(m.modoEnvio)
  const condicoesCompra = bullets(m.condicoesCompra)

  return (
    <section className="vit-cartao">
      <div className="vit-cartaoTopo">
        {m.logoUrl && <img className="vit-logo" src={m.logoUrl} alt={m.nome} />}
        <h2 className="vit-marcaNome">{m.nome}</h2>
      </div>

      <div className="vit-cartaoCorpo">
        <div>
          {descricao.length > 0 && (
            <div className="vit-bloco">
              <div className="vit-rotulo">Descrição</div>
              <ul>{descricao.map((d, i) => <li key={i}>{d}</li>)}</ul>
            </div>
          )}
          {formasPagamento.length > 0 && (
            <div className="vit-bloco">
              <div className="vit-rotulo">Formas de pagamento</div>
              <ul>{formasPagamento.map((d, i) => <li key={i}>{d}</li>)}</ul>
            </div>
          )}
          {modoEnvio.length > 0 && (
            <div className="vit-bloco">
              <div className="vit-rotulo">Modo de envio</div>
              <ul>{modoEnvio.map((d, i) => <li key={i}>{d}</li>)}</ul>
            </div>
          )}
          {condicoesCompra.length > 0 && (
            <div className="vit-bloco">
              <div className="vit-rotulo">Condições de compra</div>
              <ul>{condicoesCompra.map((d, i) => <li key={i}>{d}</li>)}</ul>
            </div>
          )}
        </div>

        <div>
          {m.tamanhos && <div className="vit-bloco"><div className="vit-rotulo">Tamanhos</div><div>{m.tamanhos}</div></div>}
          {m.valores && <div className="vit-bloco"><div className="vit-rotulo">Valores</div><div className="vit-valores">{m.valores}</div></div>}
          {m.endereco && <div className="vit-bloco"><div className="vit-rotulo">Endereço</div><div>{m.endereco}</div></div>}
          {m.cnpj && <div className="vit-bloco"><div className="vit-rotulo">CNPJ</div><div>{m.cnpj}</div></div>}
        </div>
      </div>

      <div className="vit-cartaoAcoes">
        {m.whatsapp && <a className="vit-btn" href={linkWhatsapp(m.whatsapp)} target="_blank" rel="noreferrer">WhatsApp</a>}
        {m.instagram && <a className="vit-btn alt" href={m.instagram} target="_blank" rel="noreferrer">Instagram</a>}
        {m.facebook && <a className="vit-btn alt" href={m.facebook} target="_blank" rel="noreferrer">Facebook</a>}
        {m.telegram && <a className="vit-btn alt" href={m.telegram} target="_blank" rel="noreferrer">Telegram</a>}
        {m.tiktok && <a className="vit-btn alt" href={m.tiktok} target="_blank" rel="noreferrer">TikTok</a>}
        {m.site && <a className="vit-btn alt" href={m.site} target="_blank" rel="noreferrer">Site</a>}
      </div>
    </section>
  )
}

function VitrineEstilos() {
  return (
    <style>{`
      .vit-root { background: #f6f3f1; min-height: 100vh; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: #1a1a1a; }
      .vit-vazio { max-width: 700px; margin: 80px auto; text-align: center; color: #777; padding: 0 16px; }
      .vit-capa { max-width: 720px; margin: 0 auto; padding: 48px 24px 32px; text-align: center; }
      .vit-foto { width: 112px; height: 112px; border-radius: 50%; object-fit: cover; margin: 0 auto 14px; display: block; box-shadow: 0 4px 16px #00000022; }
      .vit-fotoPlaceholder { width: 112px; height: 112px; border-radius: 50%; margin: 0 auto 14px; display: flex; align-items: center; justify-content: center; background: #8a1f2b; color: #fff; font-size: 40px; font-weight: 800; }
      .vit-nome { margin: 0; font-size: 26px; font-weight: 800; }
      .vit-selo { display: inline-block; margin-top: 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; color: #8a1f2b; background: #f7e3e0; padding: 4px 12px; border-radius: 99px; }
      .vit-bio { max-width: 520px; margin: 16px auto 0; color: #555; font-size: 14px; line-height: 1.6; }
      .vit-contatos { display: flex; gap: 10px; justify-content: center; margin-top: 20px; flex-wrap: wrap; }
      .vit-btnContato { background: #25d366; color: #fff; text-decoration: none; padding: 10px 18px; border-radius: 8px; font-weight: 700; font-size: 14px; }
      .vit-btnContato.alt { background: #1a1a1a; }
      .vit-btnPdf { display: inline-block; margin-top: 14px; color: #8a1f2b; text-decoration: underline; font-size: 13px; font-weight: 700; }
      .vit-marcas { max-width: 900px; margin: 0 auto; padding: 8px 16px 40px; display: flex; flex-direction: column; gap: 20px; }
      .vit-cartao { background: #fff; border-radius: 14px; padding: 24px; box-shadow: 0 4px 20px #00000014; }
      .vit-cartaoTopo { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; padding-bottom: 14px; border-bottom: 2px solid #1a1a1a; }
      .vit-logo { width: 44px; height: 44px; border-radius: 8px; object-fit: cover; }
      .vit-marcaNome { margin: 0; font-size: 20px; font-weight: 800; }
      .vit-cartaoCorpo { display: grid; grid-template-columns: 1.3fr 1fr; gap: 24px; }
      .vit-bloco { margin-bottom: 14px; font-size: 14px; }
      .vit-rotulo { font-size: 11px; text-transform: uppercase; letter-spacing: .5px; color: #999; font-weight: 700; margin-bottom: 4px; }
      .vit-bloco ul { margin: 0; padding-left: 18px; line-height: 1.7; }
      .vit-valores { font-weight: 700; color: #8a1f2b; }
      .vit-cartaoAcoes { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 16px; padding-top: 16px; border-top: 1px solid #eee; }
      .vit-btn { background: #25d366; color: #fff; text-decoration: none; padding: 9px 16px; border-radius: 8px; font-weight: 700; font-size: 13px; }
      .vit-btn.alt { background: #1a1a1a; }
      .vit-pe { text-align: center; color: #bbb; font-size: 11px; padding: 0 0 24px; }
      @media (max-width: 640px) {
        .vit-cartaoCorpo { grid-template-columns: 1fr; }
        .vit-cartao { padding: 18px; }
      }
    `}</style>
  )
}
