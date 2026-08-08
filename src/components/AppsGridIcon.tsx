export function AppsGridIcon({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      style={{ width: size, height: size, display: 'block', flexShrink: 0 }}
    >
      <rect x="4.5" y="4.5" width="6" height="6" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <rect x="13.5" y="4.5" width="6" height="6" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <rect x="4.5" y="13.5" width="6" height="6" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <rect x="13.5" y="13.5" width="6" height="6" rx="2" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  )
}
