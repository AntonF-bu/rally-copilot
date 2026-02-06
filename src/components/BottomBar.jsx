import { useState, useRef, useCallback, useEffect } from 'react'
import useStore from '../store'

// ================================
// Bottom Bar - Navigation Controls - v4
// Tramo Brand Design
// ================================

// Tramo brand colors
const ACCENT = '#E8622C'
const ACCENT_SOFT = '#FB923C'
const BG_DEEP = '#0A0A0A'
const TEXT_SECONDARY = '#888888'
const GLASS_BORDER = '#1A1A1A'

export default function BottomBar() {
  const {
    isRunning, mode, setMode, settings, updateSettings, toggleSettings,
    goToPreview, endTrip, routeMode, gpsAccuracy,
    simulationSpeed, setSimulationSpeed, simulationPaused, toggleSimulationPaused,
    simulationProgress, setSimulationProgress, routeData
  } = useStore()

  const [isDragging, setIsDragging] = useState(false)
  const sliderRef = useRef(null)

  // Mode colors - Tramo orange for cruise
  const modeColors = { cruise: ACCENT, fast: '#ffd500', race: '#ff3366' }

  const handleStop = () => endTrip()
  const handleBack = () => goToPreview()

  // Draggable slider handlers
  const handleSliderInteraction = useCallback((clientX) => {
    if (!sliderRef.current) return
    const rect = sliderRef.current.getBoundingClientRect()
    const x = clientX - rect.left
    const progress = Math.max(0, Math.min(1, x / rect.width))
    setSimulationProgress(progress)
  }, [setSimulationProgress])

  const handleMouseDown = (e) => {
    setIsDragging(true)
    handleSliderInteraction(e.clientX)
  }

  const handleMouseMove = useCallback((e) => {
    if (!isDragging) return
    handleSliderInteraction(e.clientX)
  }, [isDragging, handleSliderInteraction])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  const handleTouchStart = (e) => {
    e.preventDefault()
    setIsDragging(true)
    handleSliderInteraction(e.touches[0].clientX)
  }

  const handleTouchMove = useCallback((e) => {
    if (!isDragging) return
    e.preventDefault()
    handleSliderInteraction(e.touches[0].clientX)
  }, [isDragging, handleSliderInteraction])

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false)
  }, [])

  // Add global listeners when dragging
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
      window.addEventListener('touchmove', handleTouchMove, { passive: false })
      window.addEventListener('touchend', handleTouchEnd)
      return () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
        window.removeEventListener('touchmove', handleTouchMove)
        window.removeEventListener('touchend', handleTouchEnd)
      }
    }
  }, [isDragging, handleMouseMove, handleMouseUp, handleTouchMove, handleTouchEnd])

  const isDemo = routeMode === 'demo'

  const speedOptions = [0.5, 1, 2, 4]
  
  // Format progress info
  const progressPercent = Math.round((simulationProgress || 0) * 100)
  const totalDistance = routeData?.distance || 0
  const currentDistance = totalDistance * (simulationProgress || 0)
  const remainingDistance = totalDistance - currentDistance
  const isMetric = settings?.units === 'metric'
  const distanceDisplay = isMetric 
    ? `${(remainingDistance / 1000).toFixed(1)}km` 
    : `${(remainingDistance / 1609.34).toFixed(1)}mi`

  return (
    <div 
      className="absolute bottom-0 left-0 right-0 z-30 safe-bottom"
      onMouseMove={isDragging ? handleMouseMove : undefined}
      onMouseUp={isDragging ? handleMouseUp : undefined}
      onMouseLeave={isDragging ? handleMouseUp : undefined}
    >
      
      {/* Demo Playback Controls with Progress Slider */}
      {isDemo && (
        <div className="px-3 mb-2">
          {/* Draggable Progress Slider */}
          <div className="mb-2">
            <div 
              ref={sliderRef}
              className="relative h-8 cursor-pointer touch-none"
              onMouseDown={handleMouseDown}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              {/* Track background */}
              <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-2 rounded-full overflow-hidden" style={{ background: GLASS_BORDER }}>
                {/* Progress fill */}
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${progressPercent}%`,
                    background: `linear-gradient(90deg, ${ACCENT}, ${ACCENT_SOFT})`,
                    transition: isDragging ? 'none' : 'width 0.3s ease-out'
                  }}
                />
              </div>

              {/* Draggable thumb */}
              <div
                className="absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white shadow-lg transition-transform"
                style={{
                  left: `calc(${progressPercent}% - 10px)`,
                  transform: `translateY(-50%) scale(${isDragging ? 1.2 : 1})`,
                  transition: isDragging ? 'transform 0.1s' : 'left 0.3s ease-out, transform 0.1s',
                  border: `2px solid ${ACCENT}`,
                }}
              />

              {/* Progress label */}
              <div
                className="absolute -top-5 text-[10px] font-bold whitespace-nowrap"
                style={{
                  left: `${progressPercent}%`,
                  transform: 'translateX(-50%)',
                  color: ACCENT,
                }}
              >
                {progressPercent}%
              </div>
            </div>
            
            {/* Distance info */}
            <div className="flex justify-between text-[10px] text-white/40 px-1">
              <span>0</span>
              <span>{distanceDisplay} remaining</span>
            </div>
          </div>

          {/* Playback controls */}
          <div className="flex justify-center">
            <div className="inline-flex items-center gap-1 bg-black/70 backdrop-blur-xl rounded-full px-2 py-1 border border-white/10">
              {/* Pause/Play */}
              <button
                onClick={toggleSimulationPaused}
                className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
              >
                {simulationPaused ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill={ACCENT}>
                    <polygon points="5 3 19 12 5 21 5 3"/>
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill={ACCENT}>
                    <rect x="6" y="4" width="4" height="16" rx="1"/>
                    <rect x="14" y="4" width="4" height="16" rx="1"/>
                  </svg>
                )}
              </button>

              {/* Speed selector */}
              <div className="flex items-center gap-0.5 px-2 border-l border-white/10">
                {speedOptions.map((spd) => (
                  <button
                    key={spd}
                    onClick={() => setSimulationSpeed(spd)}
                    className="px-2 py-1 rounded text-xs font-bold transition-all"
                    style={{
                      background: simulationSpeed === spd ? ACCENT : 'transparent',
                      color: simulationSpeed === spd ? BG_DEEP : TEXT_SECONDARY,
                    }}
                  >
                    {spd}x
                  </button>
                ))}
              </div>
              
              {/* Status */}
              <div className="px-2 border-l border-white/10">
                <span className="text-[10px] text-white/40 tracking-wider">DEMO</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Controls */}
      <div className="px-3 pb-3">
        <div className="flex items-center gap-2">
          {/* Back Button */}
          <button onClick={handleBack} className="w-12 h-12 rounded-xl bg-black/60 backdrop-blur-xl border border-white/10 flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M19 12H5m0 0l7 7m-7-7l7-7"/></svg>
          </button>

          {/* Stop Button */}
          <button onClick={handleStop} className="flex-1 h-12 rounded-xl bg-red-500/80 backdrop-blur-xl flex items-center justify-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
            <span className="text-white font-bold text-sm tracking-wider">STOP</span>
          </button>

          {/* Voice Toggle */}
          <button onClick={() => updateSettings({ voiceEnabled: !settings.voiceEnabled })}
            className="w-12 h-12 rounded-xl backdrop-blur-xl border flex items-center justify-center transition-all"
            style={{ background: settings.voiceEnabled ? 'rgba(232,98,44,0.15)' : 'rgba(0,0,0,0.6)', borderColor: settings.voiceEnabled ? ACCENT + '80' : 'rgba(255,255,255,0.1)' }}>
            {settings.voiceEnabled
              ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
              : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={TEXT_SECONDARY} strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>}
          </button>

          {/* Settings Button */}
          <button onClick={toggleSettings} className="w-12 h-12 rounded-xl bg-black/60 backdrop-blur-xl border border-white/10 flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </button>
        </div>
      </div>

      {/* Status Bar */}
      <div className="px-3 pb-2">
        <div className="flex items-center justify-between text-[10px]">
          <div className="flex items-center gap-2">
            {isDemo ? (
              <>
                <div className="w-2 h-2 rounded-full bg-purple-500" />
                <span className="text-white/50">DEMO</span>
                <span className="text-white/30">{simulationPaused ? 'PAUSED' : `${simulationSpeed}x`}</span>
              </>
            ) : (
              <>
                <div className={`w-2 h-2 rounded-full ${gpsAccuracy && gpsAccuracy < 20 ? 'bg-green-500' : gpsAccuracy && gpsAccuracy < 50 ? 'bg-yellow-500' : 'bg-red-500'}`} />
                <span className="text-white/50">GPS</span>
                {gpsAccuracy && <span className="text-white/30">±{Math.round(gpsAccuracy)}m</span>}
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-white/50">
              {routeMode === 'demo' ? 'DEMO' : routeMode === 'lookahead' ? 'LOOK-AHEAD' : 'NAVIGATING'}
            </span>
          </div>
        </div>
      </div>

      <style>{`.safe-bottom { padding-bottom: env(safe-area-inset-bottom, 0px); }`}</style>
    </div>
  )
}
