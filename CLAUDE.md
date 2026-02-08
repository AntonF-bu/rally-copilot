# CLAUDE.md — Tramo Project Knowledge

> This file is the institutional memory for Claude Code sessions working on Tramo.
> Read this first. Base all architectural decisions on what's documented here.

---

## 1. Project Overview

**Tramo** (formerly Rally Co-Pilot) is a driving companion app that delivers rally-style pace note callouts for public roads. Think of it as having a professional co-driver reading ahead on every drive.

### Tech Stack
- **React 18** + **Vite 5.1** — UI framework and build tool
- **Tailwind CSS 3.4** — Styling
- **Mapbox GL JS 3.3** — Maps and 3D terrain visualization
- **Zustand 4.5** — Global state management (persisted)
- **ElevenLabs** — Text-to-speech API for natural voice callouts
- **Supabase** — Backend, authentication, and database
- **Turf.js 7.0** — Geospatial calculations

### Deployment
- **Vercel** — Hosting and serverless functions
- **Target Platform**: PWA for iOS Safari with CarPlay audio support

### Key Files
```
package.json          # Version 0.1.0
vite.config.js        # Minimal Vite + React config
src/store.js          # Zustand store - central state
src/App.jsx           # Main navigation controller (v22)
```

---

## 2. Architecture — The Golden Rule

### Core Principle: Pre-compute Everything

**RoutePreview is the brain.** It pre-analyzes the entire route BEFORE navigation starts:
- Curves, zones, highway bends, chatter timeline — ALL computed in RoutePreview
- Results stored in Zustand for navigation to consume
- Navigation components are **dumb consumers** — they just fire callouts at trigger distances

**Why?** iOS Safari is resource-constrained. Real-time computation during navigation causes audio glitches and UI jank. Everything must be pre-computed.

### Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         ROUTE PREVIEW PHASE                             │
│                   (useRouteAnalysisPipeline.js)                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Route Selected                                                         │
│       ↓                                                                 │
│  roadFlowAnalyzer.js                                                    │
│       └─→ Sample GPS coords, detect heading changes, identify curves   │
│       ↓                                                                 │
│  simpleZoneClassifier.js                                                │
│       └─→ Classify zones: urban / transit (highway) / technical        │
│       ↓                                                                 │
│  ruleBasedCalloutFilter.js::filterEventsToCallouts()                    │
│       └─→ Apply zone thresholds, generate callout text                 │
│       ↓                                                                 │
│  ruleBasedCalloutFilter.js::mergeCloseCallouts()                        │
│       └─→ Chain nearby curves in technical zones                       │
│       ↓                                                                 │
│  highwayChatterService.js::generateChatterTimeline()                    │
│       └─→ LLM generates companion chatter for highway stretches        │
│       ↓                                                                 │
│  Store Results in Zustand:                                              │
│       • curatedHighwayCallouts  (pre-merged, sorted callout list)       │
│       • routeZones              (zone boundaries with distances)         │
│       • chatterTimeline         (pre-generated chatter items)            │
│       • highwayBends            (highway-specific bend data)            │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                        NAVIGATION PHASE                                 │
│                           (App.jsx)                                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  GPS/Simulation Position Updates                                        │
│       ↓                                                                 │
│  Calculate userDistanceAlongRoute                                       │
│       ↓                                                                 │
│  Zone Detection                                                         │
│       └─→ Match distance to zone boundaries                            │
│       └─→ Update currentMode (HIGHWAY/TECHNICAL/URBAN)                  │
│       ↓                                                                 │
│  Callout Firing (threshold crossing)                                    │
│       └─→ When distance crosses triggerDistance, fire callout          │
│       └─→ Higher priority interrupts lower priority                     │
│       ↓                                                                 │
│  Chatter Firing (highway zones only)                                    │
│       └─→ Check pre-generated chatterTimeline                          │
│       └─→ Fire if conditions met (cooldown, no callout nearby)         │
│       ↓                                                                 │
│  useSpeech.js                                                           │
│       └─→ cleanForSpeech() converts degrees to rally scale             │
│       └─→ ElevenLabs TTS or native speech fallback                     │
│       └─→ Audio playback with priority system                          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Zone System

Three zone types control callout behavior:

| Zone | Character | Behavior | Callout Style |
|------|-----------|----------|---------------|
| **Urban** | `urban` | Minimal callouts, safety-focused | Only 70°+ turns announced |
| **Transit/Highway** | `transit` | Moderate callouts, chatter fills silence | 20°+ curves, zone briefings |
| **Technical** | `technical` | Full rally co-driver mode | 12°+ curves, merged chains |

### Zone Classification Logic (`simpleZoneClassifier.js`)

1. **Highway-grade names** (Turnpike, Expressway, I-XX) → `transit` (always)
2. **Interstate / US Highway** → `transit`
3. **State Route / Local Road** → `technical`
4. **Gaps near highways** → `technical` (ramps)
5. **Urban overlay** — Technical zones in dense cities become `urban`

### Zone Constants (`zoneService.js`)
```javascript
ROUTE_CHARACTER = {
  TECHNICAL: 'technical',   // Twisty fun roads
  TRANSIT: 'transit',       // Highway cruising
  URBAN: 'urban'            // City driving
}
```

---

## 4. Rally Scale System

### Degree-to-Rally-Scale Conversion (`useSpeech.js::cleanForSpeech()`)

| Degrees | Rally Scale | Notes |
|---------|-------------|-------|
| 180°+ | `hairpin` | Hairpin turn |
| 120-179° | `1` | Very tight |
| 80-119° | `2` | Tight |
| 60-79° | `3` | Medium-tight |
| 40-59° | `4` | Medium |
| 20-39° | `5` | Easy |
| <20° | `6` | Very gentle, gets "flat out" suffix |

### Conversion Examples
```
Input: "CAUTION - Hard left 180°" → Output: "Hairpin left"
Input: "CAUTION - Left 88°"       → Output: "Left 2"
Input: "Right 31°"                → Output: "Right 5"
Input: "Left 12°"                 → Output: "Left 6, flat out"
Input: "Left 29°, Right 31°"      → Output: "Left 5, into right 5"
```

### Key Rules
- Severity prefixes (`CAUTION`, `HARD`, `SHARP`, `EASY`, `SLIGHT`) are stripped
- Merged chains use "into" connectors: "Left 3, into right 5, into hairpin left"
- Severity 6 gets ", flat out" suffix (unless in a compound/merged chain)
- `max N°` in esses becomes `tightest N` (e.g., "max 32°" → "tightest 5")

---

## 5. Speech System (`useSpeech.js`)

### Main Functions
- **`speak(text, priority)`** — Main entry point. Cleans text, manages priority, calls TTS
- **`cleanForSpeech(text)`** — Converts raw callout to speech-friendly format (rally scale)
- **`initAudio()`** — Unlocks iOS audio (must call on user interaction before navigation)
- **`stop()`** — Stops current playback

### Priority System
```javascript
PRIORITY_VALUES = {
  'low': 0,      // chatter
  'normal': 1,   // zone announcements
  'high': 2      // curve callouts
}
```
- Higher priority **interrupts** lower priority playback
- Same priority can interrupt same priority
- Lower priority gets **skipped** if higher is playing

### Duplicate Detection
- Same text within 1.5 seconds is blocked

### TTS Stack
1. **ElevenLabs** (primary) — Via `/api/tts` serverless function
2. **Web Speech API** (fallback) — Native browser TTS

### iOS Audio Unlock
```javascript
// CRITICAL: Must call initAudio() from user interaction before navigation
await initAudio()  // Called in handleStartNavigation() and handleStartSimulation()
```

---

## 6. Callout Firing Logic (`App.jsx`)

### Trigger Mechanism
Callouts fire when user distance **crosses** the trigger distance (threshold crossing):
```javascript
const overshoot = userDist - calloutTriggerDistance
// Fire if: crossed (overshoot >= 0) but not too far past (< 500m)
```

### Adaptive Lookahead
Speed-based lookahead for upcoming callouts:
```javascript
const lookaheadMeters = Math.max(80, currentSpeedMph * 2)
// At 60mph: ~120m, at 90mph: ~180m
```

### Zone-Based Throttling
```javascript
const minInterval = zone.character === 'technical' ? 2000
                  : zone.character === 'urban' ? 3000
                  : 4000  // highway
```

### Seek Suppression
When user scrubs/jumps in simulation:
1. Detect jump: `jumpDistance > seekThreshold` (800m+ or 15x speed)
2. Mark all passed callouts as "played silently"
3. Fire only the most recent crossed callout

### Distance State Protection
```javascript
distanceStateRef = {
  prevDist: 0,
  initialized: false,
  navigationId: null,  // unique per nav session
  lastValidDist: 0     // guards against resets
}
```

---

## 7. Chatter System

### Pre-Generation (`highwayChatterService.js`)
- Generated during RoutePreview via LLM (Claude or OpenAI)
- Timeline of trigger points along highway zones
- Spaced ~2.5 miles apart
- Variants per speed bracket: slow/cruise/spirited/fast/flying

### Runtime Firing (`App.jsx` + `useHighwayMode.js`)
```javascript
// Check every 100m in highway zones
if (Math.abs(currentDist - lastChatterCheckRef.current) < 100) return

// Only in highway mode
if (currentMode !== DRIVING_MODE.HIGHWAY) return

// Don't fire within 400m of a curated callout
if (currentDist - lastCuratedSpeakDistRef.current < 400) return

// Don't fire if callout coming within 300m
const nextCurated = curatedHighwayCallouts?.find(...)
if (nextCurated) return

// Cooldown: 8 seconds between chatter
if (now - lastChatterTime < 8000) return
```

### Speed Variants
```javascript
SPEED_BRACKETS = {
  SLOW: 'slow',           // < 55 mph
  CRUISE: 'cruise',       // 55-70 mph
  SPIRITED: 'spirited',   // 70-85 mph
  FAST: 'fast',           // 85-100 mph
  FLYING: 'flying'        // 100+ mph
}
```

---

## 8. Merge System (`ruleBasedCalloutFilter.js::mergeCloseCallouts()`)

### Purpose
Real co-drivers chain close curves: "Left 3, into right 5, into hairpin left"

### Rules
- Only operates in **technical zones**
- Merges curves within **250m** of each other
- Max chain length: **3 curves**
- Fires **50m earlier** per additional curve in chain
- Only merges **curve callouts** (not zone announcements, chatter)

### Example
```
Before merge:
  1. Right 5 @ 1200m
  2. Left 4 @ 1350m
  3. Hairpin left @ 1500m

After merge:
  1. "Right 5, Left 4, Hairpin left" @ 1100m (fires 100m earlier)
```

---

## 9. Key Files Quick Reference

| File | Purpose | Key Functions |
|------|---------|---------------|
| `src/App.jsx` | Main navigation controller (v22) | Zone detection, callout firing, chatter |
| `src/store.js` | Zustand store | `setCuratedHighwayCallouts`, `setRouteZones` |
| `src/hooks/useSpeech.js` | TTS + rally scale conversion | `speak()`, `cleanForSpeech()`, `initAudio()` |
| `src/hooks/useHighwayMode.js` | Highway zone tracking | `getChatter()`, `getUpcomingBend()` |
| `src/hooks/useSimulation.js` | Demo mode simulation | GPS simulation |
| `src/hooks/useGeolocation.js` | Real GPS tracking | Live position updates |
| `src/services/calloutEngine.js` | Warning distances, mode enum | `DRIVING_MODE`, `getWarningDistances()` |
| `src/services/ruleBasedCalloutFilter.js` | Curve→callout conversion | `filterEventsToCallouts()`, `mergeCloseCallouts()` |
| `src/services/roadFlowAnalyzer.js` | Raw curve detection | `analyzeRoadFlow()` |
| `src/services/simpleZoneClassifier.js` | Zone classification | `classifyZones()`, `reassignEventZones()` |
| `src/services/zoneService.js` | Zone constants, colors | `ROUTE_CHARACTER`, `CHARACTER_COLORS` |
| `src/services/highwayChatterService.js` | LLM chatter generation | `generateChatterTimeline()` |
| `src/services/smartChatter.js` | Runtime chatter logic | `getSmartChatter()`, `resetChatterSession()` |
| `src/services/highwayStore.js` | Highway mode settings | `HIGHWAY_MODE`, `highwayFeatures` |
| `src/services/highwayModeService.js` | Highway bend detection | `analyzeHighwayBends()` |
| `src/components/RoutePreview/hooks/useRouteAnalysisPipeline.js` | Analysis orchestrator | Full pipeline execution |

---

## 10. Debugging

### Enable Verbose Logging
```javascript
window.__TRAMO_VERBOSE = true
```

### Default Logging (Event-Driven)
Without verbose flag, only key events log:
- 🔊 Callout spoken
- 🎙️ Chatter fired
- 🎯 Zone changed
- 📢 Zone briefing

### Console Emoji Guide
| Emoji | Meaning |
|-------|---------|
| 🔊 | Callout spoken |
| 🎙️ | Chatter fired |
| 🎯 | Zone change |
| 📢 | Zone briefing |
| ⏹️ | Speech interrupted |
| ⏭️ | Speech skipped (low priority) |
| 🔗 | Merge operation |
| 📋 | Summary block |
| ⚠️ | Warning |
| ⏱️ | Runtime summary (every 60s) |
| 🏁 | Navigation complete |

### Route Preview Summary
After analysis completes, logs:
```
============================================================
📋 ROUTE PREVIEW SUMMARY
============================================================
🗺️  Zones: technical(0.0-2.5mi) → transit(2.5-15.0mi) → ...
📍 Callouts: 47 total
   By zone: technical=23, transit=18, urban=6
   By type: curve=35, danger=8, sequence=4
🔗 Merged: 5 chains (12 curves combined)
💬 Chatter: 8 items queued
============================================================
```

### Runtime Summary (Every 60s)
```
⏱️ 12.5mi | 68mph | HIGHWAY | spoken:3 chatter:1 remaining:24
```

### Debug Data Access
```javascript
window.__roadFlowData      // Road flow analysis results
window.__highwayDebugData  // Highway bend analysis
window.__ruleBasedCallouts // Rule-based filter output
window.__chatterTimeline   // Generated chatter items
window.__groupedCallouts   // Speed-grouped callout sets
```

### Test Functions
```javascript
window.testCleanForSpeech()  // Run unit tests for rally scale conversion
```

---

## 11. Things NOT to Break

**These behaviors are critical. Preserve them across all changes:**

1. **Rally 1-6 scale conversion** — No English descriptors like "sharp" or "hard" in spoken output
2. **Seek suppression** — No false callout floods when user jumps position
3. **Zone detection accuracy** — Road names are authoritative for classification
4. **Lookahead timing** — Adaptive based on speed (~80-120m at 60mph)
5. **"Flat out" suffix** — Only on severity 6 curves, not in chains
6. **Merged chain "into" connectors** — Only in technical zones
7. **Speech priority system** — curve > zone > chatter
8. **Pre-computation in RoutePreview** — Zero computation during navigation
9. **iOS audio unlock** — `initAudio()` must be called from user interaction
10. **Distance state guards** — Prevent resets during navigation

---

## 12. Common Pitfalls

**Things that have caused bugs before:**

1. **`cleanForSpeech()` order matters** — Must convert degrees→rally BEFORE stripping severity prefixes, and must handle merged comma-separated chains

2. **Chatter has multiple gates** — Feature flag, zone check, cooldown, distance check. All must pass.

3. **`useHighwayMode.js` zone tracking lags** — Always prefer `currentMode` in App.jsx over `inHighwayZone` from the hook

4. **Don't gate chatter on `highwayFeatures.chatter`** — This flag defaults to `false` in BASIC mode. App.jsx checks `currentMode` directly.

5. **Distance units are mixed** — Some variables are meters, some are miles. Always verify.

6. **Zustand persists highway settings** — Stale persisted values can override code changes. Check `highwayStore.js` partialize.

7. **iOS Safari audio rules** — Audio must be initiated from user interaction. Always call `initAudio()` before navigation.

8. **Zone objects have both units** — `startDistance`/`endDistance` (meters) AND `startMile`/`endMile` (miles)

9. **triggerDistance can be 0** — Always check: `c.triggerDistance > 0 ? c.triggerDistance : (c.triggerMile * 1609.34)`

10. **Callouts must be sorted** — After any processing, sort by triggerDistance ascending

---

## 13. Brand & Design

### Colors
- **Primary accent**: Rally Orange `#E8622C`
- **Deep background**: `#080B12`
- **Card background**: `rgba(16, 20, 30, 0.85)`

### Zone Colors
```javascript
zones: {
  technical: '#00E68A',  // Green
  transit: '#66B3FF',    // Blue
  urban: '#FF668C'       // Pink
}
```

### Typography
- **Primary**: Sora (headings + UI)
- **Mono**: JetBrains Mono (data, labels)

### Design Inspiration
Dark premium aesthetic with topographic textures. References: WHOOP, Suunto, Porsche driving apps.

### Theme File
`src/styles/theme.js` — Contains color tokens, fonts, glass effects (deprecated, now using brand.css)

---

## 14. Current State & Recent History

### Development Round: 7B (as of last commit)

### Recent Commits (most recent first)
```
dd97940 Round 7B: Zone briefings, chatter fix, debug overhaul
959296e Round 7: Five fixes + debug summary system
f1bfd4b Round 6: Fix chatter, merge close callouts, add speech interrupts
4f3e276 Round 5: Callout system enrichment - Rally co-driver experience
23b2dde Fix root cause + 4 callout system bugs - Round 4
```

### What Was Fixed Recently
- Zone briefings with context-aware detail
- Chatter gates (removed over-restrictive checks)
- Debug logging overhaul (verbose flag, summaries)
- Speech priority interrupts
- Merge close callouts in technical zones
- Seek suppression for simulation scrubbing
- Distance anomaly guards

### Current Focus
The callout system is stabilized. Recent work focused on:
1. Making callouts feel like a real rally co-driver
2. Zone briefings that adapt to zone type
3. Chatter that fires reliably in highway zones
4. Debug tooling for faster issue diagnosis

---

## 15. Environment & API Keys

### Required Environment Variables
```bash
VITE_MAPBOX_TOKEN         # Mapbox GL API token
VITE_ELEVENLABS_API_KEY   # ElevenLabs TTS API (optional, falls back to native)
VITE_SUPABASE_URL         # Supabase project URL
VITE_SUPABASE_ANON_KEY    # Supabase anonymous key
VITE_OPENAI_API_KEY       # OpenAI API for chatter generation (optional)
VITE_ANTHROPIC_API_KEY    # Claude API for chatter generation (optional)
```

### API Cost Considerations
- **ElevenLabs**: Charged per character. Caches blob URLs to reduce repeat calls.
- **Mapbox**: Charged per tile load and direction request
- **OpenAI/Anthropic**: Used only for chatter generation in COMPANION mode

### Preloading
`preloadCopilotVoices()` in useSpeech.js pre-fetches common callouts to reduce latency.

---

## 16. Build & Run

```bash
# Install dependencies
npm install

# Development server
npm run dev

# Production build
npm run build

# Preview production build
npm run preview
```

### PWA Manifest
Located at `public/manifest.json` for iOS Add to Home Screen support.

---

## 17. Highway Modes

### BASIC Mode
- Sweeper callouts only
- Progress milestones
- No chatter

### COMPANION Mode
- Full engagement: sweepers + chatter
- LLM-generated contextual commentary
- Speed-reactive variants

Toggle in `highwayStore.js::setHighwayMode()`.

---

*Last updated: Based on codebase as of commit dd97940*
