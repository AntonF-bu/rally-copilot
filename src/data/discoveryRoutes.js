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
    distance: 5,
    duration: 15,
    difficulty: 'moderate',
    tags: ['technical', 'twisty', 'quick', 'backroads'],
    description: 'Quick technical fix close to Boston. Forest roads, quiet residential.',
    claimedBy: null,
  },
  {
    id: 'storrow-sweep',
    name: 'Storrow Drive Sweep',
    region: 'boston-area',
    start: {
      lat: 42.3601,
      lng: -71.0589,
      label: 'Boston'
    },
    end: {
      lat: 42.3521,
      lng: -71.1311,
      label: 'Allston'
    },
    distance: 4,
    duration: 10,
    difficulty: 'easy',
    tags: ['scenic', 'quick', 'night'],
    description: 'City highway along the Charles River. Great night views of Boston skyline.',
    claimedBy: null,
  },
  {
    id: 'route-2-concord',
    name: 'Route 2 to Concord',
    region: 'boston-area',
    start: {
      lat: 42.3954,
      lng: -71.1426,
      label: 'Cambridge'
    },
    end: {
      lat: 42.4604,
      lng: -71.3489,
      label: 'Concord'
    },
    distance: 15,
    duration: 25,
    difficulty: 'easy',
    tags: ['scenic', 'chill', 'backroads'],
    description: 'Historic route through colonial towns. Gentle curves, tree-lined highway.',
    claimedBy: null,
  },
  {
    id: 'north-shore-coastal',
    name: 'North Shore Coastal Run',
    region: 'north-shore',
    start: {
      lat: 42.5195,
      lng: -70.8967,
      label: 'Salem'
    },
    end: {
      lat: 42.6526,
      lng: -70.6323,
      label: 'Rockport'
    },
    distance: 22,
    duration: 40,
    difficulty: 'moderate',
    tags: ['scenic', 'backroads', 'twisty'],
    description: 'Coastal route with ocean views. Mix of village roads and seaside curves.',
    claimedBy: null,
  },
  {
    id: 'blue-hills-loop',
    name: 'Blue Hills Reservation Loop',
    region: 'south-shore',
    start: {
      lat: 42.2134,
      lng: -71.1167,
      label: 'Milton'
    },
    end: {
      lat: 42.2134,
      lng: -71.1167,
      label: 'Milton'
    },
    distance: 12,
    duration: 30,
    difficulty: 'moderate',
    tags: ['technical', 'scenic', 'backroads'],
    description: 'Loop through Blue Hills Reservation. Elevation changes, tight switchbacks.',
    claimedBy: null,
  },
  {
    id: 'berkshires-run',
    name: 'Berkshires Mountain Run',
    region: 'western-ma',
    start: {
      lat: 42.4514,
      lng: -73.2509,
      label: 'Pittsfield'
    },
    end: {
      lat: 42.7070,
      lng: -73.1710,
      label: 'Williamstown'
    },
    distance: 25,
    duration: 45,
    difficulty: 'hard',
    tags: ['technical', 'scenic', 'twisty', 'backroads'],
    description: 'Mountain roads through the Berkshires. Serious elevation, tight curves.',
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
