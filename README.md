# Rally Co-Pilot 🏎️

A rally-style co-pilot app that gives audio callouts about upcoming road curves, designed for driving enthusiasts.

![Rally Co-Pilot](https://via.placeholder.com/800x400/0a0a0f/00d4ff?text=Rally+Co-Pilot)

## Features

- 🗺️ **Animated 3D Map** - Real-time position tracking with smooth camera follow
- 🎙️ **Voice Callouts** - Rally-style pace notes ("Left 3, tightens, 45")
- 🚗 **Three Driving Modes** - Cruise, Fast, Race with different speed recommendations
- ⚡ **GPS Lag Compensation** - Adjustable timing for accurate callouts
- 📍 **Curve Detection** - Severity rating 1-6 with modifiers (tightens, opens, hairpin)

## Quick Start

### 1. Get a Mapbox Token

1. Go to [mapbox.com](https://www.mapbox.com/) and create a free account
2. Copy your default public token from the dashboard

### 2. Install Dependencies

```bash
npm install
```

### 3. Add Your Mapbox Token

Open `src/components/Map.jsx` and replace:

```javascript
mapboxgl.accessToken = 'YOUR_MAPBOX_TOKEN_HERE'
```

with your actual token:

```javascript
mapboxgl.accessToken = 'pk.eyJ1Ijoi...' // Your token here
```

### 4. Run the App

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) on your phone or desktop.

## Deploy to Vercel

1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com)
3. Import your GitHub repo
4. Deploy!

Your app will be live at `your-project.vercel.app`

## Project Structure

```
rally-copilot/
├── src/
│   ├── components/
│   │   ├── Map.jsx           # Mapbox GL map with 3D terrain
│   │   ├── CalloutDisplay.jsx # Top overlay showing current curve
│   │   ├── BottomPanel.jsx   # Controls and upcoming curves
│   │   ├── SettingsPanel.jsx # Configuration options
│   │   └── VoiceIndicator.jsx
│   ├── hooks/
│   │   ├── useSpeech.js      # Text-to-speech
│   │   ├── useGeolocation.js # GPS tracking
│   │   └── useSimulation.js  # Demo mode
│   ├── data/
│   │   └── routes.js         # Mohawk Trail curve data
│   ├── store.js              # Zustand state management
│   ├── App.jsx
│   └── main.jsx
└── package.json
```

## Configuration

### Driving Modes

| Mode | Speed Multiplier | Callout Style |
|------|------------------|---------------|
| Cruise | 0.75× | Friendly, descriptive |
| Fast | 0.90× | Concise, rally-lite |
| Race | 1.0× | Full pace notes |

### Settings

- **Callout Timing**: 2-10 seconds before curve
- **GPS Lag Offset**: -3 to +3 seconds adjustment
- **Speed Unit**: MPH or KM/H
- **Voice**: Enable/disable callouts
- **Haptic**: Vibration on callout

## Roadmap

- [ ] Real Mapbox road geometry API integration
- [ ] Live GPS tracking (currently demo mode)
- [ ] Community road marketplace
- [ ] Drive recording & sharing
- [ ] Nearby drivers & convoy mode

## Tech Stack

- **React 18** - UI framework
- **Vite** - Build tool
- **Mapbox GL JS** - Maps and 3D terrain
- **Zustand** - State management
- **TailwindCSS** - Styling
- **Web Speech API** - Voice callouts

## License

MIT - Build cool stuff! 🚀
