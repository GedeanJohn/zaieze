import { useEffect, useRef, useState } from 'react'
import { useIdioma, type Idioma } from '../lib/i18n'

const BANDEIRA: Record<Idioma, string> = { pt: '🇧🇷', en: '🇺🇸', es: '🇪🇸' }
const CODIGO: Record<Idioma, string> = { pt: 'PT', en: 'EN', es: 'ES' }
const ORDEM: Idioma[] = ['pt', 'en', 'es']

/** Seletor de idioma (bandeira + dropdown) — estilo comum em sites institucionais (ex.: TOTVS). */
export default function SeletorIdioma() {
  const { idioma, setIdioma } = useIdioma()
  const [aberto, setAberto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', aoClicarFora)
    return () => document.removeEventListener('mousedown', aoClicarFora)
  }, [])

  const outros = ORDEM.filter((i) => i !== idioma)

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-label="Selecionar idioma / Select language / Seleccionar idioma"
        style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 999,
          border: '1px solid rgba(255,255,255,0.3)', background: 'transparent', color: '#fff', cursor: 'pointer', fontSize: 13,
        }}
      >
        <span style={{ fontSize: 16, lineHeight: 1 }}>{BANDEIRA[idioma]}</span>
        <span style={{ fontSize: 9 }}>▾</span>
      </button>

      {aberto && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0, background: '#1a1a1b',
            border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, overflow: 'hidden', minWidth: 92, zIndex: 30,
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          }}
        >
          {outros.map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => { setIdioma(i); setAberto(false) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 14px', border: 'none',
                background: 'transparent', color: '#fff', cursor: 'pointer', fontSize: 13, textAlign: 'left',
              }}
            >
              <span style={{ fontSize: 16, lineHeight: 1 }}>{BANDEIRA[i]}</span> {CODIGO[i]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
