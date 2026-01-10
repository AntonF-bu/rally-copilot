import useStore from '../store'
import { getCurveColor } from '../data/routes'

// ================================
// Callout Overlay - Floating Card
// Minimal, map-focused design
// ================================

export default function CalloutOverlay() {
  const {
    isRunning,
    activeCurve,
    upcomingCurves,
    mode,
    settings,
    getRecommendedSpeed
  } = useStore()

  const curve = activeCurve || upcomingCurves[0]
  
  if (!isRunning || !curve) return null

  const recommendedSpeed = getRecommendedSpeed(curve)
  const isLeft = curve.direction === 'LEFT'
  const color = isLeft ? '#00d4ff' : '#ff6b35'
  const severityColor = getCurveColor(curve.severity)
  const distancePercent = Math.max(5, 100 - (curve.distance / 3))

  return (
    <div className="absolute top-0 left-0 right-0 p-4 safe-top z-20 pointer-events-none">
      {/* Main Callout Card */}
      <div 
        className="bg-black/80 backdrop-blur-xl rounded-2xl p-4 border border-white/10 pointer-events-auto"
        style={{ 
          boxShadow: `0 4px 30px ${color}30`
        }}
      >
        <div className="flex items-center justify-between">
          {/* Direction Arrow + Severity */}
          <div className="flex items-center gap-3">
            <div 
              className="text-4xl"
              style={{ color }}
            >
              {isLeft ? '←' : '→'}
            </div>
            <div>
              <div 
                className="text-3xl font-black"
                style={{ color: severityColor, fontFamily: 'Orbitron, system-ui' }}
              >
                {curve.severity}
              </div>
              {curve.modifier && (
                <div 
                  className="text-xs font-bold tracking-wider"
                  style={{ 
                    color: curve.modifier === 'TIGHTENS' || curve.modifier === 'HAIRPIN' 
                      ? '#ff3366' 
                      : curve.modifier === 'OPENS' 
                        ? '#00ff88' 
                        : '#ffd500'
                  }}
                >
                  {curve.modifier}
                </div>
              )}
            </div>
          </div>

          {/* Speed Recommendation */}
          <div className="text-right">
            <div 
              className="text-4xl font-black"
              style={{ color: getModeColor(mode), fontFamily: 'Orbitron, system-ui' }}
            >
              {recommendedSpeed}
            </div>
            <div className="text-xs text-gray-500">
              {settings.speedUnit.toUpperCase()}
            </div>
          </div>
        </div>

        {/* Distance Bar */}
        <div className="mt-3">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>{curve.distance}m</span>
          </div>
          <div className="h-1 bg-white/10 rounded-full overflow-hidden">
            <div 
              className="h-full rounded-full transition-all duration-200"
              style={{
                width: `${distancePercent}%`,
                background: 'linear-gradient(90deg, #00ff88, #ffd500, #ff3366)'
              }}
            />
          </div>
        </div>
      </div>

      {/* Next Curve Preview (compact) */}
      {upcomingCurves.length > 1 && (
        <div className="flex gap-2 mt-2">
          {upcomingCurves.slice(1, 3).map((next) => (
            <div 
              key={next.id}
              className="bg-black/60 backdrop-blur rounded-lg px-3 py-1.5 flex items-center gap-2 pointer-events-auto"
            >
              <span 
                className="text-sm font-bold"
                style={{ 
                  color: next.direction === 'LEFT' ? '#00d4ff' : '#ff6b35',
                  fontFamily: 'Orbitron, system-ui'
                }}
              >
                {next.direction[0]}{next.severity}
              </span>
              <span className="text-xs text-gray-400">
                {next.distance}m
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function getModeColor(mode) {
  return { cruise: '#00d4ff', fast: '#ffd500', race: '#ff3366' }[mode] || '#00d4ff'
}
