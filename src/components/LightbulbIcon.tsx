export function LightbulbIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      style={{ width: size, height: size, display: 'block', flexShrink: 0 }}
    >
      {/* rays — like 💡 */}
      <path
        d="M12 2v1.6M18.4 5.6l-1.1 1.1M22 12h-1.6M5.6 5.6l1.1 1.1M3.6 12H2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      {/* bulb */}
      <path
        d="M8.2 14.2A5.2 5.2 0 1 1 15.8 14.2c-.55.7-1.1 1.55-1.25 2.5H9.45c-.15-.95-.7-1.8-1.25-2.5z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      {/* base */}
      <path
        d="M9.4 16.7h5.2M9.8 18.6h4.4M10.6 20.5h2.8"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  )
}
