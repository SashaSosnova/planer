/** Soft flower-gear for settings — filled petals */
export function SettingsIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      style={{ width: size, height: size, display: 'block', flexShrink: 0 }}
    >
      <path
        d="M12 3.5c1.2 1.3 1.8 2.4 1.8 3.4 0 1-.8 1.8-1.8 1.8s-1.8-.8-1.8-1.8c0-1 .6-2.1 1.8-3.4z"
        fill="currentColor"
        opacity="0.45"
      />
      <path
        d="M12 20.5c-1.2-1.3-1.8-2.4-1.8-3.4 0-1 .8-1.8 1.8-1.8s1.8.8 1.8 1.8c0 1-.6 2.1-1.8 3.4z"
        fill="currentColor"
        opacity="0.45"
      />
      <path
        d="M3.5 12c1.3-1.2 2.4-1.8 3.4-1.8 1 0 1.8.8 1.8 1.8s-.8 1.8-1.8 1.8c-1 0-2.1-.6-3.4-1.8z"
        fill="currentColor"
        opacity="0.35"
      />
      <path
        d="M20.5 12c-1.3 1.2-2.4 1.8-3.4 1.8-1 0-1.8-.8-1.8-1.8s.8-1.8 1.8-1.8c1 0 2.1.6 3.4 1.8z"
        fill="currentColor"
        opacity="0.35"
      />
      <path
        d="M6.3 6.3c1.6.4 2.6 1 3 1.7.5.7.2 1.7-.5 2.1-.7.5-1.7.2-2.1-.5-.5-.6-1-1.8-.4-3.3z"
        fill="currentColor"
        opacity="0.4"
      />
      <path
        d="M17.7 17.7c-1.6-.4-2.6-1-3-1.7-.5-.7-.2-1.7.5-2.1.7-.5 1.7-.2 2.1.5.5.6 1 1.8.4 3.3z"
        fill="currentColor"
        opacity="0.4"
      />
      <path
        d="M17.7 6.3c-.4 1.6-1 2.6-1.7 3-.7.5-1.7.2-2.1-.5-.5-.7-.2-1.7.5-2.1.6-.5 1.8-1 3.3-.4z"
        fill="currentColor"
        opacity="0.4"
      />
      <path
        d="M6.3 17.7c.4-1.6 1-2.6 1.7-3 .7-.5 1.7-.2 2.1.5.5.7.2 1.7-.5 2.1-.6.5-1.8 1-3.3.4z"
        fill="currentColor"
        opacity="0.4"
      />
      <circle cx="12" cy="12" r="3" fill="currentColor" />
      <circle cx="12" cy="12" r="1.2" fill="var(--surface, #fff)" />
    </svg>
  )
}
