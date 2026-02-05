import React from 'react'
import { colors } from '../../../styles/theme'

/**
 * Loading overlay with spinner
 * Shown while map is loading
 * Refactored to use theme system
 */
export function LoadingOverlay({
  isVisible,
  color = colors.accent
}) {
  if (!isVisible) return null

  return (
    <div className="absolute inset-0 flex items-center justify-center z-40" style={{ background: colors.bgDeep }}>
      <div
        className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin"
        style={{ borderColor: `${color} transparent transparent transparent` }}
      />
    </div>
  )
}

export default LoadingOverlay
