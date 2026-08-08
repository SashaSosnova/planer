type NavIconName = 'diary' | 'history' | 'care' | 'measures' | 'library' | 'profile'

const SRC: Record<NavIconName, string> = {
  diary: '/icons/nav-diary.png',
  history: '/icons/nav-history.png',
  care: '/icons/nav-care.png',
  measures: '/icons/nav-measures.png',
  library: '/icons/nav-library.png',
  profile: '/icons/nav-profile.png',
}

type Props = {
  name: NavIconName
  label: string
}

/** Soft 3D generated icon for the Today top nav */
export function NavGlyph({ name, label }: Props) {
  return (
    <img
      className="today-nav-glyph"
      src={SRC[name]}
      alt=""
      width={44}
      height={44}
      draggable={false}
      aria-hidden
      title={label}
    />
  )
}
