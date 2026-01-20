import React from 'react'

/**
 * Loading overlay with spinner
 * Shown while map is loading
 */
export function LoadingOverlay({
  isVisible,
  color = '#00d4ff'
}) {
  if (!isVisible) return null

  return (
    <div className="absolute inset-0 bg-[#0a0a0f] flex items-center justify-center z-40">
      <div
        className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin"
        style={{ borderColor: `${color} transparent transparent transparent` }}
      />
    </div>
  )
}

export default LoadingOverlay
