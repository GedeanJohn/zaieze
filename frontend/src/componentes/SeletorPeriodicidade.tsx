export type Periodicidade = 'MENSAL' | 'ANUAL'

interface Props {
  valor: Periodicidade
  onChange: (p: Periodicidade) => void
  percentualDesconto?: number
}

/** Seletor Mensal/Anual (pill) — usado na landing e no checkout. */
export default function SeletorPeriodicidade({ valor, onChange, percentualDesconto }: Props) {
  const opcao = (id: Periodicidade, label: string) => (
    <button
      type="button"
      onClick={() => onChange(id)}
      style={{
        padding: '8px 20px', borderRadius: 999, border: 'none', cursor: 'pointer',
        fontSize: 14, fontWeight: 600, transition: 'background .15s, color .15s',
        background: valor === id ? 'var(--accent)' : 'transparent',
        color: valor === id ? '#151516' : 'inherit',
      }}
    >
      {label}
    </button>
  )

  return (
    <div
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, padding: 4,
        border: '1px solid var(--accent)', borderRadius: 999,
      }}
    >
      {opcao('ANUAL', percentualDesconto ? `Anual (${percentualDesconto}% off)` : 'Anual')}
      {opcao('MENSAL', 'Mensal')}
    </div>
  )
}
