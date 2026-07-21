type IconProps = { size?: number }

function svgProps(size: number) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24' as const,
    fill: 'none' as const,
    'aria-hidden': true as const,
    style: { width: size, height: size, display: 'block' as const, flexShrink: 0 },
  }
}

/** Дневник — как профиль: крупные простые штрихи 1.8 */
export function DiaryMenuIcon({ size = 24 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path
        d="M7 4h10a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M9.5 9h5M9.5 12.5h5M9.5 16h3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function HistoryMenuIcon({ size = 24 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <circle cx="12" cy="12" r="7.2" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 8v4.2l2.6 1.6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function MeasuresMenuIcon({ size = 24 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <rect
        x="4.5"
        y="9"
        width="15"
        height="6"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M8 9v2.6M11 9v1.7M14 9v2.6M17 9v1.7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function TastesMenuIcon({ size = 24 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path
        d="M12 19.2S5.5 15.2 5.5 10.4A3.6 3.6 0 0 1 12 8.6a3.6 3.6 0 0 1 6.5 1.8c0 4.8-6.5 8.8-6.5 8.8z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function LibraryMenuIcon({ size = 24 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path
        d="M12 6.2c-1.2-1-2.9-1.5-4.6-1.5H5v12.5h2.7c1.6 0 3.1.4 4.3 1.3 1.2-.9 2.7-1.3 4.3-1.3H19V4.7h-2.4c-1.7 0-3.4.5-4.6 1.5z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M12 6.2v12.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}
