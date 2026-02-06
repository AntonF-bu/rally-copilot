// Profile Tab - Tramo Brand Design
// Drive stats, collection progress, history, and account management

import { useState, useEffect, useMemo } from 'react'
import useStore from '../../store'
import { signOut, updateProfile } from '../../services/authService'
import { DISCOVERY_ROUTES } from '../../data/discoveryRoutes'
import { fetchDriverStats, fetchDriveLogs } from '../../services/driveLogService'

export function ProfileTab() {
  // Get profile and user from store
  const profile = useStore((state) => state.profile)
  const user = useStore((state) => state.user)
  const setProfile = useStore((state) => state.setProfile)
  const recentRoutes = useStore((state) => state.recentRoutes)

  // Stats and drives from database
  const [driverStats, setDriverStats] = useState({ totalMiles: 0, totalDrives: 0, uniqueRoutes: 0 })
  const [driveLogs, setDriveLogs] = useState([])
  const [loadingStats, setLoadingStats] = useState(true)

  // Compute local stats from recentRoutes as fallback
  const localStats = useMemo(() => {
    if (!recentRoutes?.length) {
      return { totalMiles: 0, totalDrives: 0, uniqueRoutes: 0 }
    }
    const totalMiles = recentRoutes.reduce((acc, route) => {
      return acc + (route.distance ? route.distance / 1609.34 : 0)
    }, 0)
    const uniqueNames = new Set(recentRoutes.map(r => r.name || r.destination).filter(Boolean))
    return {
      totalMiles: Math.round(totalMiles * 10) / 10,
      totalDrives: recentRoutes.length,
      uniqueRoutes: uniqueNames.size,
    }
  }, [recentRoutes])

  // Use database stats if available, otherwise fall back to local stats
  const displayStats = useMemo(() => {
    if (driverStats.totalDrives > 0) return driverStats
    if (localStats.totalDrives > 0) return localStats
    return driverStats
  }, [driverStats, localStats])

  // Edit state
  const [isEditing, setIsEditing] = useState(false)
  const [editDisplayName, setEditDisplayName] = useState('')
  const [editCar, setEditCar] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [showAllDrives, setShowAllDrives] = useState(false)
  const [historyCollapsed, setHistoryCollapsed] = useState(true)
  const [expandedDriveId, setExpandedDriveId] = useState(null)

  // Get display values from profile
  const displayName = profile?.display_name || user?.email?.split('@')[0] || 'Driver'
  const car = profile?.car || ''
  const avatarUrl = profile?.avatar_url || null
  const avatarInitial = displayName.charAt(0).toUpperCase()

  // Load stats and drive history on mount
  useEffect(() => {
    if (!user?.id) {
      setLoadingStats(false)
      return
    }

    const loadData = async () => {
      setLoadingStats(true)
      try {
        const [stats, logs] = await Promise.all([
          fetchDriverStats(user.id),
          fetchDriveLogs(user.id, 50), // Get more logs for collection tracking
        ])
        setDriverStats(stats)
        setDriveLogs(logs)
      } catch (error) {
        console.error('Failed to load profile data:', error)
      } finally {
        setLoadingStats(false)
      }
    }

    loadData()
  }, [user?.id])

  // Calculate collection progress
  const collectionProgress = useMemo(() => {
    const curatedRoutes = DISCOVERY_ROUTES.slice(0, 10) // First 10 are the curated collection
    const curatedSlugs = new Set(curatedRoutes.map(r => r.id))

    // Find which curated routes have been driven
    const drivenSlugs = new Set()
    driveLogs.forEach(log => {
      const routeSlug = log.routes?.slug || log.route_id
      if (routeSlug && curatedSlugs.has(routeSlug)) {
        drivenSlugs.add(routeSlug)
      }
    })

    return {
      total: curatedRoutes.length,
      driven: drivenSlugs.size,
      routes: curatedRoutes.map(route => ({
        id: route.id,
        name: route.name,
        abbreviation: getRouteAbbreviation(route.name),
        isDriven: drivenSlugs.has(route.id),
      })),
    }
  }, [driveLogs])

  // Get abbreviated route name
  function getRouteAbbreviation(name) {
    // Take first word or first two letters of each word
    const words = name.split(' ')
    if (words.length === 1) return words[0].substring(0, 6)
    return words.slice(0, 2).map(w => w.substring(0, 3)).join(' ')
  }

  // Format date for drive card
  const formatDate = (dateString) => {
    if (!dateString) return ''
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  // Start editing
  const handleStartEdit = () => {
    setEditDisplayName(displayName)
    setEditCar(car)
    setIsEditing(true)
  }

  // Cancel editing
  const handleCancelEdit = () => {
    setIsEditing(false)
    setEditDisplayName('')
    setEditCar('')
  }

  // Save profile changes
  const handleSaveProfile = async () => {
    if (!user?.id) return

    setIsSaving(true)
    try {
      const updates = {
        display_name: editDisplayName.trim() || displayName,
        car: editCar.trim(),
      }

      const updatedProfile = await updateProfile(user.id, updates)
      if (updatedProfile) {
        setProfile(updatedProfile)
      }
      setIsEditing(false)
    } catch (error) {
      console.error('Failed to update profile:', error)
    } finally {
      setIsSaving(false)
    }
  }

  // Sign out
  const handleSignOut = async () => {
    setIsSigningOut(true)
    try {
      await signOut()
    } catch (error) {
      console.error('Failed to sign out:', error)
      setIsSigningOut(false)
    }
  }

  const progressPercent = collectionProgress.total > 0
    ? (collectionProgress.driven / collectionProgress.total) * 100
    : 0

  return (
    <div style={styles.container}>
      {/* Profile Header */}
      <div style={styles.header}>
        <div style={styles.avatarContainer}>
          {avatarUrl ? (
            <img src={avatarUrl} alt="" style={styles.avatarImage} />
          ) : (
            <span style={styles.avatarInitial}>{avatarInitial}</span>
          )}
        </div>
        <div style={styles.headerInfo}>
          <h1 style={styles.displayName}>{displayName}</h1>
          {car && <p style={styles.carLabel}>{car}</p>}
          <button onClick={handleStartEdit} style={styles.editProfileLink}>
            Edit Profile
          </button>
        </div>
      </div>

      {/* Edit Profile Modal */}
      {isEditing && (
        <div style={styles.editCard}>
          <span style={styles.cardLabel}>EDIT PROFILE</span>
          <div style={styles.inputGroup}>
            <label style={styles.inputLabel}>Display Name</label>
            <input
              type="text"
              value={editDisplayName}
              onChange={(e) => setEditDisplayName(e.target.value)}
              placeholder="Your name"
              style={styles.input}
            />
          </div>
          <div style={styles.inputGroup}>
            <label style={styles.inputLabel}>Car</label>
            <input
              type="text"
              value={editCar}
              onChange={(e) => setEditCar(e.target.value)}
              placeholder="e.g. Miata ND2"
              style={styles.input}
            />
          </div>
          <div style={styles.buttonRow}>
            <button onClick={handleCancelEdit} disabled={isSaving} style={styles.cancelButton}>
              Cancel
            </button>
            <button onClick={handleSaveProfile} disabled={isSaving} style={styles.saveButton}>
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* Stats Row */}
      <div style={styles.statsRow}>
        <div style={styles.statCard}>
          <span style={styles.statValue}>
            {loadingStats ? '-' : Math.round(displayStats.totalMiles)}
          </span>
          <span style={styles.statLabel}>MILES</span>
        </div>
        <div style={styles.statCard}>
          <span style={styles.statValue}>
            {loadingStats ? '-' : displayStats.totalDrives}
          </span>
          <span style={styles.statLabel}>DRIVES</span>
        </div>
        <div style={styles.statCard}>
          <span style={styles.statValue}>
            {loadingStats ? '-' : displayStats.uniqueRoutes}
          </span>
          <span style={styles.statLabel}>ROUTES</span>
        </div>
      </div>

      {/* Collection Progress */}
      <div style={styles.section}>
        <span style={styles.sectionLabel}>NEW ENGLAND COLLECTION</span>

        <div style={styles.progressContainer}>
          <div style={styles.progressTrack}>
            <div
              style={{
                ...styles.progressFill,
                width: `${progressPercent}%`,
              }}
            />
          </div>
          <p style={styles.progressText}>
            {collectionProgress.driven} of {collectionProgress.total} routes driven
          </p>
        </div>

        {/* Route indicators - horizontal scroll */}
        <div style={styles.routeIndicatorScroll}>
          <div style={styles.routeIndicatorRow}>
            {collectionProgress.routes.map((route) => (
              <div key={route.id} style={styles.routeIndicator}>
                <div
                  style={{
                    ...styles.routeCircle,
                    background: route.isDriven ? '#E8622C' : 'transparent',
                    borderColor: route.isDriven ? '#E8622C' : '#666666',
                  }}
                >
                  {route.isDriven && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
                <span style={styles.routeAbbr}>{route.abbreviation}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Drive History Section - Collapsible */}
      <div style={styles.section}>
        {(() => {
          // Filter out meaningless 0-distance, 0-duration drives
          const validDrives = driveLogs.filter(drive =>
            (drive.distance_miles && drive.distance_miles > 0) ||
            (drive.duration_minutes && drive.duration_minutes > 0)
          )
          const driveCount = validDrives.length

          return (
            <>
              {/* Collapsible Header */}
              <button
                onClick={() => setHistoryCollapsed(!historyCollapsed)}
                style={styles.collapsibleHeader}
              >
                <div style={styles.collapsibleHeaderLeft}>
                  <span style={styles.sectionLabel}>DRIVE HISTORY</span>
                  <span style={styles.driveCountBadge}>({driveCount})</span>
                </div>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#666666"
                  strokeWidth="2"
                  style={{
                    transform: historyCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s ease',
                  }}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {/* Collapsible Content */}
              <div
                style={{
                  ...styles.collapsibleContent,
                  maxHeight: historyCollapsed ? '0px' : '2000px',
                  opacity: historyCollapsed ? 0 : 1,
                  overflow: 'hidden',
                  transition: 'max-height 0.3s ease, opacity 0.2s ease',
                }}
              >
                {loadingStats ? (
                  <div style={styles.emptyState}>
                    <p style={styles.emptyText}>Loading drives...</p>
                  </div>
                ) : driveCount === 0 ? (
                  <div style={styles.emptyState}>
                    <p style={styles.emptyText}>No drives yet. Hit the road.</p>
                  </div>
                ) : (
                  <div style={styles.driveList}>
                    {validDrives.map((drive) => {
                      const routeName = drive.routes?.name || 'Free Drive'
                      const routeSlug = drive.routes?.slug || drive.route_id
                      const isExpanded = expandedDriveId === drive.id
                      const isCuratedRoute = !!drive.routes?.name

                      return (
                        <button
                          key={drive.id}
                          onClick={() => setExpandedDriveId(isExpanded ? null : drive.id)}
                          style={{
                            ...styles.driveCard,
                            ...(isExpanded ? styles.driveCardExpanded : {}),
                          }}
                        >
                          {/* Collapsed view: route name + date only */}
                          <div style={styles.driveHeader}>
                            <span style={styles.driveName}>{routeName}</span>
                            <span style={styles.driveDate}>{formatDate(drive.started_at)}</span>
                          </div>

                          {/* Expanded view: full details */}
                          {isExpanded && (
                            <div style={styles.driveExpandedContent}>
                              {/* Stats row */}
                              <div style={styles.driveStatsExpanded}>
                                <div style={styles.driveStatItem}>
                                  <span style={styles.driveStatValue}>
                                    {drive.distance_miles?.toFixed(1) || '0'}
                                  </span>
                                  <span style={styles.driveStatLabel}>miles</span>
                                </div>
                                <div style={styles.driveStatItem}>
                                  <span style={styles.driveStatValue}>
                                    {drive.duration_minutes || 0}
                                  </span>
                                  <span style={styles.driveStatLabel}>min</span>
                                </div>
                                <div style={styles.driveStatItem}>
                                  <span style={styles.driveStatValue}>
                                    {drive.max_speed_mph?.toFixed(0) || '0'}
                                  </span>
                                  <span style={styles.driveStatLabel}>mph max</span>
                                </div>
                                <div style={styles.driveStatItem}>
                                  <span style={styles.driveStatValue}>
                                    {drive.avg_speed_mph?.toFixed(0) || '0'}
                                  </span>
                                  <span style={styles.driveStatLabel}>mph avg</span>
                                </div>
                              </div>

                              {/* Curated route link */}
                              {isCuratedRoute && routeSlug && (
                                <div style={styles.curatedRouteNote}>
                                  <span style={styles.curatedRouteText}>
                                    Curated route: {routeName}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </>
          )
        })()}
      </div>

      {/* Account Section */}
      <div style={styles.accountSection}>
        <div style={styles.divider} />
        <button
          onClick={handleSignOut}
          disabled={isSigningOut}
          style={{
            ...styles.signOutButton,
            opacity: isSigningOut ? 0.7 : 1,
          }}
        >
          {isSigningOut ? 'Signing out...' : 'Sign Out'}
        </button>
      </div>

      {/* Bottom spacer for tab bar */}
      <div style={{ height: '100px' }} />
    </div>
  )
}

const styles = {
  container: {
    minHeight: '100%',
    background: 'transparent',
    padding: '16px',
    paddingTop: 'calc(env(safe-area-inset-top, 20px) + 16px)',
  },

  // Header
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '16px',
    marginBottom: '24px',
  },
  avatarContainer: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    background: '#1A1A1A',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  avatarInitial: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: '24px',
    fontWeight: 300,
    color: '#FFFFFF',
  },
  headerInfo: {
    flex: 1,
    minWidth: 0,
    paddingTop: '4px',
  },
  displayName: {
    fontFamily: "'Outfit', sans-serif",
    fontSize: '24px',
    fontWeight: 300,
    color: '#FFFFFF',
    margin: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  carLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '12px',
    color: '#888888',
    margin: 0,
    marginTop: '4px',
  },
  editProfileLink: {
    background: 'none',
    border: 'none',
    padding: 0,
    marginTop: '8px',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '13px',
    color: '#666666',
    textDecoration: 'underline',
    cursor: 'pointer',
  },

  // Edit Card
  editCard: {
    background: '#111111',
    border: '1px solid #1A1A1A',
    borderRadius: '12px',
    padding: '16px',
    marginBottom: '24px',
  },
  cardLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '9px',
    fontWeight: 500,
    letterSpacing: '0.15em',
    color: '#666666',
    display: 'block',
    marginBottom: '16px',
  },
  inputGroup: {
    marginBottom: '12px',
  },
  inputLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '10px',
    fontWeight: 500,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: '#666666',
    display: 'block',
    marginBottom: '6px',
  },
  input: {
    width: '100%',
    padding: '12px 14px',
    borderRadius: '8px',
    border: '1px solid #1A1A1A',
    background: '#0A0A0A',
    color: '#FFFFFF',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
  },
  buttonRow: {
    display: 'flex',
    gap: '10px',
    marginTop: '16px',
  },
  cancelButton: {
    flex: 1,
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid #1A1A1A',
    background: 'transparent',
    color: '#888888',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  saveButton: {
    flex: 1,
    padding: '12px',
    borderRadius: '8px',
    border: 'none',
    background: '#E8622C',
    color: '#FFFFFF',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
  },

  // Stats Row
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '10px',
    marginBottom: '24px',
  },
  statCard: {
    background: '#111111',
    border: '1px solid #1A1A1A',
    borderRadius: '12px',
    padding: '16px 12px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
  },
  statValue: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: '36px',
    color: '#FFFFFF',
    lineHeight: 1,
    letterSpacing: '0.02em',
  },
  statLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '9px',
    fontWeight: 500,
    letterSpacing: '0.15em',
    color: '#666666',
    marginTop: '6px',
  },

  // Section
  section: {
    marginBottom: '24px',
  },
  sectionLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '9px',
    fontWeight: 500,
    letterSpacing: '0.15em',
    color: '#666666',
    display: 'block',
    marginBottom: '12px',
  },

  // Collection Progress
  progressContainer: {
    marginBottom: '16px',
  },
  progressTrack: {
    height: '6px',
    background: '#1A1A1A',
    borderRadius: '3px',
    overflow: 'hidden',
    marginBottom: '8px',
  },
  progressFill: {
    height: '100%',
    background: '#E8622C',
    borderRadius: '3px',
    transition: 'width 0.5s ease',
  },
  progressText: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '13px',
    color: '#888888',
    margin: 0,
  },
  routeIndicatorScroll: {
    overflowX: 'auto',
    WebkitOverflowScrolling: 'touch',
    scrollbarWidth: 'none',
    msOverflowStyle: 'none',
    margin: '0 -16px',
    padding: '0 16px',
  },
  routeIndicatorRow: {
    display: 'flex',
    gap: '16px',
    paddingBottom: '8px',
  },
  routeIndicator: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px',
    flexShrink: 0,
  },
  routeCircle: {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    border: '2px solid',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeAbbr: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '8px',
    fontWeight: 500,
    color: '#666666',
    textAlign: 'center',
    maxWidth: '48px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  // Empty State
  emptyState: {
    background: '#111111',
    border: '1px solid #1A1A1A',
    borderRadius: '12px',
    padding: '32px 16px',
    textAlign: 'center',
  },
  emptyText: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '14px',
    color: '#666666',
    margin: 0,
  },

  // Collapsible Header
  collapsibleHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    padding: '8px 0',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    marginBottom: '8px',
  },
  collapsibleHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  driveCountBadge: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '11px',
    color: '#666666',
  },
  collapsibleContent: {
    marginTop: '4px',
  },

  // Drive List
  driveList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  driveCard: {
    width: '100%',
    background: '#111111',
    border: '1px solid #1A1A1A',
    borderRadius: '12px',
    padding: '12px',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'all 0.2s ease',
  },
  driveCardExpanded: {
    borderLeft: '3px solid #E8622C',
    background: '#151515',
  },
  driveHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  driveName: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '14px',
    fontWeight: 500,
    color: '#FFFFFF',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    paddingRight: '12px',
  },
  driveDate: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '11px',
    color: '#666666',
    flexShrink: 0,
  },
  driveExpandedContent: {
    marginTop: '12px',
    paddingTop: '12px',
    borderTop: '1px solid #1A1A1A',
  },
  driveStatsExpanded: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '8px',
  },
  driveStatItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  driveStatValue: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '16px',
    fontWeight: 600,
    color: '#FFFFFF',
  },
  driveStatLabel: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '9px',
    color: '#666666',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginTop: '2px',
  },
  curatedRouteNote: {
    marginTop: '10px',
    padding: '8px 10px',
    background: 'rgba(232, 98, 44, 0.1)',
    borderRadius: '6px',
  },
  curatedRouteText: {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '12px',
    color: '#E8622C',
  },
  driveStats: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  driveStat: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '11px',
    color: '#888888',
  },
  driveStatDot: {
    width: '2px',
    height: '2px',
    borderRadius: '50%',
    background: '#444444',
  },
  showAllButton: {
    background: 'none',
    border: 'none',
    padding: '12px 0',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '13px',
    fontWeight: 500,
    color: '#E8622C',
    cursor: 'pointer',
    width: '100%',
    textAlign: 'center',
  },

  // Account Section
  accountSection: {
    marginTop: '16px',
  },
  divider: {
    height: '1px',
    background: '#1A1A1A',
    marginBottom: '16px',
  },
  signOutButton: {
    background: 'none',
    border: 'none',
    padding: 0,
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '14px',
    fontWeight: 500,
    color: '#ef4444',
    cursor: 'pointer',
  },
}
