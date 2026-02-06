// Curated discovery routes for the Discover tab
// 10 premium New England driving routes with real coordinates
// These are the best roads in the region - scenic, technical, memorable

export const DISCOVERY_ROUTES = [
  {
    id: 'kancamagus-mountain-run',
    name: 'Kancamagus Mountain Run',
    region: 'new-hampshire',
    start: { lat: 43.9944, lng: -71.6839, label: 'Lincoln' },
    end: { lat: 44.0547, lng: -71.1275, label: 'Conway' },
    waypoints: [
      { lat: 44.0311, lng: -71.4842 },
      { lat: 44.0453, lng: -71.2891 }
    ],
    distance: 34.5,
    duration: 55,
    difficulty: 'hard',
    tags: ['mountain', 'scenic', 'technical', 'twisty', 'elevation'],
    description: 'The crown jewel of New England driving. Route 112 climbs through the White Mountain National Forest with sweeping switchbacks, dramatic elevation changes, and zero commercial development. Best driven at sunrise when morning mist fills the valleys.',
    curveCount: 147,
    elevationGain: 2860,
  },
  {
    id: 'smugglers-notch-ascent',
    name: "Smugglers' Notch Ascent",
    region: 'vermont',
    start: { lat: 44.5236, lng: -72.7815, label: 'Stowe' },
    end: { lat: 44.6342, lng: -72.7923, label: 'Jeffersonville' },
    waypoints: [
      { lat: 44.5589, lng: -72.7934 }
    ],
    distance: 12,
    duration: 25,
    difficulty: 'expert',
    tags: ['mountain', 'technical', 'hairpins', 'scenic', 'challenging'],
    description: 'Vermont\'s most dramatic road. Tight hairpins carved through a narrow mountain pass with 1000-foot cliffs on both sides. The road is so tight that trucks are banned. Not for the faint of heart - pure driving focus required.',
    curveCount: 89,
    elevationGain: 1820,
  },
  {
    id: 'bear-notch-roller-coaster',
    name: 'Bear Notch Roller Coaster',
    region: 'new-hampshire',
    start: { lat: 44.0547, lng: -71.1275, label: 'Conway' },
    end: { lat: 44.0892, lng: -71.3156, label: 'Bartlett' },
    waypoints: [
      { lat: 44.0789, lng: -71.2234 }
    ],
    distance: 14,
    duration: 22,
    difficulty: 'moderate',
    tags: ['mountain', 'scenic', 'twisty', 'forest', 'quick'],
    description: 'A hidden gem connecting Conway to the Kanc. Smooth pavement, constant elevation changes, and zero traffic. The road rises and falls like a roller coaster through pristine forest. Perfect warmup before tackling the Kancamagus.',
    curveCount: 62,
    elevationGain: 1240,
  },
  {
    id: 'route-100-green-mountain-spine',
    name: 'Route 100 Green Mountain Spine',
    region: 'vermont',
    start: { lat: 43.6234, lng: -72.7178, label: 'Killington' },
    end: { lat: 44.3062, lng: -72.6912, label: 'Waterbury' },
    waypoints: [
      { lat: 43.8756, lng: -72.7234 },
      { lat: 44.1523, lng: -72.7089 }
    ],
    distance: 52,
    duration: 75,
    difficulty: 'moderate',
    tags: ['scenic', 'mountain', 'chill', 'backroads', 'long'],
    description: 'The backbone of Vermont driving. Route 100 threads through the heart of the Green Mountains, past ski resorts, covered bridges, and classic New England villages. Long sweeping curves, consistent rhythm, stunning fall foliage.',
    curveCount: 198,
    elevationGain: 3200,
  },
  {
    id: 'mohawk-trail-hairpin-run',
    name: 'Mohawk Trail Hairpin Run',
    region: 'western-ma',
    start: { lat: 42.5876, lng: -72.5990, label: 'Greenfield' },
    end: { lat: 42.7009, lng: -73.1110, label: 'North Adams' },
    waypoints: [
      { lat: 42.6336, lng: -72.7785 },
      { lat: 42.6758, lng: -72.9875 }
    ],
    distance: 41,
    duration: 55,
    difficulty: 'hard',
    tags: ['mountain', 'technical', 'hairpins', 'scenic', 'historic'],
    description: 'America\'s first scenic highway, and still one of the best. The famous Hairpin Turn offers a 180-degree switchback with panoramic views. Route 2 climbs the Hoosac Range with relentless technical sections and big elevation swings.',
    curveCount: 134,
    elevationGain: 2100,
  },
  {
    id: 'ocean-drive-newport-loop',
    name: 'Ocean Drive Newport Loop',
    region: 'rhode-island',
    start: { lat: 41.4628, lng: -71.3098, label: 'Newport' },
    end: { lat: 41.4628, lng: -71.3098, label: 'Newport' },
    waypoints: [
      { lat: 41.4471, lng: -71.3478 },
      { lat: 41.4534, lng: -71.3712 }
    ],
    distance: 10,
    duration: 20,
    difficulty: 'easy',
    tags: ['coastal', 'scenic', 'chill', 'ocean', 'quick'],
    description: 'The quintessential coastal cruise. Ten miles of winding oceanfront road past Gilded Age mansions and dramatic rocky coastline. No traffic lights, constant ocean views, perfect pavement. Best at golden hour.',
    curveCount: 38,
    elevationGain: 180,
  },
  {
    id: 'route-169-quiet-corner',
    name: 'Route 169 Quiet Corner',
    region: 'connecticut',
    start: { lat: 41.7893, lng: -71.8567, label: 'Woodstock' },
    end: { lat: 41.5234, lng: -71.9123, label: 'Canterbury' },
    waypoints: [
      { lat: 41.6845, lng: -71.8789 }
    ],
    distance: 24,
    duration: 35,
    difficulty: 'easy',
    tags: ['scenic', 'backroads', 'chill', 'historic', 'pastoral'],
    description: 'Named one of the most scenic roads in America. Rolling Connecticut farmland, stone walls, white steepled churches. No technical challenges - just pure New England pastoral beauty at your own pace.',
    curveCount: 45,
    elevationGain: 420,
  },
  {
    id: 'height-of-land-ridge-run',
    name: 'Height of Land Ridge Run',
    region: 'maine',
    start: { lat: 44.8234, lng: -70.7945, label: 'Rangeley' },
    end: { lat: 44.6234, lng: -70.5678, label: 'Rumford' },
    waypoints: [
      { lat: 44.7534, lng: -70.7123 }
    ],
    distance: 28,
    duration: 40,
    difficulty: 'moderate',
    tags: ['mountain', 'scenic', 'lake', 'remote', 'wilderness'],
    description: 'Maine\'s secret weapon. Route 17 climbs to the famous Height of Land overlook with jaw-dropping views of Mooselookmeguntic Lake and the Rangeley Lakes region. Remote, empty, and utterly spectacular.',
    curveCount: 78,
    elevationGain: 1560,
  },
  {
    id: 'cape-ann-coastal-circuit',
    name: 'Cape Ann Coastal Circuit',
    region: 'north-shore',
    start: { lat: 42.6159, lng: -70.6620, label: 'Gloucester' },
    end: { lat: 42.6159, lng: -70.6620, label: 'Gloucester' },
    waypoints: [
      { lat: 42.6590, lng: -70.6148 },
      { lat: 42.6915, lng: -70.6247 },
      { lat: 42.6320, lng: -70.7821 }
    ],
    distance: 28,
    duration: 45,
    difficulty: 'moderate',
    tags: ['coastal', 'scenic', 'twisty', 'ocean', 'fishing-villages'],
    description: 'The full loop around Cape Ann. Rocky headlands, working harbors, artists\' colonies. Route 127A hugs the coastline with constant ocean views and surprisingly technical sections through Rockport and Lanesville.',
    curveCount: 92,
    elevationGain: 380,
  },
  {
    id: 'kent-falls-river-road',
    name: 'Kent Falls River Road',
    region: 'connecticut',
    start: { lat: 41.7234, lng: -73.4567, label: 'Kent' },
    end: { lat: 41.9234, lng: -73.3789, label: 'Salisbury' },
    waypoints: [
      { lat: 41.8123, lng: -73.4234 }
    ],
    distance: 22,
    duration: 32,
    difficulty: 'moderate',
    tags: ['scenic', 'river', 'covered-bridges', 'backroads', 'forest'],
    description: 'The Housatonic River valley at its finest. Route 7 winds alongside the river past covered bridges, waterfalls, and classic Connecticut villages. Smooth flowing curves with occasional tighter sections.',
    curveCount: 56,
    elevationGain: 680,
  },
]

// Vibe/mood filters for route discovery
export const VIBE_FILTERS = [
  { id: 'technical', label: 'Technical' },
  { id: 'scenic', label: 'Scenic' },
  { id: 'chill', label: 'Chill' },
  { id: 'twisty', label: 'Twisty' },
  { id: 'mountain', label: 'Mountain' },
  { id: 'coastal', label: 'Coastal' },
  { id: 'backroads', label: 'Backroads' },
  { id: 'hairpins', label: 'Hairpins' },
  { id: 'forest', label: 'Forest' },
  { id: 'historic', label: 'Historic' },
  { id: 'quick', label: 'Quick' },
  { id: 'long', label: 'Long' },
]

// Regional filters covering all of New England
export const REGION_FILTERS = [
  { id: 'new-hampshire', label: 'New Hampshire' },
  { id: 'vermont', label: 'Vermont' },
  { id: 'maine', label: 'Maine' },
  { id: 'western-ma', label: 'Western MA' },
  { id: 'north-shore', label: 'North Shore' },
  { id: 'connecticut', label: 'Connecticut' },
  { id: 'rhode-island', label: 'Rhode Island' },
  { id: 'boston-area', label: 'Boston Area' },
  { id: 'cape-cod', label: 'Cape Cod' },
  { id: 'south-shore', label: 'South Shore' },
]
