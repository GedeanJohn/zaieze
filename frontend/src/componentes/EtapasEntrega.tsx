export type StatusEntrega = 'SEPARANDO' | 'TRANSPORTADORA' | 'EM_TRANSITO' | 'ENTREGUE'

export const ETAPAS_ENTREGA: { chave: StatusEntrega; rotulo: string }[] = [
  { chave: 'SEPARANDO', rotulo: 'Separando mercadoria' },
  { chave: 'TRANSPORTADORA', rotulo: 'Com a transportadora' },
  { chave: 'EM_TRANSITO', rotulo: 'Em trânsito' },
  { chave: 'ENTREGUE', rotulo: 'Entregue' },
]

export function rotuloEtapaEntrega(status: StatusEntrega): string {
  return ETAPAS_ENTREGA.find((e) => e.chave === status)?.rotulo ?? status
}

/** Stepper visual das 4 etapas de entrega de um pedido fechado — reaproveitado em 3 telas
 *  (Separacao.tsx pro gestor de estoque/gerente, Pedido.tsx pra vendedora, MeusPedidos.tsx pro
 *  cliente). Só apresentação; cada tela adiciona seus próprios botões de ação, se tiver. `cor`
 *  deixa customizar o destaque (o padrão serve pras telas internas; a vitrine pública passa a cor
 *  da marca). */
export function EtapasEntrega({ atual, cor = 'var(--accent)' }: { atual: StatusEntrega; cor?: string }) {
  const idxAtual = ETAPAS_ENTREGA.findIndex((e) => e.chave === atual)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start' }}>
      {ETAPAS_ENTREGA.map((e, i) => {
        const feita = i < idxAtual
        const ativa = i === idxAtual
        return (
          <div key={e.chave} style={{ display: 'flex', alignItems: 'center', flex: i < ETAPAS_ENTREGA.length - 1 ? 1 : '0 0 auto' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 64 }}>
              <span style={{
                width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700, flexShrink: 0,
                background: feita || ativa ? cor : 'currentColor', opacity: feita || ativa ? 1 : 0.25,
                color: feita || ativa ? '#fff' : 'inherit',
              }}>{feita ? '✓' : i + 1}</span>
              <span style={{ fontSize: 10, textAlign: 'center', lineHeight: 1.3, color: ativa ? cor : 'inherit', opacity: ativa ? 1 : 0.6, fontWeight: ativa ? 700 : 400, maxWidth: 76 }}>
                {e.rotulo}
              </span>
            </div>
            {i < ETAPAS_ENTREGA.length - 1 && (
              <div style={{ flex: 1, height: 2, background: feita ? cor : 'currentColor', opacity: feita ? 1 : 0.2, marginBottom: 18 }} />
            )}
          </div>
        )
      })}
    </div>
  )
}
