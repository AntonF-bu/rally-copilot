// Filter pills for Discover tab
// "What are you looking for?" and "Where?" sections

export function DiscoverFilters({
  vibeFilters,
  regionFilters,
  selectedVibes,
  selectedRegions,
  onVibeToggle,
  onRegionToggle
}) {
  return (
    <div className="px-4 py-4">
      {/* What are you looking for? */}
      <div className="mb-4">
        <p
          className="text-sm mb-2"
          style={{ color: 'rgba(255,255,255,0.5)' }}
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
                className="px-3 py-1.5 rounded-full text-sm transition-all"
                style={{
                  background: isSelected
                    ? 'rgba(0, 212, 255, 0.2)'
                    : 'rgba(255, 255, 255, 0.05)',
                  border: isSelected
                    ? '1px solid rgba(0, 212, 255, 0.5)'
                    : '1px solid rgba(255, 255, 255, 0.1)',
                  color: isSelected
                    ? '#00d4ff'
                    : 'rgba(255, 255, 255, 0.7)',
                }}
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
          style={{ color: 'rgba(255,255,255,0.5)' }}
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
                className="px-3 py-1.5 rounded-full text-sm transition-all"
                style={{
                  background: isSelected
                    ? 'rgba(0, 212, 255, 0.2)'
                    : 'rgba(255, 255, 255, 0.05)',
                  border: isSelected
                    ? '1px solid rgba(0, 212, 255, 0.5)'
                    : '1px solid rgba(255, 255, 255, 0.1)',
                  color: isSelected
                    ? '#00d4ff'
                    : 'rgba(255, 255, 255, 0.7)',
                }}
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
