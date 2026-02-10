// src/services/routeMatcher.js
// ================================
// Windowed Route Matching v1.0
//
// Constrains GPS-to-route matching to a sliding window
// near the last known position. Prevents the distance from
// jumping to the wrong part of the route when GPS is noisy
// or the route doubles back / runs parallel.
// ================================

import { haversineDistance, buildCumulativeDistances } from '../utils/routeGeometry'

/**
 * Find nearest point on a line segment.
 * Returns [lng, lat, t] where t is fraction along segment (0-1).
 */
function nearestPointOnSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const lenSq = dx * dx + dy * dy

  if (lenSq === 0) return [ax, ay, 0] // Degenerate segment

  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))

  return [ax + t * dx, ay + t * dy, t]
}

/**
 * Windowed route matching — constrains search to nearby segments.
 * Prevents distance from jumping to wrong part of route.
 *
 * @param {Array} routeCoords - Route geometry coordinates [[lng, lat], ...]
 * @param {Array} segmentDistances - Cumulative distance at each coordinate point (meters)
 * @param {number} currentLng - Current GPS longitude
 * @param {number} currentLat - Current GPS latitude
 * @param {number} lastDistance - Last known distance along route (meters)
 * @param {number} currentSpeed - Current speed in mph (for dynamic window)
 * @returns {{ distance: number, distFromRoute: number }} distance along route (m) and perpendicular offset (m)
 */
export function getDistanceAlongRoute(routeCoords, segmentDistances, currentLng, currentLat, lastDistance, currentSpeed) {
  // ── DYNAMIC SEARCH WINDOW ──
  // Window size based on speed:
  // At 30mph (13.4 m/s), with updates every ~1s: ~13m movement
  // At 70mph (31.3 m/s): ~31m movement
  // Use 10x expected movement as window to handle GPS gaps
  const speedMps = Math.max(currentSpeed, 10) * 0.44704
  const windowSize = Math.max(200, speedMps * 10) // At least 200m, up to ~300m at highway speed

  const searchStart = Math.max(0, lastDistance - 50) // Allow tiny backward movement (GPS jitter)
  const searchEnd = lastDistance + windowSize // Forward window

  // ── FIND SEGMENTS IN WINDOW ──
  let bestDist = Infinity
  let bestRouteDistance = lastDistance

  for (let i = 0; i < routeCoords.length - 1; i++) {
    const segStart = segmentDistances[i]
    const segEnd = segmentDistances[i + 1]

    // Skip segments outside search window
    if (segEnd < searchStart || segStart > searchEnd) continue

    // Find nearest point on this segment
    const [nearLng, nearLat, t] = nearestPointOnSegment(
      currentLng, currentLat,
      routeCoords[i][0], routeCoords[i][1],
      routeCoords[i + 1][0], routeCoords[i + 1][1]
    )

    // Distance from GPS to nearest point on segment (haversine meters)
    const distToRoute = haversineDistance(currentLat, currentLng, nearLat, nearLng)

    if (distToRoute < bestDist) {
      bestDist = distToRoute
      // Distance along route = segment start + fraction of segment
      bestRouteDistance = segStart + t * (segEnd - segStart)
    }
  }

  // ── SANITY CHECKS ──

  // If best match is more than 100m from route, GPS is way off — keep last known
  if (bestDist > 100) {
    return { distance: lastDistance, distFromRoute: bestDist }
  }

  // Enforce monotonic forward progression (with tiny backward tolerance for GPS jitter)
  if (bestRouteDistance < lastDistance - 30) {
    return { distance: lastDistance, distFromRoute: bestDist }
  }

  // Cap maximum forward jump (prevent 322% bug)
  const maxForwardJump = speedMps * 5 // ~5 seconds of travel
  if (bestRouteDistance - lastDistance > maxForwardJump) {
    bestRouteDistance = lastDistance + maxForwardJump
  }

  return { distance: bestRouteDistance, distFromRoute: bestDist }
}

// Re-export for convenience
export { buildCumulativeDistances, haversineDistance }
