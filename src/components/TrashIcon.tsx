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
        d="M7.2 8.2h9.6l-.7 10.2a2 2 0 0 1-2 1.8H9.9a2 2 0 0 1-2-1.8L7.2 8.2z"
        fill="currentColor"
        opacity="0.2"
      />
      <path
        d="M4.5 7.2h15"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M9.2 7.2V5.8A1.6 1.6 0 0 1 10.8 4.2h2.4A1.6 1.6 0 0 1 14.8 5.8v1.4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.8 7.2l.8 11.6c.1 1 .9 1.8 1.9 1.8h5c1 0 1.8-.8 1.9-1.8l.8-11.6"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10.2 11v5M13.8 11v5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  )
}
