// Ícones de canal (glifos simplificados, sem depender de biblioteca externa) — usados nos badges
// de avatar e na barra de canais do Chat Zaieze. Todos 24x24, fill="currentColor" (a cor vem do
// fundo colorido do badge, aplicada via CSS em volta do ícone).

export function IconeWhatsApp({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.39 1.26 4.81L2 22l5.42-1.42a9.87 9.87 0 0 0 4.62 1.18h.01c5.46 0 9.9-4.45 9.9-9.91C21.96 6.45 17.5 2 12.04 2Zm5.8 14.06c-.24.68-1.4 1.3-1.93 1.35-.5.05-1.03.24-3.47-.72-2.94-1.16-4.79-4.15-4.94-4.34-.15-.2-1.18-1.57-1.18-3 0-1.43.75-2.13 1.02-2.42.27-.29.58-.36.78-.36.2 0 .39 0 .56.01.18.01.42-.07.66.5.24.58.83 2 .9 2.15.07.15.12.33.02.53-.1.2-.15.32-.3.5-.15.17-.31.39-.44.52-.15.15-.3.31-.13.6.17.3.76 1.25 1.63 2.02 1.12 1 2.06 1.31 2.36 1.46.3.15.47.13.65-.08.18-.2.75-.88.95-1.18.2-.3.4-.25.66-.15.27.1 1.7.8 1.99.95.29.15.48.22.55.34.07.13.07.72-.17 1.4Z"/>
    </svg>
  )
}

export function IconeInstagram({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconeMessenger({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.48 2 2 6.15 2 11.27c0 2.92 1.45 5.52 3.72 7.22V22l3.4-1.87c.91.25 1.87.39 2.88.39 5.52 0 10-4.15 10-9.25S17.52 2 12 2Zm1.02 12.46-2.55-2.72-4.98 2.72 5.48-5.82 2.61 2.72 4.92-2.72-5.48 5.82Z"/>
    </svg>
  )
}

export function IconeTelegram({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M21.5 3.5 2.7 10.9c-1 .4-1 1.06-.18 1.32l4.8 1.5 1.85 5.68c.24.62.42.87.85.87.4 0 .58-.18.8-.4l1.93-1.87 4.02 2.97c.74.4 1.27.2 1.46-.68l2.64-12.5c.28-1.1-.42-1.6-1.37-1.28ZM8.1 13.34l9.34-5.84c.44-.27.84-.12.51.18l-7.9 7.2-.31 3.3-1.64-4.84Z"/>
    </svg>
  )
}

export function IconeEmail({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="2.5" y="4.5" width="19" height="15" rx="2.5" />
      <path d="m3.5 6 8.5 6.5L20.5 6" />
    </svg>
  )
}

export function IconeTodosCanais({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="6" cy="6" r="2.6" /><circle cx="18" cy="6" r="2.6" />
      <circle cx="6" cy="18" r="2.6" /><circle cx="18" cy="18" r="2.6" />
    </svg>
  )
}
