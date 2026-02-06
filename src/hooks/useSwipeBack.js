import { useEffect, useRef } from 'react'

/**
 * Detects right-swipe from the left edge of the screen and calls onBack
 * Mimics iOS native back swipe behavior
 */
export function useSwipeBack(onBack, options = {}) {
  const {
    edgeWidth = 30,      // px from left edge to start swipe
    threshold = 80,      // min px distance to trigger
    enabled = true
  } = options

  const touchStartRef = useRef(null)

  useEffect(() => {
    if (!enabled || !onBack) return

    const handleTouchStart = (e) => {
      const touch = e.touches[0]
      // Only trigger from left edge
      if (touch.clientX <= edgeWidth) {
        touchStartRef.current = {
          x: touch.clientX,
          y: touch.clientY,
          time: Date.now()
        }
      }
    }

    const handleTouchEnd = (e) => {
      if (!touchStartRef.current) return

      const touch = e.changedTouches[0]
      const dx = touch.clientX - touchStartRef.current.x
      const dy = Math.abs(touch.clientY - touchStartRef.current.y)
      const dt = Date.now() - touchStartRef.current.time

      touchStartRef.current = null

      // Swipe right, mostly horizontal, within reasonable time
      if (dx > threshold && dy < dx * 0.5 && dt < 500) {
        onBack()
      }
    }

    const handleTouchMove = (e) => {
      // Cancel if swiping vertically
      if (!touchStartRef.current) return
      const touch = e.touches[0]
      const dy = Math.abs(touch.clientY - touchStartRef.current.y)
      const dx = touch.clientX - touchStartRef.current.x
      if (dy > dx) {
        touchStartRef.current = null
      }
    }

    document.addEventListener('touchstart', handleTouchStart, { passive: true })
    document.addEventListener('touchmove', handleTouchMove, { passive: true })
    document.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      document.removeEventListener('touchstart', handleTouchStart)
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', handleTouchEnd)
    }
  }, [onBack, edgeWidth, threshold, enabled])
}
