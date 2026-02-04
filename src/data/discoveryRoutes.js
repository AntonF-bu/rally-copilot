// Seeded discovery routes for the Discover tab
// These are curated routes users can browse and save

export const DISCOVERY_ROUTES = [
  {
    id: 'tower-road-technical',
    name: 'Tower Road Technical',
    region: 'boston-area',
    start: {
      lat: 42.366919,
      lng: -71.304276,
      label: 'Weston'
    },
    end: {
      lat: 42.425628,
      lng: -71.304242,
      label: 'Lincoln'
    },
    // Waypoints to force specific routing through Tower Road
    waypoints: [],
    // Pre-computed route geometry (fetched on save if not present)
    geometry: null,
    distance: 5,
    duration: 15,
    difficulty: 'moderate',
    tags: ['technical', 'twisty', 'quick', 'backroads'],
    description: 'Quick technical fix close to Boston. Forest roads, quiet residential.',
    claimedBy: null,
  },
]

export const VIBE_FILTERS = [
  { id: 'technical', label: 'Technical' },
  { id: 'scenic', label: 'Scenic' },
  { id: 'chill', label: 'Chill' },
  { id: 'quick', label: 'Quick' },
  { id: 'backroads', label: 'Backroads' },
  { id: 'night', label: 'Night' },
  { id: 'twisty', label: 'Twisty' },
]

export const REGION_FILTERS = [
  { id: 'boston-area', label: 'Boston Area' },
  { id: 'north-shore', label: 'North Shore' },
  { id: 'south-shore', label: 'South Shore' },
  { id: 'western-ma', label: 'Western MA' },
]
