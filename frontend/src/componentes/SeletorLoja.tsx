import { useEffect, useMemo, useState } from 'react'
import { api, usuarioLogado } from '../api'

export interface LojaResumo { id: string; nome: string; ativo: boolean }

/**
 * Escopo de loja para o GESTOR (rede com uma ou mais lojas).
 * Gerente/vendedora já têm a loja no token — o hook devolve lojaId null e a API usa o escopo do JWT.
 */
export function useLojaAtiva() {
  const usuario = usuarioLogado()!
  // Papéis de rede (gestor e estoquista) operam escolhendo a loja
  const ehGestor = usuario.role === 'GESTOR' || usuario.role === 'ESTOQUISTA'
  const [lojas, setLojas] = useState<LojaResumo[]>([])
  const [lojaId, setLojaIdState] = useState<string | null>(
    ehGestor ? localStorage.getItem('modacrm_lojaId') : null,
  )

  useEffect(() => {
    if (!ehGestor) return
    api.get('/lojas').then(({ data }) => {
      setLojas(data)
      if (data.length && !data.some((l: LojaResumo) => l.id === lojaId)) {
        setLojaId(data[0].id)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ehGestor])

  function setLojaId(id: string) {
    localStorage.setItem('modacrm_lojaId', id)
    setLojaIdState(id)
  }

  /**
   * Params de escopo a anexar nas chamadas — { lojaId } para gestor, vazio para os demais.
   * Memoizado para manter a MESMA referência entre renders: sem isso, cada render gera
   * um objeto novo e os useEffect/useCallback que dependem dele disparam em loop (painel "tremendo").
   */
  const params = useMemo<Record<string, string>>(() => {
    const p: Record<string, string> = {}
    if (ehGestor && lojaId) p.lojaId = lojaId
    return p
  }, [ehGestor, lojaId])
  const pronto = !ehGestor || lojaId !== null

  return { ehGestor, lojas, lojaId, setLojaId, params, pronto }
}

export function SeletorLoja({ escopo }: { escopo: ReturnType<typeof useLojaAtiva> }) {
  if (!escopo.ehGestor) return null
  return (
    <div className="campo" style={{ minWidth: 220, marginBottom: 0 }}>
      <label>Loja</label>
      <select value={escopo.lojaId ?? ''} onChange={(e) => escopo.setLojaId(e.target.value)}>
        {escopo.lojas.map((l) => (
          <option key={l.id} value={l.id}>{l.nome}{l.ativo ? '' : ' (inativa)'}</option>
        ))}
      </select>
    </div>
  )
}
