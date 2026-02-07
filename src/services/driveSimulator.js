// ================================
// Drive Simulator v1.0
// Replays routes at realistic speeds for testing callouts
//
// Generates synthetic GPS positions along a route
// with realistic speed variations based on zones and curves
// ================================

/**
 * Speed constants in meters per second
 */
const ZONE_SPEEDS = {
  urban: 11.2,      // 25 mph
  transit: 25.9,    // 58 mph
  technical: 17.0,  // 38 mph
  default: 20.1     // 45 mph (fallback)
}

/**
 * Curve severity speed multipliers
 * Applied when within 200m before curve apex
 */
const CURVE_SPEED_MULTIPLIERS = {
  1: 0.90,  // Easy curves: 90% of base speed
  2: 0.90,
  3: 0.70,  // Medium curves: 70% of base speed
  4: 0.70,
  5: 0.50,  // Hard curves: 50% of base speed
  6: 0.50
}

/**
 * Configuration
 */
const CONFIG = {
  TICK_INTERVAL: 1000,        // Base tick rate in ms
  ZONE_TRANSITION_METERS: 300, // Distance to ramp speed over zone changes
  CURVE_APPROACH_METERS: 200,  // Distance before curve apex to start slowing
  CURVE_EXIT_METERS: 100,      // Distance after curve apex to resume speed
  INITIAL_DELAY_MS: 3000,      // Time to wait at start position
  GPS_ACCURACY: 10,            // Simulated GPS accuracy in meters
}

/**
 * Calculate distance between two coordinates in meters
 */
function getDistance(coord1, coord2) {
  const R = 6371e3
  const φ1 = coord1[1] * Math.PI / 180
  const φ2 = coord2[1] * Math.PI / 180
  const Δφ = (coord2[1] - coord1[1]) * Math.PI / 180
  const Δλ = (coord2[0] - coord1[0]) * Math.PI / 180

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))

  return R * c
}

/**
 * Calculate bearing between two coordinates in degrees
 */
function getBearing(coord1, coord2) {
  const φ1 = coord1[1] * Math.PI / 180
  const φ2 = coord2[1] * Math.PI / 180
  const Δλ = (coord2[0] - coord1[0]) * Math.PI / 180

  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) -
            Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)

  let bearing = Math.atan2(y, x) * 180 / Math.PI
  return (bearing + 360) % 360
}

/**
 * Interpolate between two coordinates
 */
function interpolateCoord(coord1, coord2, fraction) {
  return [
    coord1[0] + (coord2[0] - coord1[0]) * fraction,
    coord1[1] + (coord2[1] - coord1[1]) * fraction
  ]
}

/**
 * Build cumulative distance array for route coordinates
 */
function buildDistanceArray(coordinates) {
  const distances = [0]
  for (let i = 1; i < coordinates.length; i++) {
    const segDist = getDistance(coordinates[i-1], coordinates[i])
    distances.push(distances[i-1] + segDist)
  }
  return distances
}

/**
 * Find position along route at given distance
 */
function getPositionAtDistance(coordinates, distances, targetDist) {
  // Clamp to route bounds
  if (targetDist <= 0) {
    return {
      coord: coordinates[0],
      segmentIndex: 0,
      bearing: coordinates.length > 1 ? getBearing(coordinates[0], coordinates[1]) : 0
    }
  }

  const totalDist = distances[distances.length - 1]
  if (targetDist >= totalDist) {
    const lastIdx = coordinates.length - 1
    return {
      coord: coordinates[lastIdx],
      segmentIndex: lastIdx - 1,
      bearing: coordinates.length > 1 ? getBearing(coordinates[lastIdx-1], coordinates[lastIdx]) : 0
    }
  }

  // Binary search for segment
  let low = 0
  let high = distances.length - 1
  while (low < high - 1) {
    const mid = Math.floor((low + high) / 2)
    if (distances[mid] <= targetDist) {
      low = mid
    } else {
      high = mid
    }
  }

  const segStart = distances[low]
  const segEnd = distances[high]
  const segLength = segEnd - segStart
  const fraction = segLength > 0 ? (targetDist - segStart) / segLength : 0

  const coord = interpolateCoord(coordinates[low], coordinates[high], fraction)
  const bearing = getBearing(coordinates[low], coordinates[high])

  return { coord, segmentIndex: low, bearing }
}

/**
 * DriveSimulator class
 * Generates synthetic GPS positions along a route
 */
export class DriveSimulator {
  constructor({ coordinates, zones, curves, onPosition, onComplete, onZoneChange }) {
    // Route data
    this.coordinates = coordinates || []
    this.zones = zones || []
    this.curves = curves || []

    // Callbacks
    this.onPosition = onPosition
    this.onComplete = onComplete
    this.onZoneChange = onZoneChange

    // State
    this.isRunning = false
    this.isPaused = false
    this.playbackSpeed = 1
    this.currentDistance = 0
    this.currentZone = null
    this.startTime = null
    this.lastTickTime = null
    this.initialDelayComplete = false

    // NEW: Speed override mode (replaces time multiplier)
    // When set, overrides zone/curve speed modeling with fixed speed
    this.speedOverride = null  // Speed in mph, or null to use zone-based speed

    // NEW: Seeking state - prevents callout cascade during scrubbing
    this.isSeeking = false

    // Timing
    this.tickInterval = null

    // Pre-compute route distances
    this.distances = buildDistanceArray(this.coordinates)
    this.totalDistance = this.distances[this.distances.length - 1] || 0

    console.log(`🚗 DriveSimulator initialized: ${(this.totalDistance / 1609.34).toFixed(1)} miles, ${this.zones.length} zones, ${this.curves.length} curves`)
  }

  /**
   * Get the current zone for a given distance
   */
  getZoneAtDistance(distance) {
    for (const zone of this.zones) {
      if (distance >= zone.startDistance && distance <= zone.endDistance) {
        return zone
      }
    }
    return null
  }

  /**
   * Get nearby curves that affect speed
   */
  getNearbyCurve(distance) {
    for (const curve of this.curves) {
      const curveDistance = curve.distanceFromStart || curve.apexDistance || 0
      const distanceToCurve = curveDistance - distance

      // Within approach zone (before apex)
      if (distanceToCurve > 0 && distanceToCurve < CONFIG.CURVE_APPROACH_METERS) {
        return { curve, phase: 'approach', distanceToCurve }
      }

      // Just past apex (still accelerating)
      if (distanceToCurve >= -CONFIG.CURVE_EXIT_METERS && distanceToCurve <= 0) {
        return { curve, phase: 'exit', distanceToCurve: Math.abs(distanceToCurve) }
      }
    }
    return null
  }

  /**
   * Calculate speed at current position
   */
  calculateSpeed(distance, prevZone = null) {
    const zone = this.getZoneAtDistance(distance)
    const character = zone?.character || 'default'
    let baseSpeed = ZONE_SPEEDS[character] || ZONE_SPEEDS.default

    // Zone transition ramping
    if (zone && prevZone && zone.character !== prevZone.character) {
      const distIntoZone = distance - zone.startDistance
      if (distIntoZone < CONFIG.ZONE_TRANSITION_METERS) {
        const prevSpeed = ZONE_SPEEDS[prevZone.character] || ZONE_SPEEDS.default
        const rampFactor = distIntoZone / CONFIG.ZONE_TRANSITION_METERS
        baseSpeed = prevSpeed + (baseSpeed - prevSpeed) * rampFactor
      }
    }

    // Curve deceleration
    const nearbyCurve = this.getNearbyCurve(distance)
    if (nearbyCurve) {
      const severity = nearbyCurve.curve.severity || 3
      const clampedSeverity = Math.min(6, Math.max(1, severity))
      const multiplier = CURVE_SPEED_MULTIPLIERS[clampedSeverity] || 0.7

      if (nearbyCurve.phase === 'approach') {
        // Smooth deceleration as we approach
        const approachFactor = 1 - (nearbyCurve.distanceToCurve / CONFIG.CURVE_APPROACH_METERS)
        const speedReduction = (1 - multiplier) * approachFactor
        baseSpeed = baseSpeed * (1 - speedReduction)
      } else if (nearbyCurve.phase === 'exit') {
        // Smooth acceleration after apex
        const exitFactor = nearbyCurve.distanceToCurve / CONFIG.CURVE_EXIT_METERS
        baseSpeed = baseSpeed * (multiplier + (1 - multiplier) * exitFactor)
      }
    }

    return baseSpeed
  }

  /**
   * Generate a GPS position object matching the Geolocation API format
   */
  createPositionObject(coord, speedMps, heading) {
    return {
      coords: {
        latitude: coord[1],
        longitude: coord[0],
        accuracy: CONFIG.GPS_ACCURACY,
        speed: speedMps,
        heading: heading,
        altitude: null,
        altitudeAccuracy: null
      },
      timestamp: Date.now()
    }
  }

  /**
   * Main tick function - advances simulation
   */
  tick() {
    if (!this.isRunning || this.isPaused) return

    const now = Date.now()

    // Handle initial delay (3 seconds at start)
    if (!this.initialDelayComplete) {
      if (now - this.startTime < CONFIG.INITIAL_DELAY_MS) {
        // Stay at start position with 0 speed
        const startPos = this.coordinates[0]
        const bearing = this.coordinates.length > 1
          ? getBearing(this.coordinates[0], this.coordinates[1])
          : 0

        if (this.onPosition) {
          this.onPosition(this.createPositionObject(startPos, 0, bearing))
        }
        return
      }
      this.initialDelayComplete = true
      this.lastTickTime = now
      console.log('🚗 Initial delay complete, starting drive')
    }

    // Calculate time delta (no more time multiplier - use speed override instead)
    const dt = (now - this.lastTickTime) / 1000
    this.lastTickTime = now

    // Get previous zone for transition calculation
    const prevZone = this.currentZone

    // NEW: Use speed override if set, otherwise use zone-based speed
    let speedMps
    if (this.speedOverride !== null) {
      // Convert mph to m/s (1 mph = 0.44704 m/s)
      speedMps = this.speedOverride * 0.44704
    } else {
      speedMps = this.calculateSpeed(this.currentDistance, prevZone)
    }

    // Advance position (smooth, consistent movement)
    this.currentDistance += speedMps * dt

    // Check for zone change
    const newZone = this.getZoneAtDistance(this.currentDistance)
    if (newZone && (!this.currentZone || newZone.character !== this.currentZone.character)) {
      console.log(`🚗 Zone change: ${this.currentZone?.character || 'start'} → ${newZone.character} @ ${(this.currentDistance / 1609.34).toFixed(2)} mi`)
      this.currentZone = newZone
      if (this.onZoneChange) {
        this.onZoneChange(newZone)
      }
    }

    // Check for route completion
    if (this.currentDistance >= this.totalDistance) {
      console.log('🚗 Simulation complete!')
      this.stop()
      if (this.onComplete) {
        this.onComplete()
      }
      return
    }

    // Get interpolated position
    const posData = getPositionAtDistance(
      this.coordinates,
      this.distances,
      this.currentDistance
    )

    // Emit position
    if (this.onPosition) {
      this.onPosition(this.createPositionObject(
        posData.coord,
        speedMps,
        posData.bearing
      ))
    }
  }

  /**
   * Start the simulation
   */
  start() {
    if (this.isRunning) return

    console.log('🚗 Starting drive simulation')
    this.isRunning = true
    this.isPaused = false
    this.startTime = Date.now()
    this.lastTickTime = Date.now()
    this.initialDelayComplete = false
    this.currentDistance = 0
    this.currentZone = this.getZoneAtDistance(0)

    // Emit initial position
    if (this.coordinates.length > 0 && this.onPosition) {
      const bearing = this.coordinates.length > 1
        ? getBearing(this.coordinates[0], this.coordinates[1])
        : 0
      this.onPosition(this.createPositionObject(this.coordinates[0], 0, bearing))
    }

    // Start tick loop
    this.tickInterval = setInterval(() => this.tick(), CONFIG.TICK_INTERVAL)
  }

  /**
   * Pause the simulation
   */
  pause() {
    if (!this.isRunning || this.isPaused) return
    console.log('🚗 Simulation paused')
    this.isPaused = true
  }

  /**
   * Resume the simulation
   */
  resume() {
    if (!this.isRunning || !this.isPaused) return
    console.log('🚗 Simulation resumed')
    this.isPaused = false
    this.lastTickTime = Date.now()
  }

  /**
   * Stop and reset the simulation
   */
  stop() {
    console.log('🚗 Simulation stopped')
    this.isRunning = false
    this.isPaused = false
    this.currentDistance = 0
    this.initialDelayComplete = false

    if (this.tickInterval) {
      clearInterval(this.tickInterval)
      this.tickInterval = null
    }
  }

  /**
   * Set playback speed multiplier (DEPRECATED - use setSpeedOverride instead)
   */
  setSpeed(multiplier) {
    const validSpeeds = [1, 2, 4, 8]
    if (validSpeeds.includes(multiplier)) {
      console.log(`🚗 Playback speed: ${multiplier}x (legacy mode)`)
      this.playbackSpeed = multiplier
    }
  }

  /**
   * NEW: Set speed override in mph
   * This replaces the time multiplier approach for smoother simulation
   * @param {number|null} speedMph - Speed in mph, or null to use zone-based speed
   */
  setSpeedOverride(speedMph) {
    if (speedMph === null) {
      console.log('🚗 Speed override: OFF (using zone-based speed)')
      this.speedOverride = null
    } else {
      console.log(`🚗 Speed override: ${speedMph} mph`)
      this.speedOverride = speedMph
    }
  }

  /**
   * NEW: Start seeking mode (prevents callout cascade during scrubbing)
   */
  startSeeking() {
    this.isSeeking = true
    console.log('🚗 Seek mode: STARTED')
  }

  /**
   * NEW: End seeking mode
   */
  endSeeking() {
    this.isSeeking = false
    console.log('🚗 Seek mode: ENDED')
  }

  /**
   * Seek to a specific distance along the route
   */
  seekTo(meters) {
    const clampedDist = Math.max(0, Math.min(meters, this.totalDistance))
    console.log(`🚗 Seeking to ${(clampedDist / 1609.34).toFixed(2)} mi`)
    this.currentDistance = clampedDist
    this.currentZone = this.getZoneAtDistance(clampedDist)
    this.initialDelayComplete = true

    // Emit position immediately
    if (this.coordinates.length > 0 && this.onPosition) {
      const posData = getPositionAtDistance(
        this.coordinates,
        this.distances,
        clampedDist
      )
      const speedMps = this.calculateSpeed(clampedDist)
      this.onPosition(this.createPositionObject(
        posData.coord,
        speedMps,
        posData.bearing
      ))
    }
  }

  /**
   * Get current progress info
   */
  getProgress() {
    // Use speed override if set, otherwise calculate from zone
    let speedMps
    if (this.speedOverride !== null) {
      speedMps = this.speedOverride * 0.44704
    } else {
      speedMps = this.calculateSpeed(this.currentDistance)
    }
    const speedMph = speedMps * 2.237

    return {
      distanceMeters: this.currentDistance,
      distanceMiles: this.currentDistance / 1609.34,
      totalMeters: this.totalDistance,
      totalMiles: this.totalDistance / 1609.34,
      percent: this.totalDistance > 0 ? (this.currentDistance / this.totalDistance) * 100 : 0,
      currentSpeed: speedMph,
      currentSpeedMps: speedMps,
      currentZone: this.currentZone?.character || 'unknown',
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      playbackSpeed: this.playbackSpeed,
      // NEW: Include speed override and seeking state
      speedOverride: this.speedOverride,
      isSeeking: this.isSeeking
    }
  }
}

export default DriveSimulator
