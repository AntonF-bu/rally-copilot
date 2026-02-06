// Filter pills for Discover tab
// "What are you looking for?" and "Where?" sections
// Tramo Brand Design

export function DiscoverFilters({
  vibeFilters,
  regionFilters,
  selectedVibes,
  selectedRegions,
  onVibeToggle,
  onRegionToggle
}) {
  const chipStyle = (isSelected) => ({
    background: isSelected ? '#E8622C' : '#1A1A1A',
    color: isSelected ? '#FFFFFF' : '#9CA3AF',
    border: isSelected ? '1px solid #E8622C' : '1px solid #333333',
    fontFamily: "'DM Sans', sans-serif",
    transition: 'all 0.15s ease',
  })

  return (
    <div className="px-4 py-4">
      {/* What are you looking for? */}
      <div className="mb-4">
        <p
          className="text-sm mb-2"
          style={{ color: '#888888', fontFamily: "'DM Sans', sans-serif" }}
        >
          What are you looking for?
        </p>
        <div className="flex flex-wrap gap-2">
          {vibeFilters.map((filter) => {
            const isSelected = selectedVibes.includes(filter.id)
            return (
              <button
                key={filter.id}
                onClick={() => onVibeToggle(filter.id)}
                className="px-3 py-1.5 rounded-full text-sm"
                style={chipStyle(isSelected)}
              >
                {filter.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Where? */}
      <div>
        <p
          className="text-sm mb-2"
          style={{ color: '#888888', fontFamily: "'DM Sans', sans-serif" }}
        >
          Where?
        </p>
        <div className="flex flex-wrap gap-2">
          {regionFilters.map((filter) => {
            const isSelected = selectedRegions.includes(filter.id)
            return (
              <button
                key={filter.id}
                onClick={() => onRegionToggle(filter.id)}
                className="px-3 py-1.5 rounded-full text-sm"
                style={chipStyle(isSelected)}
              >
                {filter.label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
