import useStore from '../store'

// ================================
// Trip Summary - Strava-style stats
// ================================

export default function TripSummary() {
  const { getTripSummary, closeTripSummary, goToMenu, mode } = useStore()
  
  const summary = getTripSummary()
  
  const modeColors = { cruise: '#00d4ff', fast: '#ffd500', race: '#ff3366' }
  const modeColor = modeColors[mode] || modeColors.cruise

  if (!summary) {
    return (
      <div className="fixed inset-0 bg-[#0a0a0f] flex items-center justify-center">
        <p className="text-white/40">No trip data</p>
      </div>
    )
  }

  const severityLabels = {
    1: 'Gentle',
    2: 'Easy', 
    3: 'Moderate',
    4: 'Tight',
    5: 'Sharp',
    6: 'Hairpin'
  }

  return (
    <div className="fixed inset-0 bg-[#0a0a0f] flex flex-col">
      {/* Header */}
      <div className="p-6 pt-12 safe-top text-center">
        <div className="text-4xl mb-2">🏁</div>
        <h1 className="text-2xl font-bold text-white">Trip Complete</h1>
        <p className="text-white/40 text-sm mt-1">Great drive!</p>
      </div>

      {/* Main Stats */}
      <div className="flex-1 px-4 overflow-auto">
        {/* Big numbers row */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <StatCard 
            value={summary.distance.toFixed(1)} 
            unit={summary.distanceUnit}
            label="Distance"
            color={modeColor}
            large
          />
          <StatCard 
            value={summary.durationFormatted} 
            unit=""
            label="Duration"
            color={modeColor}
            large
          />
        </div>

        {/* Speed stats */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <StatCard 
            value={summary.avgSpeed} 
            unit={summary.speedUnit}
            label="Avg Speed"
            color="#22c55e"
          />
          <StatCard 
            value={summary.maxSpeed} 
            unit={summary.speedUnit}
            label="Max Speed"
            color="#f97316"
          />
        </div>

        {/* Curve stats */}
        <div className="bg-white/5 rounded-2xl p-4 mb-4">
          <h3 className="text-white/40 text-xs tracking-wider mb-3">CURVES</h3>
          
          <div className="flex items-center justify-between mb-3">
            <span className="text-white/60">Completed</span>
            <span className="text-white font-bold text-lg">
              {summary.curvesCompleted} 
              <span className="text-white/40 text-sm font-normal"> / {summary.totalCurves}</span>
            </span>
          </div>

          {/* Progress bar */}
          <div className="h-2 bg-white/10 rounded-full overflow-hidden mb-3">
            <div 
              className="h-full rounded-full transition-all"
              style={{ 
                width: `${summary.totalCurves > 0 ? (summary.curvesCompleted / summary.totalCurves) * 100 : 0}%`,
                background: modeColor
              }}
            />
          </div>

          {summary.sharpestCurve && (
            <div className="flex items-center justify-between">
              <span className="text-white/60">Sharpest Curve</span>
              <div className="flex items-center gap-2">
                <span 
                  className="text-lg font-bold"
                  style={{ color: getSeverityColor(summary.sharpestCurve) }}
                >
                  {summary.sharpestCurve}
                </span>
                <span className="text-white/40 text-sm">
                  ({severityLabels[summary.sharpestCurve] || 'Unknown'})
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Fun message based on performance */}
        <div className="bg-gradient-to-r from-white/5 to-transparent rounded-2xl p-4 mb-4">
          <p className="text-white/80 text-sm">
            {getPerformanceMessage(summary)}
          </p>
        </div>
      </div>

      {/* Bottom buttons */}
      <div className="p-4 pb-8 safe-bottom space-y-2">
        <button
          onClick={closeTripSummary}
          className="w-full py-4 rounded-xl font-bold text-sm tracking-wider transition-all flex items-center justify-center gap-2"
          style={{ background: modeColor }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0"/>
            <path d="M12 8v4l2 2"/>
          </svg>
          DRIVE AGAIN
        </button>
        
        <button
          onClick={goToMenu}
          className="w-full py-3 rounded-xl font-semibold text-sm tracking-wider bg-white/10 text-white/60"
        >
          Back to Menu
        </button>
      </div>
    </div>
  )
}

// Stat card component
function StatCard({ value, unit, label, color, large }) {
  return (
    <div className="bg-white/5 rounded-xl p-4 text-center">
      <div className="flex items-baseline justify-center gap-1">
        <span 
          className={`font-bold ${large ? 'text-3xl' : 'text-2xl'}`}
          style={{ color }}
        >
          {value}
        </span>
        {unit && (
          <span className="text-white/40 text-sm">{unit}</span>
        )}
      </div>
      <div className="text-white/40 text-xs tracking-wider mt-1">{label}</div>
    </div>
  )
}

// Get color for severity
function getSeverityColor(severity) {
  if (severity <= 2) return '#22c55e'
  if (severity <= 3) return '#84cc16'
  if (severity <= 4) return '#ffd500'
  if (severity <= 5) return '#f97316'
  return '#ff3366'
}

// Generate fun message based on stats
function getPerformanceMessage(summary) {
  const { avgSpeed, maxSpeed, curvesCompleted, sharpestCurve } = summary
  
  if (curvesCompleted === 0) {
    return "That was a smooth cruise! No major curves on this route."
  }
  
  if (sharpestCurve >= 5) {
    return `You conquered ${curvesCompleted} curves including some sharp severity ${sharpestCurve} turns! Nice handling! 🔥`
  }
  
  if (maxSpeed > avgSpeed * 1.5) {
    return `Good speed management! You knew when to push it and when to hold back. ${curvesCompleted} curves tackled.`
  }
  
  if (curvesCompleted > 20) {
    return `Impressive! ${curvesCompleted} curves navigated. That's some serious winding road action! 🛣️`
  }
  
  return `Nice drive! ${curvesCompleted} curves completed with an average of ${avgSpeed} ${summary.speedUnit}.`
}
