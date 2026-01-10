import useStore from '../store'
import { getCurveColor } from '../data/routes'

// ================================
// Callout Overlay - Premium Minimal Design
// ================================

export default function CalloutOverlay() {
  const { isRunning, activeCurve, upcomingCurves, mode, settings, getRecommendedSpeed } = useStore()

  const curve = activeCurve || upcomingCurves[0]
  if (!isRunning || !curve) return null

  const recommendedSpeed = getRecommendedSpeed(curve)
  const isLeft = curve.direction === 'LEFT'
  const severityColor = getCurveColor(curve.severity)
  const modeColors = { cruise: '#00d4ff', fast: '#ffd500', race: '#ff3366' }
  
  // Progress calculation (inverse - fills as you get closer)
  const maxDistance = 400
  const progress = Math.min(100, Math.max(0, ((maxDistance - curve.distance) / maxDistance) * 100))

  return (
    <div className="absolute top-0 left-0 right-0 p-4 safe-top z-20 pointer-events-none">
      {/* Main Card */}
      <div className="bg-black/80 backdrop-blur-md rounded-xl overflow-hidden border border-white/[0.06]">
        {/* Content */}
        <div className="px-4 py-3 flex items-center justify-between">
          {/* Left: Direction + Severity */}
          <div className="flex items-center gap-3">
            {/* Direction indicator */}
            <div 
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ background: `${severityColor}15`, border: `1.5px solid ${severityColor}40` }}
            >
              <svg 
                width="22" 
                height="22" 
                viewBox="0 0 24 24" 
                fill={severityColor}
                style={{ transform: isLeft ? 'scaleX(-1)' : 'none' }}
              >
                <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/>
              </svg>
            </div>
            
            {/* Severity */}
            <div>
              <div 
                className="text-3xl font-semibold tracking-tight"
                style={{ fontFamily: '-apple-system, system-ui', color: severityColor }}
              >
                {curve.severity}
              </div>
              {curve.modifier && (
                <div 
                  className="text-[10px] font-semibold tracking-wide"
                  style={{ color: severityColor }}
                >
                  {curve.modifier}
                </div>
              )}
            </div>
          </div>

          {/* Center: Distance */}
          <div className="text-center">
            <div className="text-2xl font-medium text-white/90" style={{ fontFamily: '-apple-system, system-ui' }}>
              {curve.distance}
            </div>
            <div className="text-[9px] text-white/30 font-medium tracking-widest">METERS</div>
          </div>

          {/* Right: Speed */}
          <div className="text-right">
            <div 
              className="text-3xl font-semibold tracking-tight"
              style={{ fontFamily: '-apple-system, system-ui', color: modeColors[mode] }}
            >
              {recommendedSpeed}
            </div>
            <div className="text-[9px] text-white/30 font-medium tracking-widest">
              {settings.speedUnit.toUpperCase()}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-[3px] bg-white/[0.06]">
          <div 
            className="h-full transition-all duration-150 ease-out"
            style={{ 
              width: `${progress}%`,
              background: `linear-gradient(90deg, ${severityColor}60, ${severityColor})`
            }}
          />
        </div>
      </div>

      {/* Upcoming curves - minimal pills */}
      {upcomingCurves.length > 1 && (
        <div className="flex gap-2 mt-2 justify-center">
          {upcomingCurves.slice(1, 4).map((next) => {
            const nextColor = getCurveColor(next.severity)
            const nextIsLeft = next.direction === 'LEFT'
            return (
              <div 
                key={next.id}
                className="flex items-center gap-1.5 bg-black/60 backdrop-blur-sm px-2.5 py-1.5 rounded-md border border-white/[0.06]"
              >
                <svg 
                  width="10" 
                  height="10" 
                  viewBox="0 0 24 24" 
                  fill={nextColor}
                  style={{ transform: nextIsLeft ? 'scaleX(-1)' : 'none' }}
                >
                  <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/>
                </svg>
                <span 
                  className="text-xs font-semibold"
                  style={{ fontFamily: '-apple-system, system-ui', color: nextColor }}
                >
                  {next.severity}
                </span>
                <span className="text-[10px] text-white/30">{next.distance}m</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
