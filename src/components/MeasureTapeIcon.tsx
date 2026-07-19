/** Soft measuring / tailor tape icon */
export function MeasureTapeIcon({ size = 24 }: { size?: number }) {
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
        d="M4.5 8.5c0-1.4 1.1-2.5 2.5-2.5h7.2c3.1 0 5.6 2.5 5.6 5.6v.2c0 3.1-2.5 5.6-5.6 5.6H9.2A2.7 2.7 0 0 1 6.5 14.7V11"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7 8.5h9.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      {/* tick marks like a cm tape */}
      <path
        d="M9 8.5v2M11.2 8.5v1.3M13.4 8.5v2M15.6 8.5v1.3M17.8 8.5v2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle cx="7" cy="11.5" r="1.6" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}
