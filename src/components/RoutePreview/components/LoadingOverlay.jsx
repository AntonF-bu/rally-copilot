import React from 'react'

/**
 * Loading overlay with spinner
 * Shown while map is loading
 * Tramo Brand Design
 */
export function LoadingOverlay({
  isVisible,
  color = '#E8622C'
}) {
  if (!isVisible) return null

  return (
    <div className="absolute inset-0 flex items-center justify-center z-40" style={{ background: '#0A0A0A' }}>
      <div
        className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin"
        style={{ borderColor: `${color} transparent transparent transparent` }}
      />
    </div>
  )
}

export default LoadingOverlay
