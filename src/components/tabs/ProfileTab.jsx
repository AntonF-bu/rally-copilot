// Profile Tab - Logbook stats, badges, settings
// Contains content moved from landing page

export function ProfileTab({ onNavigateToSettings, logbookStats }) {
  // Default stats if not provided
  const stats = logbookStats || {
    rank: 'Road Scout',
    totalMiles: 847,
    nextRank: 'Pace Setter',
    nextRankMiles: 1000,
    routeCount: 23,
    weekMiles: 124,
    weekChange: '+18%',
  }

  const progressPercent = (stats.totalMiles / stats.nextRankMiles) * 100
  const milesRemaining = stats.nextRankMiles - stats.totalMiles

  return (
    <div className="px-4 py-6 pb-24">
      {/* Profile Header */}
      <div className="flex items-center gap-4 mb-6">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(0, 212, 255, 0.15)' }}
        >
          {/* User icon */}
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#00d4ff"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
        </div>
        <div>
          <h2 className="text-xl font-semibold text-white">Driver</h2>
          <p className="text-white/50 text-sm">{stats.rank}</p>
        </div>
      </div>

      {/* Logbook Stats Card */}
      <div
        className="p-4 rounded-2xl mb-4"
        style={{
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <div className="flex items-center gap-2 mb-3">
          {/* BookOpen icon */}
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#00d4ff"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
          </svg>
          <span className="text-white font-medium">Logbook</span>
        </div>

        {/* Progress bar */}
        <div className="mb-3">
          <div className="flex justify-between text-sm mb-1">
            <span className="text-white/70">{stats.rank}</span>
            <span className="text-white/50">{stats.totalMiles} / {stats.nextRankMiles} mi</span>
          </div>
          <div
            className="h-2 rounded-full overflow-hidden"
            style={{ background: 'rgba(255, 255, 255, 0.1)' }}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(progressPercent, 100)}%`,
                background: 'linear-gradient(90deg, #00d4ff, #00a8cc)',
              }}
            />
          </div>
          <p className="text-white/40 text-xs mt-1">{milesRemaining} mi to {stats.nextRank}</p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3">
          <div
            className="p-3 rounded-xl"
            style={{ background: 'rgba(255, 255, 255, 0.03)' }}
          >
            <p className="text-white/50 text-xs mb-1">This Week</p>
            <p className="text-white font-semibold">{stats.weekMiles} mi</p>
            {stats.weekChange && (
              <p className="text-emerald-400 text-xs">{stats.weekChange}</p>
            )}
          </div>
          <div
            className="p-3 rounded-xl"
            style={{ background: 'rgba(255, 255, 255, 0.03)' }}
          >
            <p className="text-white/50 text-xs mb-1">Total Routes</p>
            <p className="text-white font-semibold">{stats.routeCount}</p>
          </div>
        </div>
      </div>

      {/* Badges section */}
      <div
        className="p-4 rounded-2xl mb-4"
        style={{
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <div className="flex items-center gap-2 mb-3">
          {/* Award icon */}
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#00d4ff"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="8" r="7"/>
            <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>
          </svg>
          <span className="text-white font-medium">Badges</span>
        </div>

        {/* Badge items */}
        <div className="flex flex-wrap gap-2">
          <span
            className="px-3 py-1.5 rounded-lg text-xs text-white/60 flex items-center gap-1.5"
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.05)',
            }}
          >
            {/* Moon icon */}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
            Night Owl
          </span>
          <span
            className="px-3 py-1.5 rounded-lg text-xs text-white/60 flex items-center gap-1.5"
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.05)',
            }}
          >
            {/* Repeat icon */}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
            Repeat Driver
          </span>
        </div>

        <p className="text-white/30 text-xs mt-3">Complete drives to earn more badges</p>
      </div>

      {/* Settings link */}
      <button
        onClick={onNavigateToSettings}
        className="w-full p-4 rounded-2xl flex items-center justify-between transition-all duration-200 hover:bg-white/[0.05]"
        style={{
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <div className="flex items-center gap-3">
          {/* Settings icon */}
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="rgba(255, 255, 255, 0.5)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
          <span className="text-white">Settings</span>
        </div>
        {/* ChevronRight icon */}
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="rgba(255, 255, 255, 0.3)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </button>
    </div>
  )
}
