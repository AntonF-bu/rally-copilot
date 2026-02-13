import { useMemo, useState, useEffect, useRef } from 'react'
import useStore from '../store'
import { useSwipeBack } from '../hooks/useSwipeBack'
import { saveDriveLog } from '../services/driveLogService'
import { submitRating, fetchUserRatingForRoute } from '../services/ratingService'
import { DiagnosticOverlay } from './DiagnosticOverlay'

// ================================
// Trip Summary - Tramo Brand Design
// Post-drive payoff screen
// ================================

// Zone colors for trip summary visualization
const ZONE_COLORS = {
  urban: { primary: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
  transit: { primary: '#3b82f6', bg: 'rgba(59,130,246,0.15)' },
  technical: { primary: '#22c55e', bg: 'rgba(34,197,94,0.15)' },
}

export default function TripSummary({ diagnosticLog }) {
  const { getTripSummary, closeTripSummary, goToMenu, routeData, routeZones, user, tripStats, driveStats, freeDriveTripStats, driveMode } = useStore()

  // Enable iOS-style swipe-back gesture
  useSwipeBack(closeTripSummary)

  const summary = getTripSummary()
  const [animatedStats, setAnimatedStats] = useState({ distance: 0, avgSpeed: 0, maxSpeed: 0 })
  const [showDetails, setShowDetails] = useState(false)
  const [isSharing, setIsSharing] = useState(false)
  const [shareSuccess, setShareSuccess] = useState(false)
  const [driveSaved, setDriveSaved] = useState(false)
  const shareCardRef = useRef(null)
  const saveAttemptedRef = useRef(false)

  // Rating state
  const [selectedRating, setSelectedRating] = useState(0)
  const [existingRating, setExistingRating] = useState(null)
  const [reviewText, setReviewText] = useState('')
  const [isSubmittingRating, setIsSubmittingRating] = useState(false)
  const [ratingSubmitted, setRatingSubmitted] = useState(false)
  const [showRatingSection, setShowRatingSection] = useState(true)
  const [showDiagnostics, setShowDiagnostics] = useState(false)

  // Animate stats on mount
  useEffect(() => {
    if (!summary) return
    const duration = 1200
    const start = Date.now()

    const animate = () => {
      const elapsed = Date.now() - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)

      setAnimatedStats({
        distance: summary.distance * eased,
        avgSpeed: summary.avgSpeed * eased,
        maxSpeed: summary.maxSpeed * eased,
      })

      if (progress < 1) requestAnimationFrame(animate)
    }
    requestAnimationFrame(animate)
  }, [summary])

  // Delayed reveal for details
  useEffect(() => {
    const timer = setTimeout(() => setShowDetails(true), 600)
    return () => clearTimeout(timer)
  }, [])

  // Auto-save drive to database on mount (runs exactly once)
  useEffect(() => {
    // Already saved this drive session - skip
    if (saveAttemptedRef.current) return

    // Validate required data before attempting save
    if (!summary || !tripStats?.startTime || !tripStats?.endTime || !user?.id) {
      return
    }

    // Mark as attempted FIRST to prevent any re-runs
    saveAttemptedRef.current = true

    const saveDrive = async () => {
      try {
        const durationMs = tripStats.endTime - tripStats.startTime
        const durationMinutes = durationMs / 60000
        const distanceMiles = tripStats.distance * 0.000621371

        let avgSpeedMph = 0
        if (tripStats.speedSamples && tripStats.speedSamples.length > 0) {
          avgSpeedMph = tripStats.speedSamples.reduce((a, b) => a + b, 0) / tripStats.speedSamples.length
        } else if (durationMinutes > 0 && distanceMiles > 0) {
          avgSpeedMph = distanceMiles / (durationMinutes / 60)
        }

        let zoneBreakdown = null
        if (routeZones && routeZones.length > 0) {
          const breakdown = { urban: 0, transit: 0, technical: 0 }
          routeZones.forEach(zone => {
            const miles = (zone.endMile || 0) - (zone.startMile || 0)
            const char = zone.character || 'technical'
            if (breakdown[char] !== undefined) {
              breakdown[char] += miles
            }
          })
          zoneBreakdown = breakdown
        }

        const driveData = {
          userId: user.id,
          routeSlug: routeData?.id || routeData?.discoveryId || null,
          startedAt: tripStats.startTime,
          endedAt: tripStats.endTime,
          durationMinutes,
          distanceMiles,
          avgSpeedMph,
          maxSpeedMph: tripStats.maxSpeed || 0,
          curvesCompleted: tripStats.curvesCompleted || 0,
          zoneBreakdown,
        }

        const result = await saveDriveLog(driveData)
        console.log('🗄️ Drive saved successfully:', result?.id || 'ok')
        setDriveSaved(true)
        setTimeout(() => setDriveSaved(false), 2000)
      } catch (error) {
        console.error('🗄️ Failed to save drive:', error)
      }
    }

    saveDrive()
  }, [user, tripStats, routeData, routeZones, summary])

  // Fetch existing rating for this route
  useEffect(() => {
    const routeSlug = routeData?.id || routeData?.discoveryId
    if (!user?.id || !routeSlug) return

    const fetchExisting = async () => {
      try {
        const existing = await fetchUserRatingForRoute(user.id, routeSlug)
        if (existing) {
          setExistingRating(existing)
          setSelectedRating(existing.rating)
          if (existing.review) setReviewText(existing.review)
        }
      } catch (err) {
        console.error('Failed to fetch existing rating:', err)
      }
    }
    fetchExisting()
  }, [user, routeData])

  const routeSlug = routeData?.id || routeData?.discoveryId
  const canRateRoute = Boolean(routeData?.name && routeSlug)

  // Handle rating submission
  const handleSubmitRating = async () => {
    if (!user?.id || !routeSlug || !selectedRating) return

    setIsSubmittingRating(true)
    try {
      await submitRating(user.id, routeSlug, selectedRating, reviewText || null)
      setRatingSubmitted(true)
      setTimeout(() => setShowRatingSection(false), 1500)
    } catch (err) {
      console.error('Failed to submit rating:', err)
    } finally {
      setIsSubmittingRating(false)
    }
  }

  // Generate SVG path string for route
  const routePath = useMemo(() => {
    const coords = routeData?.coordinates
    if (!coords || coords.length < 2) return null

    let minLng = Infinity, maxLng = -Infinity
    let minLat = Infinity, maxLat = -Infinity

    coords.forEach(([lng, lat]) => {
      minLng = Math.min(minLng, lng)
      maxLng = Math.max(maxLng, lng)
      minLat = Math.min(minLat, lat)
      maxLat = Math.max(maxLat, lat)
    })

    const padding = 0.15
    const width = maxLng - minLng || 0.01
    const height = maxLat - minLat || 0.01

    const viewWidth = 280
    const viewHeight = 140
    const scale = Math.min(
      (viewWidth * (1 - padding * 2)) / width,
      (viewHeight * (1 - padding * 2)) / height
    )

    const offsetX = (viewWidth - width * scale) / 2
    const offsetY = (viewHeight - height * scale) / 2

    const sampleRate = Math.max(1, Math.floor(coords.length / 120))
    const points = coords
      .filter((_, i) => i % sampleRate === 0 || i === coords.length - 1)
      .map(([lng, lat]) => [
        offsetX + (lng - minLng) * scale,
        viewHeight - (offsetY + (lat - minLat) * scale)
      ])

    if (points.length < 2) return null

    const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')

    return { d: pathD, start: points[0], end: points[points.length - 1], viewWidth, viewHeight }
  }, [routeData])

  // Curve analysis
  const curveInsights = useMemo(() => {
    const curves = routeData?.curves || []
    if (curves.length === 0) return null

    const angles = curves.map(c => Math.abs(c.angle || 0))

    return {
      total: curves.length,
      completed: summary?.curvesCompleted || 0,
      easy: curves.filter(c => (c.severity || 1) <= 2).length,
      medium: curves.filter(c => (c.severity || 1) >= 3 && (c.severity || 1) <= 4).length,
      hard: curves.filter(c => (c.severity || 1) >= 5).length,
      sharpest: angles.length > 0 ? Math.max(...angles) : 0,
      chicanes: curves.filter(c => c.isChicane).length,
    }
  }, [routeData, summary])

  // Zone breakdown
  const zoneInsights = useMemo(() => {
    if (!routeZones || routeZones.length === 0) return null

    const breakdown = { urban: 0, transit: 0, technical: 0 }
    let totalMiles = 0

    routeZones.forEach(zone => {
      const miles = (zone.endMile || 0) - (zone.startMile || 0)
      const char = zone.character || 'technical'
      if (breakdown[char] !== undefined) {
        breakdown[char] += miles
      }
      totalMiles += miles
    })

    return {
      ...breakdown,
      total: totalMiles,
      dominant: Object.entries(breakdown).sort((a, b) => b[1] - a[1])[0]?.[0] || 'technical',
      segments: routeZones.length,
    }
  }, [routeZones])

  // Performance insights
  const performanceInsights = useMemo(() => {
    if (!summary || !routeData) return null

    const estimatedDuration = routeData.duration
    const actualDuration = summary.duration / 1000
    const timeDiff = estimatedDuration ? actualDuration - estimatedDuration : 0

    return {
      estimatedMins: estimatedDuration ? Math.round(estimatedDuration / 60) : null,
      actualMins: Math.round(actualDuration / 60),
      timeDiffMins: Math.round(timeDiff / 60),
      faster: timeDiff < 0,
    }
  }, [summary, routeData])

  // Route names
  const routeNames = useMemo(() => {
    const origin = routeData?.origin || routeData?.name?.split(' to ')?.[0] || 'Start'
    const destination = routeData?.destination || routeData?.name?.split(' to ')?.[1] || 'Finish'

    const cleanName = (name) => {
      if (!name) return ''
      const parts = name.split(',')
      return parts[0].trim()
    }

    return {
      from: cleanName(origin),
      to: cleanName(destination)
    }
  }, [routeData])

  // Share functionality using html2canvas
  const handleShare = async () => {
    setIsSharing(true)

    try {
      const html2canvas = (await import('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/+esm')).default

      if (shareCardRef.current) {
        const canvas = await html2canvas(shareCardRef.current, {
          backgroundColor: '#0A0A0A',
          scale: 2,
          logging: false,
          useCORS: true,
        })

        canvas.toBlob(async (blob) => {
          if (!blob) {
            setIsSharing(false)
            return
          }

          const file = new File([blob], `tramo-drive-${Date.now()}.png`, { type: 'image/png' })

          if (navigator.share && navigator.canShare?.({ files: [file] })) {
            try {
              await navigator.share({
                files: [file],
                title: 'Tramo Drive',
                text: `${routeNames.from} to ${routeNames.to}`
              })
              setShareSuccess(true)
            } catch (err) {
              if (err.name !== 'AbortError') {
                downloadImage(blob)
                setShareSuccess(true)
              }
            }
          } else {
            downloadImage(blob)
            setShareSuccess(true)
          }

          setIsSharing(false)
          setTimeout(() => setShareSuccess(false), 2000)
        }, 'image/png')
      }
    } catch (err) {
      console.error('Share failed:', err)
      fallbackShare()
    }
  }

  const fallbackShare = async () => {
    const text = `Tramo Drive\n${routeNames.from} to ${routeNames.to}\n${summary.distance.toFixed(1)} ${summary.distanceUnit} - ${summary.durationFormatted} - Top ${Math.round(summary.maxSpeed)} ${summary.speedUnit}\ndrivetramo.com`

    if (navigator.share) {
      try {
        await navigator.share({ text })
        setShareSuccess(true)
      } catch (err) {
        navigator.clipboard?.writeText(text)
        setShareSuccess(true)
      }
    } else {
      navigator.clipboard?.writeText(text)
      setShareSuccess(true)
    }

    setIsSharing(false)
    setTimeout(() => setShareSuccess(false), 2000)
  }

  const downloadImage = (blob) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tramo-drive-${Date.now()}.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  if (!summary) {
    return (
      <div style={styles.container}>
        <p style={{ color: '#666666', fontSize: '14px' }}>No trip data</p>
      </div>
    )
  }

  const completionPercent = curveInsights?.total > 0
    ? Math.round((curveInsights.completed / curveInsights.total) * 100)
    : 100

  // Round 10: Determine if drive was completed (>95% of route)
  const isFreeDriveMode = driveMode === 'free' || !!freeDriveTripStats
  const driveCompleted = isFreeDriveMode
    ? true  // Free drive is always "complete" (no destination)
    : (driveStats && routeData?.distance
      ? (driveStats.totalDistance / routeData.distance) > 0.95
      : true)

  return (
    <div style={styles.container}>
      {/* Scrollable content */}
      <div style={styles.scrollContainer}>

        {/* Header Bar */}
        <div style={styles.headerBar}>
          <span style={styles.driveComplete}>{driveCompleted ? 'DRIVE COMPLETE' : 'DRIVE ENDED'}</span>
          <span style={styles.headerDate}>
            {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </span>
        </div>

        {/* Route Map */}
        <div style={styles.mapSection}>
          <svg
            viewBox={`0 0 ${routePath?.viewWidth || 280} ${routePath?.viewHeight || 140}`}
            style={styles.routeSvg}
            preserveAspectRatio="xMidYMid meet"
          >
            <defs>
              <filter id="glow">
                <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                <feMerge>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>

            {routePath ? (
              <>
                <path d={routePath.d} fill="none" stroke="#E8622C" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" opacity="0.3" filter="url(#glow)"/>
                <path d={routePath.d} fill="none" stroke="#E8622C" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx={routePath.start[0]} cy={routePath.start[1]} r="8" fill="#0A0A0A" stroke="#22c55e" strokeWidth="3"/>
                <circle cx={routePath.end[0]} cy={routePath.end[1]} r="8" fill="#0A0A0A" stroke="#E8622C" strokeWidth="3"/>
                <g transform={`translate(${routePath.end[0] - 6}, ${routePath.end[1] - 6})`}>
                  <path d="M4 8l3 3 5-6" fill="none" stroke="#E8622C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </g>
              </>
            ) : (
              <text x="140" y="70" textAnchor="middle" fill="#444444" fontSize="14" fontFamily="'DM Sans', sans-serif">Route Complete</text>
            )}
          </svg>

          {/* Route name */}
          <p style={styles.routeName}>{routeNames.from} to {routeNames.to}</p>
        </div>

        {/* Main Stats Grid */}
        <div style={styles.statsGrid}>
          <div style={styles.statCard}>
            <span style={styles.statLabel}>DISTANCE</span>
            <div style={styles.statValueRow}>
              <span style={styles.statNumber}>{animatedStats.distance.toFixed(1)}</span>
              <span style={styles.statUnit}>{summary.distanceUnit}</span>
            </div>
          </div>

          <div style={styles.statCard}>
            <span style={styles.statLabel}>DURATION</span>
            <span style={styles.statNumber}>{summary.durationFormatted}</span>
          </div>

          <div style={styles.statCard}>
            <span style={styles.statLabel}>AVG SPEED</span>
            <div style={styles.statValueRow}>
              <span style={styles.statNumber}>{Math.round(animatedStats.avgSpeed)}</span>
              <span style={styles.statUnit}>{summary.speedUnit}</span>
            </div>
          </div>

          <div style={styles.statCard}>
            <span style={styles.statLabel}>TOP SPEED</span>
            <div style={styles.statValueRow}>
              <span style={styles.statNumber}>{Math.round(animatedStats.maxSpeed)}</span>
              <span style={styles.statUnit}>{summary.speedUnit}</span>
            </div>
          </div>
        </div>

        {/* Performance comparison */}
        {performanceInsights?.estimatedMins && performanceInsights.timeDiffMins !== 0 && (
          <div style={styles.performanceSection}>
            <p style={{
              ...styles.performanceText,
              color: performanceInsights.faster ? '#22c55e' : '#E8622C'
            }}>
              {Math.abs(performanceInsights.timeDiffMins)} min {performanceInsights.faster ? 'faster' : 'slower'} than estimate
            </p>
          </div>
        )}

        {/* Free Drive Stats */}
        {isFreeDriveMode && freeDriveTripStats && (
          <div style={{
            ...styles.section,
            borderColor: 'rgba(232,98,44,0.2)',
            opacity: showDetails ? 1 : 0,
            transform: showDetails ? 'translateY(0)' : 'translateY(16px)',
            transition: 'all 0.5s ease 0.05s'
          }}>
            <div style={{ ...styles.sectionHeader, borderBottomColor: 'rgba(232,98,44,0.15)' }}>
              <span style={{ ...styles.sectionTitle, color: '#E8622C' }}>FREE DRIVE</span>
            </div>
            <div style={styles.statGrid}>
              <div style={styles.statCell}>
                <div style={{ ...styles.statValue, color: '#E8622C' }}>
                  {freeDriveTripStats.totalDistanceMiles.toFixed(1)} mi
                </div>
                <div style={styles.statLabel}>DISTANCE</div>
              </div>
              <div style={styles.statCell}>
                <div style={{ ...styles.statValue, color: '#E8622C' }}>
                  {Math.round(freeDriveTripStats.driveTime / 60000)}
                </div>
                <div style={styles.statLabel}>MIN</div>
              </div>
              <div style={styles.statCell}>
                <div style={{ ...styles.statValue, color: '#E8622C' }}>
                  {freeDriveTripStats.avgSpeed}
                </div>
                <div style={styles.statLabel}>AVG MPH</div>
              </div>
              <div style={styles.statCell}>
                <div style={{ ...styles.statValue, color: '#E8622C' }}>
                  {freeDriveTripStats.topSpeed}
                </div>
                <div style={styles.statLabel}>TOP MPH</div>
              </div>
            </div>

            {/* Curves called */}
            <div style={{ padding: '8px 16px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
              <span style={{ fontSize: '12px', color: '#888', fontFamily: "'JetBrains Mono', monospace" }}>
                {freeDriveTripStats.totalCurvesCalled} curves called
              </span>
            </div>

            {/* Roads visited */}
            {freeDriveTripStats.roadsVisited?.length > 0 && (
              <div style={{ padding: '8px 16px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                <div style={{ fontSize: '11px', color: '#666', marginBottom: '4px', letterSpacing: '0.5px' }}>ROADS</div>
                {freeDriveTripStats.roadsVisited.filter(r => r.name).map((road, i) => (
                  <div key={i} style={{ fontSize: '12px', color: '#aaa', padding: '2px 0', fontFamily: "'JetBrains Mono', monospace" }}>
                    {road.name} — {road.curves} curve{road.curves !== 1 ? 's' : ''}, avg {road.avgSpeed}mph
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Round 10: Highway Section Stats */}
        {!isFreeDriveMode && driveStats && driveStats.highwayDistance > 500 && (
          <div style={{
            ...styles.section,
            borderColor: 'rgba(102,179,255,0.2)',
            opacity: showDetails ? 1 : 0,
            transform: showDetails ? 'translateY(0)' : 'translateY(16px)',
            transition: 'all 0.5s ease 0.05s'
          }}>
            <div style={styles.sectionHeader}>
              <span style={{ ...styles.sectionOverline, color: '#66B3FF' }}>HIGHWAY</span>
              <span style={styles.sectionMeta}>
                {(driveStats.highwayDistance / 1609.34).toFixed(1)} mi
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              <div style={{ textAlign: 'center' }}>
                <span style={{ ...styles.curveNumber, color: '#66B3FF', fontSize: '28px' }}>
                  {Math.round(driveStats.highwayTime / 60000)}
                </span>
                <span style={{ ...styles.curveLabel, color: 'rgba(102,179,255,0.6)' }}>MIN</span>
              </div>
              <div style={{ textAlign: 'center' }}>
                <span style={{ ...styles.curveNumber, color: '#66B3FF', fontSize: '28px' }}>
                  {driveStats.highwayAvgSpeed || '—'}
                </span>
                <span style={{ ...styles.curveLabel, color: 'rgba(102,179,255,0.6)' }}>AVG MPH</span>
              </div>
              <div style={{ textAlign: 'center' }}>
                <span style={{ ...styles.curveNumber, color: '#66B3FF', fontSize: '28px' }}>
                  {driveStats.highwayTopSpeed || '—'}
                </span>
                <span style={{ ...styles.curveLabel, color: 'rgba(102,179,255,0.6)' }}>TOP MPH</span>
              </div>
            </div>
          </div>
        )}

        {/* Round 10: Technical Section Stats */}
        {!isFreeDriveMode && driveStats && driveStats.technicalDistance > 500 && (
          <div style={{
            ...styles.section,
            borderColor: 'rgba(0,230,138,0.2)',
            opacity: showDetails ? 1 : 0,
            transform: showDetails ? 'translateY(0)' : 'translateY(16px)',
            transition: 'all 0.5s ease 0.1s'
          }}>
            <div style={styles.sectionHeader}>
              <span style={{ ...styles.sectionOverline, color: '#00E68A' }}>TECHNICAL</span>
              <span style={styles.sectionMeta}>
                {(driveStats.technicalDistance / 1609.34).toFixed(1)} mi
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '12px' }}>
              <div style={{ textAlign: 'center' }}>
                <span style={{ ...styles.curveNumber, color: '#00E68A', fontSize: '28px' }}>
                  {Math.round(driveStats.technicalTime / 60000)}
                </span>
                <span style={{ ...styles.curveLabel, color: 'rgba(0,230,138,0.6)' }}>MIN</span>
              </div>
              <div style={{ textAlign: 'center' }}>
                <span style={{ ...styles.curveNumber, color: '#00E68A', fontSize: '28px' }}>
                  {driveStats.technicalCurves}
                </span>
                <span style={{ ...styles.curveLabel, color: 'rgba(0,230,138,0.6)' }}>CURVES</span>
              </div>
              <div style={{ textAlign: 'center' }}>
                <span style={{ ...styles.curveNumber, color: '#00E68A', fontSize: '28px' }}>
                  {driveStats.technicalAvgSpeed || '—'}
                </span>
                <span style={{ ...styles.curveLabel, color: 'rgba(0,230,138,0.6)' }}>AVG MPH</span>
              </div>
            </div>

            {/* Fastest Apex */}
            {driveStats.fastestApex && (
              <div style={{
                ...styles.sharpestRow,
                marginTop: 0,
                paddingTop: '12px',
                borderTop: '1px solid rgba(0,230,138,0.15)',
              }}>
                <div>
                  <span style={{ ...styles.sharpestLabel, display: 'block' }}>Fastest apex</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: '#555' }}>
                    {driveStats.fastestApex.curveDirection} {driveStats.fastestApex.curveAngle}° — mile {driveStats.fastestApex.mile.toFixed(1)}
                  </span>
                </div>
                <span style={{ ...styles.sharpestValue, color: '#00E68A' }}>
                  {driveStats.fastestApex.speed}
                  <span style={{ fontSize: '12px', color: '#555' }}> mph</span>
                </span>
              </div>
            )}

            {/* Hardest Curve */}
            {driveStats.hardestCurve && (
              <div style={styles.sharpestRow}>
                <div>
                  <span style={{ ...styles.sharpestLabel, display: 'block' }}>Hardest curve</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', color: '#555' }}>
                    {driveStats.hardestCurve.direction} — mile {driveStats.hardestCurve.mile.toFixed(1)}
                  </span>
                </div>
                <span style={{ ...styles.sharpestValue, color: '#00E68A' }}>
                  {driveStats.hardestCurve.angle}°
                </span>
              </div>
            )}
          </div>
        )}

        {/* Round 10: Callouts Delivered */}
        {!isFreeDriveMode && driveStats && driveStats.calloutsDelivered > 0 && (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '6px',
            marginBottom: '16px',
            opacity: showDetails ? 1 : 0,
            transition: 'opacity 0.5s ease 0.15s'
          }}>
            <span style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '11px',
              color: '#555',
            }}>
              {driveStats.calloutsDelivered} callouts delivered
            </span>
          </div>
        )}

        {/* Road Breakdown */}
        {!isFreeDriveMode && zoneInsights && zoneInsights.total > 0 && (
          <div style={{
            ...styles.section,
            opacity: showDetails ? 1 : 0,
            transform: showDetails ? 'translateY(0)' : 'translateY(16px)',
            transition: 'all 0.5s ease 0.1s'
          }}>
            <div style={styles.sectionHeader}>
              <span style={styles.sectionOverline}>ROAD BREAKDOWN</span>
              <span style={styles.sectionMeta}>{zoneInsights.segments} segments</span>
            </div>

            <div style={styles.zoneBar}>
              {zoneInsights.urban > 0 && <div style={{ height: '100%', width: `${(zoneInsights.urban / zoneInsights.total) * 100}%`, background: ZONE_COLORS.urban.primary }}/>}
              {zoneInsights.transit > 0 && <div style={{ height: '100%', width: `${(zoneInsights.transit / zoneInsights.total) * 100}%`, background: ZONE_COLORS.transit.primary }}/>}
              {zoneInsights.technical > 0 && <div style={{ height: '100%', width: `${(zoneInsights.technical / zoneInsights.total) * 100}%`, background: ZONE_COLORS.technical.primary }}/>}
            </div>

            <div style={styles.zoneLabels}>
              {Object.entries(ZONE_COLORS).map(([zone, colors]) => {
                const miles = zoneInsights[zone] || 0
                if (miles === 0) return null
                const percent = Math.round((miles / zoneInsights.total) * 100)
                return (
                  <div key={zone} style={styles.zoneLabel}>
                    <div style={styles.zoneDot}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: colors.primary }} />
                      <span style={styles.zoneName}>{zone}</span>
                    </div>
                    <span style={styles.zoneMiles}>{miles.toFixed(1)} mi</span>
                    <span style={styles.zonePercent}>{percent}%</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Curves Tackled */}
        {!isFreeDriveMode && curveInsights && curveInsights.total > 0 && (
          <div style={{
            ...styles.section,
            opacity: showDetails ? 1 : 0,
            transform: showDetails ? 'translateY(0)' : 'translateY(16px)',
            transition: 'all 0.5s ease 0.2s'
          }}>
            <div style={styles.sectionHeader}>
              <span style={styles.sectionOverline}>CURVES TACKLED</span>
              <span style={styles.curveCount}>
                {curveInsights.completed}<span style={{ color: '#444444' }}>/{curveInsights.total}</span>
              </span>
            </div>

            <div style={styles.progressBar}>
              <div style={{
                height: '100%',
                borderRadius: '4px',
                width: `${completionPercent}%`,
                background: 'linear-gradient(90deg, #22c55e, #E8622C)'
              }}/>
            </div>

            <div style={styles.curveGrid}>
              <div style={{ ...styles.curveCard, background: 'rgba(34,197,94,0.1)' }}>
                <span style={{ ...styles.curveNumber, color: '#22c55e' }}>{curveInsights.easy}</span>
                <span style={{ ...styles.curveLabel, color: 'rgba(34,197,94,0.6)' }}>EASY</span>
              </div>
              <div style={{ ...styles.curveCard, background: 'rgba(234,179,8,0.1)' }}>
                <span style={{ ...styles.curveNumber, color: '#eab308' }}>{curveInsights.medium}</span>
                <span style={{ ...styles.curveLabel, color: 'rgba(234,179,8,0.6)' }}>MEDIUM</span>
              </div>
              <div style={{ ...styles.curveCard, background: 'rgba(239,68,68,0.1)' }}>
                <span style={{ ...styles.curveNumber, color: '#ef4444' }}>{curveInsights.hard}</span>
                <span style={{ ...styles.curveLabel, color: 'rgba(239,68,68,0.6)' }}>HARD</span>
              </div>
              <div style={{ ...styles.curveCard, background: 'rgba(168,85,247,0.1)' }}>
                <span style={{ ...styles.curveNumber, color: '#a855f7' }}>{curveInsights.chicanes}</span>
                <span style={{ ...styles.curveLabel, color: 'rgba(168,85,247,0.6)' }}>S-CURVES</span>
              </div>
            </div>

            {curveInsights.sharpest > 0 && (
              <div style={styles.sharpestRow}>
                <span style={styles.sharpestLabel}>Sharpest turn</span>
                <span style={styles.sharpestValue}>{curveInsights.sharpest}°</span>
              </div>
            )}
          </div>
        )}

        {/* Rating Section */}
        {canRateRoute && user?.id && showRatingSection && (
          <div style={{
            ...styles.section,
            opacity: showDetails ? 1 : 0,
            transform: showDetails ? 'translateY(0)' : 'translateY(16px)',
            transition: 'all 0.5s ease 0.25s'
          }}>
            {ratingSubmitted ? (
              <div style={styles.ratingSuccess}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
                  <path d="M20 6L9 17l-5-5"/>
                </svg>
                <span style={{ color: '#22c55e', fontSize: '14px', fontFamily: "'DM Sans', sans-serif", fontWeight: 500 }}>Rating saved</span>
              </div>
            ) : (
              <>
                <span style={styles.sectionOverline}>
                  {existingRating ? 'UPDATE YOUR RATING' : 'RATE THIS ROUTE'}
                </span>

                <div style={styles.starsRow}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onClick={() => setSelectedRating(star)}
                      style={{
                        ...styles.starButton,
                        transform: selectedRating >= star ? 'scale(1.1)' : 'scale(1)',
                      }}
                    >
                      <svg
                        width="32"
                        height="32"
                        viewBox="0 0 24 24"
                        fill={selectedRating >= star ? '#E8622C' : 'none'}
                        stroke={selectedRating >= star ? '#E8622C' : '#666666'}
                        strokeWidth="1.5"
                      >
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                    </button>
                  ))}
                </div>

                {selectedRating > 0 && (
                  <div style={styles.reviewSection}>
                    <textarea
                      value={reviewText}
                      onChange={(e) => setReviewText(e.target.value.slice(0, 200))}
                      placeholder="Any thoughts? (optional)"
                      maxLength={200}
                      style={styles.reviewInput}
                    />
                    <div style={styles.reviewFooter}>
                      <span style={styles.charCount}>{reviewText.length}/200</span>
                      <button
                        onClick={handleSubmitRating}
                        disabled={isSubmittingRating}
                        style={{
                          ...styles.submitButton,
                          opacity: isSubmittingRating ? 0.5 : 1,
                        }}
                      >
                        {isSubmittingRating ? 'Saving...' : existingRating ? 'Update' : 'Submit'}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* View Drive Log - subtle link, only if diagnostic entries exist */}
        {diagnosticLog?.current?.length > 0 && (
          <div style={{ textAlign: 'center', padding: '16px 0 8px' }}>
            <button
              onClick={() => setShowDiagnostics(true)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#555', fontSize: '12px',
                fontFamily: "'JetBrains Mono', monospace",
                textDecoration: 'underline',
                textDecorationColor: '#333',
              }}
            >
              View Drive Log ({diagnosticLog.current.length})
            </button>
          </div>
        )}

        {/* Spacer for fixed buttons */}
        <div style={{ height: '140px' }} />
      </div>

      {/* Fixed Action Buttons */}
      <div style={styles.actionButtons}>
        <button
          onClick={handleShare}
          disabled={isSharing}
          style={{
            ...styles.shareButton,
            opacity: isSharing ? 0.5 : 1,
            background: shareSuccess ? 'rgba(34,197,94,0.2)' : '#E8622C',
            color: shareSuccess ? '#22c55e' : '#FFFFFF',
          }}
        >
          {isSharing ? (
            <>
              <div style={styles.spinner}/>
              Creating...
            </>
          ) : shareSuccess ? (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
              Saved!
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                <polyline points="16 6 12 2 8 6"/>
                <line x1="12" y1="2" x2="12" y2="15"/>
              </svg>
              Share Drive
            </>
          )}
        </button>

        <button
          onClick={() => { closeTripSummary(); goToMenu() }}
          style={styles.doneButton}
        >
          Done
        </button>
      </div>

      {/* Hidden Share Card */}
      <div style={{ position: 'fixed', left: '-9999px', top: 0 }}>
        <div
          ref={shareCardRef}
          style={styles.shareCard}
        >
          {/* Route visualization */}
          <div style={{ position: 'relative', height: '160px', marginBottom: '16px' }}>
            <svg viewBox={`0 0 ${routePath?.viewWidth || 280} ${routePath?.viewHeight || 140}`} style={{ width: '100%', height: '100%' }} preserveAspectRatio="xMidYMid meet">
              {routePath && (
                <>
                  <path d={routePath.d} fill="none" stroke="#E8622C" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" opacity="0.5"/>
                  <circle cx={routePath.start[0]} cy={routePath.start[1]} r="6" fill="#0A0A0A" stroke="#22c55e" strokeWidth="2"/>
                  <circle cx={routePath.end[0]} cy={routePath.end[1]} r="6" fill="#0A0A0A" stroke="#E8622C" strokeWidth="2"/>
                </>
              )}
            </svg>
          </div>

          {/* Route name */}
          <div style={{ textAlign: 'center', marginBottom: '4px' }}>
            <span style={{ color: '#FFFFFF', fontSize: '18px', fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>
              {routeNames.from} to {routeNames.to}
            </span>
          </div>

          {/* Date */}
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <span style={{ color: '#666666', fontSize: '12px', fontFamily: "'JetBrains Mono', monospace" }}>
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </span>
          </div>

          {/* Stats grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div style={styles.shareStatCard}>
              <div style={styles.shareStatLabel}>DISTANCE</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                <span style={styles.shareStatNumber}>{summary.distance.toFixed(1)}</span>
                <span style={styles.shareStatUnit}>{summary.distanceUnit}</span>
              </div>
            </div>
            <div style={styles.shareStatCard}>
              <div style={styles.shareStatLabel}>DURATION</div>
              <span style={styles.shareStatNumber}>{summary.durationFormatted}</span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
            <div style={styles.shareStatCard}>
              <div style={styles.shareStatLabel}>AVG SPEED</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                <span style={{ ...styles.shareStatNumber, color: '#E8622C' }}>{Math.round(summary.avgSpeed)}</span>
                <span style={styles.shareStatUnit}>{summary.speedUnit}</span>
              </div>
            </div>
            <div style={styles.shareStatCard}>
              <div style={styles.shareStatLabel}>TOP SPEED</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                <span style={{ ...styles.shareStatNumber, color: '#E8622C' }}>{Math.round(summary.maxSpeed)}</span>
                <span style={styles.shareStatUnit}>{summary.speedUnit}</span>
              </div>
            </div>
          </div>

          {/* Curves summary */}
          {curveInsights && curveInsights.total > 0 && (
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <span style={{ color: '#666666', fontSize: '12px', fontFamily: "'JetBrains Mono', monospace" }}>
                {curveInsights.total} curves - {curveInsights.easy} easy - {curveInsights.medium} medium - {curveInsights.hard} hard
              </span>
            </div>
          )}

          {/* Branding */}
          <div style={{ textAlign: 'center', paddingTop: '16px', borderTop: '1px solid #1A1A1A' }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '16px', letterSpacing: '0.1em', color: '#E8622C', marginBottom: '4px' }}>TRAMO</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '10px', letterSpacing: '0.1em', color: '#444444' }}>drivetramo.com</div>
          </div>
        </div>
      </div>

      {/* Drive Saved Toast */}
      {driveSaved && (
        <div style={styles.toast}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
          <span style={{ color: '#22c55e', fontSize: '12px', fontFamily: "'DM Sans', sans-serif", fontWeight: 500 }}>Drive saved</span>
        </div>
      )}

      {/* Diagnostic Overlay */}
      {showDiagnostics && diagnosticLog?.current && (
        <DiagnosticOverlay
          entries={diagnosticLog.current}
          onClose={() => setShowDiagnostics(false)}
        />
      )}

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes fadeInOut {
          0% { opacity: 0; transform: translate(-50%, 10px); }
          15% { opacity: 1; transform: translate(-50%, 0); }
          85% { opacity: 1; transform: translate(-50%, 0); }
          100% { opacity: 0; transform: translate(-50%, -10px); }
        }
      `}</style>
    </div>
  )
}

const styles = {
  container: {
    position: 'absolute',
    inset: 0,
    background: '#0A0A0A',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  scrollContainer: {
    flex: 1,
    overflow: 'auto',
    padding: '0 16px',
    paddingTop: 'calc(env(safe-area-inset-top, 20px) + 16px)',
  },

  // Header
  headerBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
  },
  driveComplete: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '11px',
    fontWeight: 500,
    letterSpacing: '0.2em',
    color: '#E8622C',
  },
  headerDate: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '11px',
    color: '#666666',
  },

  // Map section
  mapSection: {
    marginBottom: '24px',
  },
  routeSvg: {
    width: '100%',
    height: '140px',
  },
  routeName: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '16px',
    fontWeight: 500,
    color: '#FFFFFF',
    textAlign: 'center',
    margin: 0,
    marginTop: '12px',
  },

  // Stats grid
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
    marginBottom: '16px',
  },
  statCard: {
    background: '#111111',
    border: '1px solid #1A1A1A',
    borderRadius: '12px',
    padding: '16px',
  },
  statLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '10px',
    fontWeight: 500,
    letterSpacing: '0.1em',
    color: '#666666',
    display: 'block',
    marginBottom: '8px',
  },
  statValueRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '4px',
  },
  statNumber: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: '40px',
    color: '#FFFFFF',
    lineHeight: 1,
  },
  statUnit: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '10px',
    color: '#666666',
  },

  // Performance
  performanceSection: {
    marginBottom: '16px',
    textAlign: 'center',
  },
  performanceText: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '14px',
    fontWeight: 500,
    margin: 0,
  },

  // Section
  section: {
    background: '#111111',
    border: '1px solid #1A1A1A',
    borderRadius: '12px',
    padding: '16px',
    marginBottom: '16px',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  sectionOverline: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '9px',
    fontWeight: 500,
    letterSpacing: '0.15em',
    color: '#666666',
  },
  sectionMeta: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '10px',
    color: '#444444',
  },

  // Zone breakdown
  zoneBar: {
    display: 'flex',
    height: '12px',
    borderRadius: '6px',
    overflow: 'hidden',
    marginBottom: '16px',
  },
  zoneLabels: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  zoneLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  zoneDot: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    minWidth: '80px',
  },
  zoneName: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '11px',
    color: '#888888',
    textTransform: 'uppercase',
  },
  zoneMiles: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '11px',
    color: '#FFFFFF',
    fontWeight: 500,
    flex: 1,
  },
  zonePercent: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '10px',
    color: '#444444',
  },

  // Curves
  curveCount: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '14px',
    fontWeight: 600,
    color: '#FFFFFF',
  },
  progressBar: {
    height: '8px',
    background: '#1A1A1A',
    borderRadius: '4px',
    overflow: 'hidden',
    marginBottom: '16px',
  },
  curveGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '8px',
  },
  curveCard: {
    textAlign: 'center',
    padding: '12px 8px',
    borderRadius: '8px',
  },
  curveNumber: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: '24px',
    display: 'block',
    lineHeight: 1,
    marginBottom: '4px',
  },
  curveLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '8px',
    fontWeight: 500,
    letterSpacing: '0.1em',
  },
  sharpestRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '12px',
    paddingTop: '12px',
    borderTop: '1px solid #1A1A1A',
  },
  sharpestLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '10px',
    color: '#666666',
  },
  sharpestValue: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: '18px',
    color: '#E8622C',
  },

  // Rating
  ratingSuccess: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '8px 0',
  },
  starsRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    marginTop: '12px',
  },
  starButton: {
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    transition: 'transform 0.15s ease',
  },
  reviewSection: {
    marginTop: '16px',
  },
  reviewInput: {
    width: '100%',
    background: '#0A0A0A',
    border: '1px solid #1A1A1A',
    borderRadius: '8px',
    padding: '12px',
    color: '#FFFFFF',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '14px',
    resize: 'none',
    minHeight: '60px',
    outline: 'none',
    boxSizing: 'border-box',
  },
  reviewFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '12px',
  },
  charCount: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '10px',
    color: '#444444',
  },
  submitButton: {
    padding: '8px 16px',
    borderRadius: '8px',
    border: 'none',
    background: '#E8622C',
    color: '#FFFFFF',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
  },

  // Action buttons
  actionButtons: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: '16px',
    paddingBottom: 'calc(env(safe-area-inset-bottom, 16px) + 16px)',
    background: 'linear-gradient(to top, #0A0A0A 60%, transparent)',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  shareButton: {
    width: '100%',
    padding: '14px',
    borderRadius: '12px',
    border: 'none',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    transition: 'all 0.2s ease',
  },
  doneButton: {
    width: '100%',
    padding: '14px',
    borderRadius: '12px',
    border: '1px solid #1A1A1A',
    background: 'transparent',
    color: '#888888',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  spinner: {
    width: '16px',
    height: '16px',
    border: '2px solid currentColor',
    borderTopColor: 'transparent',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },

  // Toast
  toast: {
    position: 'fixed',
    bottom: '180px',
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '8px 16px',
    borderRadius: '20px',
    background: 'rgba(34,197,94,0.2)',
    border: '1px solid rgba(34,197,94,0.3)',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    zIndex: 100,
    animation: 'fadeInOut 2s ease-in-out forwards',
  },

  // Share card
  shareCard: {
    width: '400px',
    padding: '24px',
    background: '#0A0A0A',
  },
  shareStatCard: {
    background: '#111111',
    borderRadius: '12px',
    padding: '16px',
  },
  shareStatLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '10px',
    letterSpacing: '0.1em',
    color: '#666666',
    marginBottom: '4px',
  },
  shareStatNumber: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: '32px',
    color: '#FFFFFF',
    lineHeight: 1,
  },
  shareStatUnit: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '12px',
    color: '#666666',
  },
}
