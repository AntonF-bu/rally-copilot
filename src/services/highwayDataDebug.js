// ================================
// Highway Data Debug Utility
// 
// Dumps all detected bends, zones, and analysis
// in a format we can review and use to train AI
// ================================

/**
 * Dump all highway bend data to console in readable format
 */
export function dumpHighwayData(highwayBends, zones, routeData) {
  const totalDistance = routeData?.distance || 0
  const totalMiles = totalDistance / 1609.34
  
  console.log('\n' + '='.repeat(80))
  console.log('📊 HIGHWAY DATA DUMP')
  console.log('='.repeat(80))
  
  // Route overview
  console.log('\n📍 ROUTE OVERVIEW')
  console.log(`   Total distance: ${totalMiles.toFixed(1)} miles (${(totalDistance/1000).toFixed(1)} km)`)
  console.log(`   Total bends detected: ${highwayBends?.length || 0}`)
  console.log(`   Zones: ${zones?.length || 0}`)
  
  // Zone breakdown
  console.log('\n🗺️ ZONES')
  console.log('-'.repeat(60))
  zones?.forEach((zone, i) => {
    const startMi = (zone.startDistance / 1609.34).toFixed(1)
    const endMi = (zone.endDistance / 1609.34).toFixed(1)
    const lengthMi = ((zone.endDistance - zone.startDistance) / 1609.34).toFixed(1)
    console.log(`   ${i+1}. [${startMi} - ${endMi} mi] ${zone.character.toUpperCase()} (${lengthMi} mi)`)
  })
  
  // Sort bends by distance
  const sortedBends = [...(highwayBends || [])].sort((a, b) => 
    (a.distanceFromStart || 0) - (b.distanceFromStart || 0)
  )
  
  // All bends with full details
  console.log('\n🔄 ALL DETECTED BENDS')
  console.log('-'.repeat(60))
  console.log('   Mile | Type       | Dir   | Angle | Details')
  console.log('-'.repeat(60))
  
  sortedBends.forEach((bend, i) => {
    const mile = ((bend.distanceFromStart || 0) / 1609.34).toFixed(1).padStart(5)
    const type = (bend.isSection ? 'SECTION' : bend.isSSweep ? 'S-SWEEP' : 'SINGLE').padEnd(10)
    const dir = (bend.direction || '-').padEnd(5)
    const angle = bend.angle ? `${bend.angle}°`.padStart(5) : '  -  '
    
    let details = []
    if (bend.isSweeper) details.push('sweeper')
    if (bend.isSection) details.push(`${bend.bendCount} bends`)
    if (bend.length) details.push(`${(bend.length/1000).toFixed(2)}km`)
    if (bend.severity) details.push(`sev:${bend.severity}`)
    
    console.log(`   ${mile} | ${type} | ${dir} | ${angle} | ${details.join(', ')}`)
  })
  
  // Gap analysis
  console.log('\n📏 GAP ANALYSIS (straight sections)')
  console.log('-'.repeat(60))
  let lastMile = 0
  const gaps = []
  sortedBends.forEach(bend => {
    const mile = (bend.distanceFromStart || 0) / 1609.34
    const gap = mile - lastMile
    if (gap >= 3) {
      gaps.push({ start: lastMile, end: mile, length: gap })
    }
    lastMile = mile
  })
  // Check gap to end
  if (totalMiles - lastMile >= 3) {
    gaps.push({ start: lastMile, end: totalMiles, length: totalMiles - lastMile })
  }
  
  gaps.sort((a, b) => b.length - a.length).forEach((gap, i) => {
    console.log(`   ${i+1}. Mile ${gap.start.toFixed(1)} → ${gap.end.toFixed(1)}: ${gap.length.toFixed(1)} miles straight`)
  })
  
  // Difficulty analysis
  console.log('\n⚡ DIFFICULTY SPIKES')
  console.log('-'.repeat(60))
  for (let i = 1; i < sortedBends.length; i++) {
    const prev = sortedBends[i - 1]
    const curr = sortedBends[i]
    const prevAngle = prev.angle || 0
    const currAngle = curr.angle || 0
    
    if (currAngle - prevAngle >= 10 && currAngle >= 15) {
      const mile = ((curr.distanceFromStart || 0) / 1609.34).toFixed(1)
      console.log(`   Mile ${mile}: ${prevAngle}° → ${currAngle}° (+${currAngle - prevAngle}°)`)
    }
  }
  
  // Notable bends (15°+)
  console.log('\n🌟 NOTABLE BENDS (15°+)')
  console.log('-'.repeat(60))
  const notable = sortedBends.filter(b => b.angle >= 15 && !b.isSection)
  if (notable.length === 0) {
    console.log('   None detected')
  } else {
    notable.forEach(bend => {
      const mile = ((bend.distanceFromStart || 0) / 1609.34).toFixed(1)
      console.log(`   Mile ${mile}: ${bend.direction} ${bend.angle}°${bend.isSweeper ? ' (sweeper)' : ''}`)
    })
  }
  
  // Sections (grouped bends)
  console.log('\n📦 SECTIONS (grouped bends)')
  console.log('-'.repeat(60))
  const sections = sortedBends.filter(b => b.isSection)
  if (sections.length === 0) {
    console.log('   None detected')
  } else {
    sections.forEach(section => {
      const mile = ((section.distanceFromStart || 0) / 1609.34).toFixed(1)
      const lengthKm = ((section.length || 0) / 1000).toFixed(2)
      const bends = section.bends?.map(b => `${b.direction?.[0] || '?'}${b.angle || '?'}°`).join(' ') || ''
      console.log(`   Mile ${mile}: ${section.bendCount} bends over ${lengthKm}km [${bends}]`)
    })
  }
  
  // Summary stats
  console.log('\n📈 SUMMARY STATS')
  console.log('-'.repeat(60))
  const angles = sortedBends.filter(b => b.angle).map(b => b.angle)
  const avgAngle = angles.length ? (angles.reduce((a, b) => a + b, 0) / angles.length).toFixed(1) : 0
  const maxAngle = angles.length ? Math.max(...angles) : 0
  const minAngle = angles.length ? Math.min(...angles) : 0
  
  console.log(`   Bend count: ${sortedBends.length}`)
  console.log(`   Angle range: ${minAngle}° - ${maxAngle}°`)
  console.log(`   Average angle: ${avgAngle}°`)
  console.log(`   Sections: ${sections.length}`)
  console.log(`   Notable (15°+): ${notable.length}`)
  console.log(`   Gaps (3mi+): ${gaps.length}`)
  
  // Return structured data for AI training
  const structuredData = {
    route: {
      totalMiles: parseFloat(totalMiles.toFixed(1)),
      totalBends: sortedBends.length
    },
    zones: zones?.map(z => ({
      start: parseFloat((z.startDistance / 1609.34).toFixed(1)),
      end: parseFloat((z.endDistance / 1609.34).toFixed(1)),
      character: z.character
    })),
    bends: sortedBends.map(b => ({
      mile: parseFloat(((b.distanceFromStart || 0) / 1609.34).toFixed(1)),
      type: b.isSection ? 'section' : b.isSSweep ? 's-sweep' : 'single',
      direction: b.direction || null,
      angle: b.angle || null,
      isSweeper: b.isSweeper || false,
      bendCount: b.bendCount || null,
      lengthKm: b.length ? parseFloat((b.length / 1000).toFixed(2)) : null
    })),
    gaps: gaps.map(g => ({
      start: parseFloat(g.start.toFixed(1)),
      end: parseFloat(g.end.toFixed(1)),
      length: parseFloat(g.length.toFixed(1))
    })),
    notable: notable.map(b => ({
      mile: parseFloat(((b.distanceFromStart || 0) / 1609.34).toFixed(1)),
      direction: b.direction,
      angle: b.angle
    })),
    difficultySpikes: (() => {
      const spikes = []
      for (let i = 1; i < sortedBends.length; i++) {
        const prev = sortedBends[i - 1]
        const curr = sortedBends[i]
        const prevAngle = prev.angle || 0
        const currAngle = curr.angle || 0
        if (currAngle - prevAngle >= 10 && currAngle >= 15) {
          spikes.push({
            mile: parseFloat(((curr.distanceFromStart || 0) / 1609.34).toFixed(1)),
            from: prevAngle,
            to: currAngle
          })
        }
      }
      return spikes
    })()
  }
  
  console.log('\n📋 STRUCTURED DATA (for AI training)')
  console.log('-'.repeat(60))
  console.log(JSON.stringify(structuredData, null, 2))
  
  console.log('\n' + '='.repeat(80))
  console.log('END OF HIGHWAY DATA DUMP')
  console.log('='.repeat(80) + '\n')
  
  return structuredData
}
