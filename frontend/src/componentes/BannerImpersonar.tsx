import { usuarioLogado } from '../api'
import { estaImpersonando, voltarDoImpersonar } from '../lib/impersonar'

/** Faixa fixa no topo, visível em QUALQUER tela (CRM, painel da assessora, do afiliado) enquanto
 *  o SUPER_ADMIN estiver operando a sessão de outro usuário — deixa claro que não é a própria
 *  conta, e sempre com um jeito rápido de voltar. */
export default function BannerImpersonar() {
  if (!estaImpersonando()) return null
  const u = usuarioLogado()

  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: 10, padding: '8px 16px', background: '#7c2d12', color: '#fff', fontSize: 13, fontWeight: 600,
    }}>
      <span>🔓 Operando como {u?.nome ?? 'outro usuário'} ({u?.role})</span>
      <button
        type="button"
        onClick={voltarDoImpersonar}
        style={{ background: '#fff', color: '#7c2d12', border: 'none', borderRadius: 6, padding: '3px 10px', fontWeight: 700, cursor: 'pointer' }}
      >
        Voltar pro admin
      </button>
    </div>
  )
}
