import { useState, type InputHTMLAttributes } from 'react'
import { Eye, EyeOff } from 'lucide-react'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>

/** Input de senha com botão de olho para exibir/ocultar o texto e conferir o que foi digitado. */
export default function CampoSenha({ style, ...rest }: Props) {
  const [visivel, setVisivel] = useState(false)

  return (
    <div style={{ position: 'relative', ...(style as object) }}>
      <input {...rest} type={visivel ? 'text' : 'password'} style={{ paddingRight: 38 }} />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setVisivel((v) => !v)}
        aria-label={visivel ? 'Ocultar senha' : 'Mostrar senha'}
        title={visivel ? 'Ocultar senha' : 'Mostrar senha'}
        style={{
          position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
          display: 'flex', alignItems: 'center', background: 'none', border: 'none',
          padding: 4, cursor: 'pointer', color: 'var(--ink-soft)',
        }}
      >
        {visivel ? <EyeOff size={16} strokeWidth={1.8} /> : <Eye size={16} strokeWidth={1.8} />}
      </button>
    </div>
  )
}
