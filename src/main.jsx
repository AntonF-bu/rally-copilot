import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/index.css'
import './styles/brand.css'

const FreeDriveTest = lazy(() => import('./components/FreeDriveTest'))

const isFreeDriveTest = window.location.search.includes('freedrivetest')

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isFreeDriveTest ? (
      <Suspense fallback={<div style={{ background: '#0a0e18', color: '#888', padding: '40px', fontFamily: 'monospace' }}>Loading Free Drive Test...</div>}>
        <FreeDriveTest />
      </Suspense>
    ) : (
      <App />
    )}
  </React.StrictMode>,
)
