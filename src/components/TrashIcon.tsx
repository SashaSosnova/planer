export function TrashIcon({ size = 18 }: { size?: number }) {
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
        d="M5 7h14M10 7V5h4v2M9 7l.8 12h4.4L15 7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
