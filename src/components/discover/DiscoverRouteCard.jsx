// Route card for Discover tab
// Shows map preview, route info, tags, and save button

export function DiscoverRouteCard({ route, isSaved, isSaving, onSave, onSelect }) {
  // Generate Mapbox Static Image URL
  const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN
  const hasValidToken = mapboxToken && mapboxToken.length > 10

  // Build static map URL if token exists
  let staticMapUrl = null
  if (hasValidToken) {
    const startCoord = `${route.start.lng},${route.start.lat}`
    const endCoord = `${route.end.lng},${route.end.lat}`
    const markers = `pin-s-a+00d4ff(${startCoord}),pin-s-b+ff9500(${endCoord})`
    const centerLng = (route.start.lng + route.end.lng) / 2
    const centerLat = (route.start.lat + route.end.lat) / 2
    staticMapUrl = `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/${markers}/${centerLng},${centerLat},11,0/400x180@2x?access_token=${mapboxToken}`
  }

  // DEBUG: Log token and URL status (remove after debugging)
  console.log('=== Map Debug ===')
  console.log('Token available:', !!mapboxToken)
  console.log('Token length:', mapboxToken?.length || 0)
  console.log('Has valid token:', hasValidToken)
  console.log('Static URL:', staticMapUrl)

  // Gradient fallback when no map preview available
  const gradientFallback = 'linear-gradient(135deg, rgba(0,212,255,0.15) 0%, rgba(15,26,46,0.9) 50%, rgba(10,10,20,1) 100%)'

  const difficultyColors = {
    easy: { bg: 'rgba(0, 255, 136, 0.15)', text: '#00ff88' },
    moderate: { bg: 'rgba(255, 170, 0, 0.15)', text: '#ffaa00' },
    hard: { bg: 'rgba(255, 68, 68, 0.15)', text: '#ff4444' },
  }

  const diffColor = difficultyColors[route.difficulty] || difficultyColors.moderate

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
      }}
    >
      {/* Map Preview */}
      <button
        onClick={() => onSelect?.(route)}
        className="w-full h-36 bg-cover bg-center relative overflow-hidden"
        style={{
          backgroundImage: staticMapUrl ? `url(${staticMapUrl})` : gradientFallback,
          backgroundColor: '#0a0a1a',
        }}
      >
        {/* Overlay gradient for text readability */}
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(to bottom, transparent 50%, rgba(10,10,15,0.8) 100%)'
          }}
        />

        {/* Route line indicator when no map */}
        {!staticMapUrl && (
          <div className="absolute inset-0 flex items-center justify-center">
            {/* Stylized route indicator */}
            <div className="flex items-center gap-3">
              {/* Start dot */}
              <div className="w-3 h-3 rounded-full bg-cyan-400 shadow-lg shadow-cyan-400/50" />
              {/* Dashed line */}
              <div
                className="w-20 h-0.5"
                style={{
                  background: 'repeating-linear-gradient(90deg, rgba(0,212,255,0.5) 0px, rgba(0,212,255,0.5) 8px, transparent 8px, transparent 12px)'
                }}
              />
              {/* End dot */}
              <div className="w-3 h-3 rounded-full bg-orange-400 shadow-lg shadow-orange-400/50" />
            </div>
          </div>
        )}
      </button>

      {/* DEBUG: Visible debug info (remove after debugging) */}
      <div className="p-2 bg-red-900/50 text-[10px] text-red-300 break-all">
        Token: {mapboxToken ? `YES (${mapboxToken.length} chars)` : 'NO'} |
        URL: {staticMapUrl ? staticMapUrl.substring(0, 60) + '...' : 'none'}
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Title + Location */}
        <h3 className="text-white font-semibold text-lg mb-1">
          {route.name}
        </h3>
        <div
          className="flex items-center gap-1 text-sm mb-3"
          style={{ color: 'rgba(255,255,255,0.5)' }}
        >
          {/* MapPin icon */}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <span>
            {route.start.label} → {route.end.label}
          </span>
          <span className="mx-1">·</span>
          <span>{route.distance} mi</span>
          <span className="mx-1">·</span>
          <span>{route.duration} min</span>
        </div>

        {/* Description */}
        {route.description && (
          <p
            className="text-sm mb-3 line-clamp-2"
            style={{ color: 'rgba(255,255,255,0.4)' }}
          >
            {route.description}
          </p>
        )}

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {route.tags.map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 rounded-full text-xs capitalize"
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                color: 'rgba(255, 255, 255, 0.7)',
              }}
            >
              {tag}
            </span>
          ))}
          <span
            className="px-2 py-0.5 rounded-full text-xs capitalize"
            style={{
              background: diffColor.bg,
              color: diffColor.text,
            }}
          >
            {route.difficulty}
          </span>
        </div>

        {/* Bottom Row: Claim teaser + Save button */}
        <div className="flex items-center justify-between">
          {/* Claim Teaser */}
          <div
            className="flex items-center gap-1.5 text-sm"
            style={{ color: 'rgba(255,255,255,0.3)' }}
          >
            {/* Lock icon */}
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span>{route.claimedBy || 'Unclaimed'}</span>
          </div>

          {/* Save Button */}
          <button
            onClick={() => onSave(route)}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full transition-all disabled:opacity-70"
            style={{
              background: isSaved
                ? 'rgba(0, 212, 255, 0.2)'
                : 'rgba(255, 255, 255, 0.08)',
              border: isSaved
                ? '1px solid rgba(0, 212, 255, 0.5)'
                : '1px solid rgba(255, 255, 255, 0.1)',
              color: isSaved ? '#00d4ff' : 'rgba(255,255,255,0.8)',
            }}
          >
            {isSaving ? (
              <>
                {/* Spinner */}
                <div
                  className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"
                />
                <span className="text-sm">Saving...</span>
              </>
            ) : (
              <>
                {/* Heart icon */}
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill={isSaved ? '#00d4ff' : 'none'}
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
                <span className="text-sm">
                  {isSaved ? 'Saved' : 'Save'}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
