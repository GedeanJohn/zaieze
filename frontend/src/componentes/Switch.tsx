interface Props {
  ligado: boolean
  onChange: () => void
  rotuloLigado: string
  rotuloDesligado: string
  icone?: string
  disabled?: boolean
  title?: string
}

/** Botão-switch (liga/desliga) reutilizável — mesmo padrão visual dos botões de ação ao lado
 *  (ver .switch-btn/.acao-btn em styles.css), para estados binários reais (ex.: liberar/outlet). */
export default function Switch({ ligado, onChange, rotuloLigado, rotuloDesligado, icone, disabled, title }: Props) {
  return (
    <button type="button" className={`switch-btn ${ligado ? 'on' : ''}`} onClick={onChange} disabled={disabled} title={title}>
      {icone && <span>{icone}</span>}
      <span>{ligado ? rotuloLigado : rotuloDesligado}</span>
      <span className="switch-trilho"><span className="switch-bola" /></span>
    </button>
  )
}
