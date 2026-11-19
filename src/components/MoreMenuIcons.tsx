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

/** Дневник — ежедневник с закладкой и датами */
export function DiaryMenuIcon({ size = 24 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path
        d="M6 4.2h10.2c1.2 0 2.2 1 2.2 2.2v11.2c0 1.2-1 2.2-2.2 2.2H6c-.8 0-1.4-.6-1.4-1.4V5.6C4.6 4.8 5.2 4.2 6 4.2z"
        fill="currentColor"
        opacity="0.16"
      />
      <path
        d="M6 4.2h10.2c1.2 0 2.2 1 2.2 2.2v11.2c0 1.2-1 2.2-2.2 2.2H6c-.8 0-1.4-.6-1.4-1.4V5.6C4.6 4.8 5.2 4.2 6 4.2z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      {/* spine */}
      <path d="M7.6 4.2v15.6" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" />
      {/* elastic band */}
      <path
        d="M4.6 10.8h13.8"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        opacity="0.85"
      />
      {/* week lines */}
      <path
        d="M9.6 7.4h5.4M9.6 13.6h5.4M9.6 15.8h3.6"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinecap="round"
      />
      {/* bookmark ribbon */}
      <path
        d="M15.6 4.2v4.4l1.3-1 1.3 1V4.2"
        fill="currentColor"
        opacity="0.35"
      />
      <path
        d="M15.6 4.2v4.4l1.3-1 1.3 1V4.2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** История — календарь с отмеченными днями */
export function HistoryMenuIcon({ size = 24 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <rect x="4" y="5.5" width="16" height="14.5" rx="2.5" fill="currentColor" opacity="0.16" />
      <rect
        x="4"
        y="5.5"
        width="16"
        height="14.5"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path d="M4 9.2h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path
        d="M8.2 3.8v3.2M15.8 3.8v3.2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <circle cx="8.2" cy="13" r="1.15" fill="currentColor" />
      <circle cx="12" cy="13" r="1.15" fill="currentColor" opacity="0.45" />
      <circle cx="15.8" cy="13" r="1.15" fill="currentColor" opacity="0.45" />
      <circle cx="8.2" cy="16.6" r="1.15" fill="currentColor" opacity="0.45" />
      <circle cx="12" cy="16.6" r="1.15" fill="currentColor" />
    </svg>
  )
}

/** Обмеры — сантиметровая лента (для SVG-мест вне главного меню) */
export function MeasuresMenuIcon({ size = 24 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      {/* rolled tape case */}
      <circle cx="8.5" cy="13.5" r="5.2" fill="currentColor" opacity="0.16" />
      <circle cx="8.5" cy="13.5" r="5" stroke="currentColor" strokeWidth="1.55" />
      <circle cx="8.5" cy="13.5" r="1.7" fill="currentColor" opacity="0.35" />
      <circle cx="8.5" cy="13.5" r="1.7" stroke="currentColor" strokeWidth="1.4" />
      {/* flat tape extending right with cm ticks */}
      <path
        d="M13.2 11.2h6.2c.9 0 1.6.7 1.6 1.6v1.4c0 .9-.7 1.6-1.6 1.6h-6"
        fill="currentColor"
        opacity="0.14"
      />
      <path
        d="M13.2 11.2h6.2c.9 0 1.6.7 1.6 1.6v1.4c0 .9-.7 1.6-1.6 1.6h-6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M14.6 11.2v1.5M16.2 11.2v2.2M17.8 11.2v1.5M19.4 11.2v2.2"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Каталог — две мягкие книжки */
export function LibraryMenuIcon({ size = 24 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <path
        d="M4.8 6.2c0-.9.7-1.6 1.6-1.6h4.2c.9 0 1.6.7 1.6 1.6v12.2c0 .5-.5.8-.9.6l-2.8-1.3-2.8 1.3c-.4.2-.9-.1-.9-.6V6.2z"
        fill="currentColor"
        opacity="0.2"
      />
      <path
        d="M11.8 6.2c0-.9.7-1.6 1.6-1.6h4.2c.9 0 1.6.7 1.6 1.6v12.2c0 .5-.5.8-.9.6l-2.8-1.3-2.8 1.3c-.4.2-.9-.1-.9-.6V6.2z"
        fill="currentColor"
        opacity="0.35"
      />
      <path
        d="M4.8 6.2c0-.9.7-1.6 1.6-1.6h4.2c.9 0 1.6.7 1.6 1.6v12.2c0 .5-.5.8-.9.6l-2.8-1.3-2.8 1.3c-.4.2-.9-.1-.9-.6V6.2z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M11.8 6.2c0-.9.7-1.6 1.6-1.6h4.2c.9 0 1.6.7 1.6 1.6v12.2c0 .5-.5.8-.9.6l-2.8-1.3-2.8 1.3c-.4.2-.9-.1-.9-.6V6.2z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M7.2 8.2h2.2M7.2 10.4h2.2M14.2 8.2h2.2M14.2 10.4h2.2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Уход — бутылочка с уходовым средством */
export function CareMenuIcon({ size = 24 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      {/* pump / cap */}
      <path
        d="M10.2 3.6h3.6c.5 0 .9.4.9.9v1.1H9.3V4.5c0-.5.4-.9.9-.9z"
        fill="currentColor"
        opacity="0.35"
      />
      <path
        d="M10.2 3.6h3.6c.5 0 .9.4.9.9v1.1H9.3V4.5c0-.5.4-.9.9-.9z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M11.1 5.6h1.8v1.4H11.1z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      {/* bottle body */}
      <path
        d="M8.2 7.2h7.6c1 0 1.8.8 1.8 1.8v9.4c0 1.3-1.1 2.4-2.4 2.4H8.8c-1.3 0-2.4-1.1-2.4-2.4V9c0-1 .8-1.8 1.8-1.8z"
        fill="currentColor"
        opacity="0.16"
      />
      <path
        d="M8.2 7.2h7.6c1 0 1.8.8 1.8 1.8v9.4c0 1.3-1.1 2.4-2.4 2.4H8.8c-1.3 0-2.4-1.1-2.4-2.4V9c0-1 .8-1.8 1.8-1.8z"
        stroke="currentColor"
        strokeWidth="1.55"
        strokeLinejoin="round"
      />
      {/* label */}
      <rect
        x="8.6"
        y="10.2"
        width="6.8"
        height="5.2"
        rx="1.2"
        fill="currentColor"
        opacity="0.22"
      />
      <path
        d="M10.2 12h3.6M10.2 13.8h2.4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      {/* drop on label */}
      <path
        d="M14.6 11.2c.7.8 1.2 1.4 1.2 2 0 .7-.5 1.2-1.2 1.2s-1.2-.5-1.2-1.2c0-.6.5-1.2 1.2-2z"
        fill="currentColor"
      />
    </svg>
  )
}

/** Профиль — мягкий заполненный аватар */
export function ProfileMenuIcon({ size = 24 }: IconProps) {
  return (
    <svg {...svgProps(size)}>
      <circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.14" />
      <circle cx="12" cy="9" r="3.8" fill="currentColor" opacity="0.35" />
      <circle cx="12" cy="9" r="3.4" stroke="currentColor" strokeWidth="1.55" />
      <path
        d="M5.4 19.2c1.2-3.5 3.6-5.2 6.6-5.2s5.4 1.7 6.6 5.2"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
      />
      <path
        d="M5.8 19.4c1.3-2.8 3.4-4.1 6.2-4.1s4.9 1.3 6.2 4.1"
        fill="currentColor"
        opacity="0.28"
      />
      <path
        d="M8.2 6.8c.7-1.3 2-2.1 3.8-2.1 1.6 0 2.8.7 3.5 1.7"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinecap="round"
        opacity="0.65"
      />
    </svg>
  )
}
