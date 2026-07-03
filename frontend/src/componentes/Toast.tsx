import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

interface ToastItem { id: number; texto: string; tipo: 'sucesso' | 'erro' }

const ToastCtx = createContext<((texto: string, tipo?: 'sucesso' | 'erro') => void) | null>(null)

/** Avisos fixos no topo da tela (visível mesmo em página longa e rolada) — usado após salvar. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [itens, setItens] = useState<ToastItem[]>([])

  const avisar = useCallback((texto: string, tipo: 'sucesso' | 'erro' = 'sucesso') => {
    const id = Date.now() + Math.random()
    setItens((lista) => [...lista, { id, texto, tipo }])
    setTimeout(() => setItens((lista) => lista.filter((i) => i.id !== id)), 3500)
  }, [])

  return (
    <ToastCtx.Provider value={avisar}>
      {children}
      <div className="toast-wrap">
        {itens.map((i) => <div key={i.id} className={`toast ${i.tipo}`}>{i.texto}</div>)}
      </div>
    </ToastCtx.Provider>
  )
}

export function useToast() {
  const avisar = useContext(ToastCtx)
  if (!avisar) throw new Error('useToast precisa estar dentro de <ToastProvider>')
  return avisar
}
