export function PencilIcon({ size = 18 }: { size?: number }) {
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
        d="M4.2 19.8h3.6L18.5 9.1a1.6 1.6 0 0 0 0-2.26L17.16 5.5a1.6 1.6 0 0 0-2.26 0L4.2 16.2v3.6z"
        fill="currentColor"
        opacity="0.2"
      />
      <path
        d="M4.2 19.8h3.6L18.5 9.1a1.6 1.6 0 0 0 0-2.26L17.16 5.5a1.6 1.6 0 0 0-2.26 0L4.2 16.2v3.6z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M13.4 6.7l3.9 3.9"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  )
}
