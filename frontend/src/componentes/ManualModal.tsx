import { X, Printer } from 'lucide-react'
import { useIdioma } from '../lib/i18n'
import ConteudoGestor from '../paginas/manuais/ConteudoGestor'
import ConteudoGerente from '../paginas/manuais/ConteudoGerente'
import ConteudoVendedora from '../paginas/manuais/ConteudoVendedora'
import ConteudoEstoquista from '../paginas/manuais/ConteudoEstoquista'

type PapelComManual = 'GESTOR' | 'GERENTE' | 'VENDEDORA' | 'ESTOQUISTA'

const CONTEUDO: Record<PapelComManual, () => JSX.Element> = {
  GESTOR: ConteudoGestor,
  GERENTE: ConteudoGerente,
  VENDEDORA: ConteudoVendedora,
  ESTOQUISTA: ConteudoEstoquista,
}
const CHAVE_TITULO: Record<PapelComManual, string> = {
  GESTOR: 'manual', GERENTE: 'manual.ger', VENDEDORA: 'manual.vend', ESTOQUISTA: 'manual.estq',
}

/** Manual de instruções em janela (modal), aberto a partir do menu — conteúdo didático específico
 * de cada perfil (Gestor/Gerente/Vendedora/Gestor de Estoque). Substitui a necessidade de navegar
 * para uma página separada: o usuário fecha e volta exatamente de onde estava. */
export default function ManualModal({ papel, aoFechar }: { papel: PapelComManual; aoFechar: () => void }) {
  const { t } = useIdioma()
  const Conteudo = CONTEUDO[papel]
  const chave = CHAVE_TITULO[papel]
  return (
    <div className="modal-fundo" onClick={aoFechar}>
      <div className="modal-manual" onClick={(e) => e.stopPropagation()}>
        <div className="manual-modal-cabecalho">
          <div>
            <h2>{t(`${chave}.titulo`)}</h2>
            <p>{t(`${chave}.subtitulo`)}</p>
          </div>
          <div className="manual-modal-acoes">
            <button type="button" onClick={() => window.print()} title={t('manual.imprimir')} aria-label={t('manual.imprimir')}><Printer size={18} /></button>
            <button type="button" onClick={aoFechar} title={t('comum.fechar')} aria-label={t('comum.fechar')}><X size={18} /></button>
          </div>
        </div>
        <div className="manual-modal-corpo">
          <Conteudo />
        </div>
      </div>
    </div>
  )
}
