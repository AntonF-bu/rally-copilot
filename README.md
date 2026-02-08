# Tramo

Your AI co-driver for every road. A rally-style co-pilot app that gives audio callouts about upcoming road curves, designed for driving enthusiasts.

## Features

- **Animated 3D Map** - Real-time position tracking with smooth camera follow
- **Voice Callouts** - Rally-style pace notes ("Left 3, tightens, 45")
- **Three Driving Modes** - Cruise, Fast, Race with different speed recommendations
- **GPS Lag Compensation** - Adjustable timing for accurate callouts
- **Curve Detection** - Severity rating 1-6 with modifiers (tightens, opens, hairpin)

## Quick Start

### 1. Get a Mapbox Token

1. Go to [mapbox.com](https://www.mapbox.com/) and create a free account
2. Copy your default public token from the dashboard

### 2. Install Dependencies

```bash
npm install
```

### 3. Add Your Mapbox Token

Create a `.env` file with:

```
VITE_MAPBOX_TOKEN=pk.eyJ1Ijoi...
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

## Tech Stack

- **React 18** - UI framework
- **Vite** - Build tool
- **Mapbox GL JS** - Maps and 3D terrain
- **Zustand** - State management
- **TailwindCSS** - Styling
- **Web Speech API** - Voice callouts
- **Supabase** - Backend and auth

## Documentation

See [CLAUDE.md](./CLAUDE.md) for detailed architecture documentation.

## License

MIT
