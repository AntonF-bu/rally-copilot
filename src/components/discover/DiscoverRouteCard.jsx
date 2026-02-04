// Route card for Discover tab
// Shows map preview, route info, tags, and save button

export function DiscoverRouteCard({ route, isSaved, onSave, onSelect }) {
  // Generate Mapbox Static Image URL
  const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN
  const startCoord = `${route.start.lng},${route.start.lat}`
  const endCoord = `${route.end.lng},${route.end.lat}`

  // Markers for start (A) and end (B) points
  const markers = `pin-s-a+00d4ff(${startCoord}),pin-s-b+ff9500(${endCoord})`

  // Center between the two points
  const centerLng = (route.start.lng + route.end.lng) / 2
  const centerLat = (route.start.lat + route.end.lat) / 2

  const staticMapUrl = mapboxToken
    ? `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/${markers}/${centerLng},${centerLat},11,0/400x180@2x?access_token=${mapboxToken}`
    : null

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
        className="w-full h-36 bg-cover bg-center relative"
        style={{
          backgroundImage: staticMapUrl ? `url(${staticMapUrl})` : 'none',
          backgroundColor: 'rgba(255,255,255,0.05)',
        }}
      >
        {!staticMapUrl && (
          <div className="absolute inset-0 flex items-center justify-center">
            {/* Map icon placeholder */}
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="rgba(255,255,255,0.2)"
              strokeWidth="1.5"
            >
              <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
              <line x1="8" y1="2" x2="8" y2="18" />
              <line x1="16" y1="6" x2="16" y2="22" />
            </svg>
          </div>
        )}
      </button>

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
            className="flex items-center gap-1.5 px-4 py-2 rounded-full transition-all"
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
          </button>
        </div>
      </div>
    </div>
  )
}
