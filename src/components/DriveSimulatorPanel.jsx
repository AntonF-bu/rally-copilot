import React, { useState, useEffect, useCallback, useRef } from 'react'
import useStore from '../store'

/**
 * DriveSimulatorPanel
 * Floating control panel for drive simulation playback
 * Shows play/pause, speed selection, progress, and stats
 */
export default function DriveSimulatorPanel({ simulator, onStop }) {
  const [progress, setProgress] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const progressBarRef = useRef(null)
  const settings = useStore(state => state.settings)

  // Update progress display
  useEffect(() => {
    if (!simulator) return

    const updateProgress = () => {
      setProgress(simulator.getProgress())
    }

    // Initial update
    updateProgress()

    // Update every 500ms
    const interval = setInterval(updateProgress, 500)
    return () => clearInterval(interval)
  }, [simulator])

  // Handle seek on progress bar click/drag
  const handleSeek = useCallback((e) => {
    if (!simulator || !progressBarRef.current) return

    const rect = progressBarRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const percent = Math.max(0, Math.min(1, x / rect.width))
    const targetMeters = percent * (progress?.totalMeters || 0)

    simulator.seekTo(targetMeters)
  }, [simulator, progress?.totalMeters])

  const handleMouseDown = useCallback((e) => {
    setIsDragging(true)
    handleSeek(e)
  }, [handleSeek])

  const handleMouseMove = useCallback((e) => {
    if (isDragging) handleSeek(e)
  }, [isDragging, handleSeek])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  // Add/remove global mouse handlers when dragging
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.addEventListener('touchmove', handleMouseMove)
      document.addEventListener('touchend', handleMouseUp)
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('touchmove', handleMouseMove)
      document.removeEventListener('touchend', handleMouseUp)
    }
  }, [isDragging, handleMouseMove, handleMouseUp])

  // Toggle play/pause
  const handlePlayPause = useCallback(() => {
    if (!simulator) return
    if (progress?.isPaused) {
      simulator.resume()
    } else {
      simulator.pause()
    }
    setProgress(simulator.getProgress())
  }, [simulator, progress?.isPaused])

  // Change playback speed
  const handleSpeedChange = useCallback((speed) => {
    if (!simulator) return
    simulator.setSpeed(speed)
    setProgress(simulator.getProgress())
  }, [simulator])

  // Stop simulation
  const handleStop = useCallback(() => {
    if (simulator) simulator.stop()
    if (onStop) onStop()
  }, [simulator, onStop])

  if (!progress) return null

  const speedMph = Math.round(progress.currentSpeed || 0)
  const distMiles = (progress.distanceMiles || 0).toFixed(1)
  const totalMiles = (progress.totalMiles || 0).toFixed(1)
  const percent = Math.round(progress.percent || 0)

  // Zone color mapping
  const zoneColors = {
    urban: '#FBBF24',      // Yellow
    transit: '#3B82F6',    // Blue
    technical: '#E8622C',  // Orange
    unknown: '#666666'
  }
  const zoneColor = zoneColors[progress.currentZone] || zoneColors.unknown

  return (
    <div
      className="fixed left-3 right-3 z-50 pointer-events-auto"
      style={{
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)'
      }}
    >
      <div
        className="rounded-xl p-3"
        style={{
          background: 'rgba(10, 10, 10, 0.95)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.5)'
        }}
      >
        {/* Top row: Play/Pause, Speed buttons, Stop */}
        <div className="flex items-center justify-between mb-3">
          {/* Play/Pause */}
          <button
            onClick={handlePlayPause}
            className="w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-95"
            style={{
              background: progress.isPaused ? '#E8622C' : 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)'
            }}
          >
            {progress.isPaused ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                <polygon points="5 3 19 12 5 21" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            )}
          </button>

          {/* Speed selector */}
          <div className="flex items-center gap-1">
            {[1, 2, 4, 8].map(speed => (
              <button
                key={speed}
                onClick={() => handleSpeedChange(speed)}
                className="px-3 py-1.5 rounded-full text-xs font-bold transition-all"
                style={{
                  background: progress.playbackSpeed === speed
                    ? 'rgba(232, 98, 44, 0.2)'
                    : 'rgba(255, 255, 255, 0.05)',
                  color: progress.playbackSpeed === speed ? '#E8622C' : 'rgba(255, 255, 255, 0.6)',
                  border: `1px solid ${progress.playbackSpeed === speed ? 'rgba(232, 98, 44, 0.4)' : 'rgba(255, 255, 255, 0.1)'}`
                }}
              >
                {speed}x
              </button>
            ))}
          </div>

          {/* Stop button */}
          <button
            onClick={handleStop}
            className="w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-95"
            style={{
              background: 'rgba(255, 59, 59, 0.15)',
              border: '1px solid rgba(255, 59, 59, 0.3)'
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#FF3B3B">
              <rect x="4" y="4" width="16" height="16" rx="2" />
            </svg>
          </button>
        </div>

        {/* Progress bar */}
        <div
          ref={progressBarRef}
          className="h-2 rounded-full cursor-pointer mb-3 relative overflow-hidden"
          style={{ background: 'rgba(255, 255, 255, 0.1)' }}
          onMouseDown={handleMouseDown}
          onTouchStart={handleMouseDown}
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-all"
            style={{
              width: `${percent}%`,
              background: 'linear-gradient(90deg, #E8622C 0%, #F0854E 100%)'
            }}
          />
          {/* Thumb */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow-lg"
            style={{ left: `calc(${percent}% - 6px)` }}
          />
        </div>

        {/* Stats row */}
        <div className="flex items-center justify-between text-xs">
          {/* Speed */}
          <div className="flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
            <span className="font-bold text-white">{speedMph}</span>
            <span className="text-white/50">{settings.units === 'metric' ? 'km/h' : 'mph'}</span>
          </div>

          {/* Distance */}
          <div className="flex items-center gap-1">
            <span className="font-bold text-white">{distMiles}</span>
            <span className="text-white/50">/</span>
            <span className="text-white/50">{totalMiles} mi</span>
          </div>

          {/* Zone badge */}
          <div
            className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
            style={{
              background: `${zoneColor}20`,
              color: zoneColor,
              border: `1px solid ${zoneColor}40`
            }}
          >
            {progress.currentZone}
          </div>

          {/* Percent complete */}
          <div className="text-white/50">
            {percent}%
          </div>
        </div>

        {/* Simulation badge */}
        <div className="mt-2 flex items-center justify-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-[10px] text-white/40 uppercase tracking-wider font-medium">
            Simulation Active
          </span>
        </div>
      </div>
    </div>
  )
}
