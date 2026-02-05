// Filter pills for Discover tab
// "What are you looking for?" and "Where?" sections
// Refactored to use theme system

import { colors, fonts, chipActive, chipInactive, transitions } from '../../styles/theme'

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
          style={{ color: colors.textSecondary, fontFamily: fonts.body }}
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
                style={{
                  ...(isSelected ? chipActive : chipInactive),
                  fontFamily: fonts.body,
                  transition: transitions.snappy,
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
          style={{ color: colors.textSecondary, fontFamily: fonts.body }}
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
                style={{
                  ...(isSelected ? chipActive : chipInactive),
                  fontFamily: fonts.body,
                  transition: transitions.snappy,
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
