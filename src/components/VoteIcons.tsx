type IconProps = { size?: number }

export function LikeIcon({ size = 18 }: IconProps) {
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
        d="M7 11v10H4.5A1.5 1.5 0 0 1 3 19.5v-7A1.5 1.5 0 0 1 4.5 11H7zm0 0 3.2-6.4A2 2 0 0 1 12 3.5h.3a1.7 1.7 0 0 1 1.7 2v4h4.6a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.4 21H7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function DislikeIcon({ size = 18 }: IconProps) {
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
        d="M17 13V3h2.5A1.5 1.5 0 0 1 21 4.5v7a1.5 1.5 0 0 1-1.5 1.5H17zm0 0-3.2 6.4A2 2 0 0 1 12 20.5h-.3a1.7 1.7 0 0 1-1.7-2v-4H5.4a2 2 0 0 1-2-2.3l1.2-7A2 2 0 0 1 6.6 3H17"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  )
}
