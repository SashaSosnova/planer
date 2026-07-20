import { useEffect, type RefObject } from 'react'

const EDGE_PX = 32
const MIN_DX = 70
const MAX_DY_RATIO = 0.75

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  const el = target.closest('input, textarea, select, [contenteditable="true"]')
  return el != null
}

/**
 * Edge swipe right → onBack. Disabled for editable fields / vertical scrolls.
 */
export function useSwipeBack(
  enabled: boolean,
  onBack: () => void,
  rootRef?: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!enabled) return
    const root = rootRef?.current ?? document
    let startX = 0
    let startY = 0
    let tracking = false

    const onStart = (e: Event) => {
      const te = e as TouchEvent
      if (te.touches.length !== 1) return
      if (isEditableTarget(te.target)) return
      const t = te.touches[0]!
      if (t.clientX > EDGE_PX) return
      startX = t.clientX
      startY = t.clientY
      tracking = true
    }

    const onMove = (e: Event) => {
      if (!tracking) return
      const te = e as TouchEvent
      const t = te.touches[0]
      if (!t) return
      const dx = t.clientX - startX
      const dy = Math.abs(t.clientY - startY)
      // Lock out once clearly vertical
      if (dy > 24 && dy > Math.abs(dx) * MAX_DY_RATIO) {
        tracking = false
      }
    }

    const onEnd = (e: Event) => {
      if (!tracking) return
      tracking = false
      const te = e as TouchEvent
      const t = te.changedTouches[0]
      if (!t) return
      const dx = t.clientX - startX
      const dy = Math.abs(t.clientY - startY)
      if (dx >= MIN_DX && dy < dx * MAX_DY_RATIO) {
        onBack()
      }
    }

    const onCancel = () => {
      tracking = false
    }

    root.addEventListener('touchstart', onStart, { passive: true })
    root.addEventListener('touchmove', onMove, { passive: true })
    root.addEventListener('touchend', onEnd, { passive: true })
    root.addEventListener('touchcancel', onCancel, { passive: true })
    return () => {
      root.removeEventListener('touchstart', onStart)
      root.removeEventListener('touchmove', onMove)
      root.removeEventListener('touchend', onEnd)
      root.removeEventListener('touchcancel', onCancel)
    }
  }, [enabled, onBack, rootRef])
}
