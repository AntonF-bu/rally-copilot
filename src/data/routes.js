// ================================
// Tramo - Route Data
// ================================

// Mohawk Trail - Famous Hairpin Section
// Route 2, North Adams to Western Summit, MA
export const MOHAWK_TRAIL = {
  id: 'mohawk-trail-hairpin',
  name: 'Mohawk Trail - Hairpin Section',
  location: 'North Adams, MA',
  description: 'The famous hairpin turn and surrounding curves on Route 2',
  difficulty: 'advanced',
  length: 4.2, // miles
  elevationGain: 850, // feet
  
  // Route polyline coordinates [lng, lat] for Mapbox
  coordinates: [
    [-73.1045, 42.6989],
    [-73.1067, 42.7001],
    [-73.1089, 42.7012],
    [-73.1112, 42.7023],
    [-73.1134, 42.7029],
    [-73.1156, 42.7034],
    [-73.1178, 42.7045],
    [-73.1198, 42.7058],
    [-73.1216, 42.7072],
    [-73.1234, 42.7089],
    [-73.1256, 42.7101],
    [-73.1278, 42.7112],
    [-73.1295, 42.7128],
    [-73.1312, 42.7145],
    [-73.1334, 42.7162],
    [-73.1356, 42.7178],
    [-73.1378, 42.7189],
    [-73.1398, 42.7201], // Hairpin apex
    [-73.1420, 42.7210],
    [-73.1445, 42.7223],
    [-73.1467, 42.7238],
    [-73.1489, 42.7256],
    [-73.1512, 42.7272],
    [-73.1534, 42.7289],
    [-73.1556, 42.7301],
    [-73.1578, 42.7312],
    [-73.1600, 42.7328],
    [-73.1623, 42.7345],
  ],
  
  // Curve definitions
  curves: [
    {
      id: 1,
      position: [-73.1089, 42.7012],
      direction: 'RIGHT',
      severity: 2,
      modifier: null,
      radius: 150,
      speedCruise: 55,
      speedFast: 65,
      speedRace: 75,
    },
    {
      id: 2,
      position: [-73.1156, 42.7034],
      direction: 'LEFT',
      severity: 3,
      modifier: null,
      radius: 100,
      speedCruise: 45,
      speedFast: 55,
      speedRace: 65,
    },
    {
      id: 3,
      position: [-73.1198, 42.7058],
      direction: 'RIGHT',
      severity: 3,
      modifier: 'TIGHTENS',
      radius: 85,
      speedCruise: 40,
      speedFast: 50,
      speedRace: 60,
    },
    {
      id: 4,
      position: [-73.1234, 42.7089],
      direction: 'LEFT',
      severity: 4,
      modifier: null,
      radius: 60,
      speedCruise: 35,
      speedFast: 45,
      speedRace: 55,
    },
    {
      id: 5,
      position: [-73.1278, 42.7112],
      direction: 'RIGHT',
      severity: 2,
      modifier: 'LONG',
      radius: 180,
      speedCruise: 55,
      speedFast: 70,
      speedRace: 80,
    },
    {
      id: 6,
      position: [-73.1312, 42.7145],
      direction: 'LEFT',
      severity: 5,
      modifier: 'CAUTION',
      radius: 40,
      speedCruise: 30,
      speedFast: 40,
      speedRace: 50,
    },
    {
      id: 7,
      position: [-73.1356, 42.7178],
      direction: 'RIGHT',
      severity: 3,
      modifier: 'OPENS',
      radius: 90,
      speedCruise: 45,
      speedFast: 55,
      speedRace: 65,
    },
    {
      id: 8,
      position: [-73.1398, 42.7201],
      direction: 'LEFT',
      severity: 6,
      modifier: 'HAIRPIN',
      radius: 25,
      speedCruise: 20,
      speedFast: 25,
      speedRace: 35,
      isLandmark: true,
      landmarkName: 'Famous Hairpin Turn',
    },
    {
      id: 9,
      position: [-73.1445, 42.7223],
      direction: 'RIGHT',
      severity: 4,
      modifier: null,
      radius: 55,
      speedCruise: 35,
      speedFast: 45,
      speedRace: 55,
    },
    {
      id: 10,
      position: [-73.1489, 42.7256],
      direction: 'LEFT',
      severity: 3,
      modifier: null,
      radius: 95,
      speedCruise: 45,
      speedFast: 55,
      speedRace: 65,
    },
    {
      id: 11,
      position: [-73.1534, 42.7289],
      direction: 'RIGHT',
      severity: 2,
      modifier: 'CREST',
      radius: 140,
      speedCruise: 50,
      speedFast: 60,
      speedRace: 70,
    },
    {
      id: 12,
      position: [-73.1578, 42.7312],
      direction: 'LEFT',
      severity: 4,
      modifier: 'TIGHTENS',
      radius: 50,
      speedCruise: 30,
      speedFast: 40,
      speedRace: 50,
    },
  ],
  
  // Points of interest
  pois: [
    {
      id: 'hairpin-viewpoint',
      name: 'Hairpin Turn Viewpoint',
      position: [-73.1398, 42.7201],
      type: 'viewpoint',
      description: 'Panoramic views of North Adams and the Taconic Mountains',
    },
    {
      id: 'golden-eagle',
      name: 'Golden Eagle Restaurant',
      position: [-73.1395, 42.7198],
      type: 'restaurant',
      description: 'Historic restaurant since 1914',
    },
    {
      id: 'western-summit',
      name: 'Western Summit',
      position: [-73.1600, 42.7328],
      type: 'summit',
      description: 'Elevation 2,272 feet - Spirit Mountain',
    },
  ],
  
  // Community stats (for marketplace)
  stats: {
    totalDrives: 234,
    avgRating: 4.8,
    saves: 89,
  }
}

// Severity level descriptions
export const SEVERITY_LABELS = {
  1: 'Flat out',
  2: 'Easy',
  3: 'Medium', 
  4: 'Tight',
  5: 'Very tight',
  6: 'Hairpin'
}

// Get curve color based on severity
export const getCurveColor = (severity) => {
  if (severity <= 2) return '#00ff88' // Green - easy
  if (severity <= 3) return '#ffd500' // Yellow - medium
  if (severity <= 4) return '#ff6b35' // Orange - tight
  return '#ff3366' // Red - very tight/hairpin
}

// Calculate distance between two points (Haversine)
export const getDistance = (pos1, pos2) => {
  const R = 6371e3 // Earth radius in meters
  const φ1 = pos1[1] * Math.PI / 180
  const φ2 = pos2[1] * Math.PI / 180
  const Δφ = (pos2[1] - pos1[1]) * Math.PI / 180
  const Δλ = (pos2[0] - pos1[0]) * Math.PI / 180

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))

  return R * c // Distance in meters
}

// Get bearing between two points
export const getBearing = (pos1, pos2) => {
  const φ1 = pos1[1] * Math.PI / 180
  const φ2 = pos2[1] * Math.PI / 180
  const λ1 = pos1[0] * Math.PI / 180
  const λ2 = pos2[0] * Math.PI / 180

  const y = Math.sin(λ2 - λ1) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) -
            Math.sin(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1)
  
  let θ = Math.atan2(y, x)
  return (θ * 180 / Math.PI + 360) % 360
}

export default MOHAWK_TRAIL
