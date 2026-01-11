// ================================
// Voice Parameters Service
// Dynamic ElevenLabs settings based on driving mode
// ================================

import { VOICE_CONFIG, DRIVING_MODE } from './calloutEngine'

/**
 * Get ElevenLabs voice settings for a driving mode
 */
export function getVoiceSettings(mode) {
  const config = VOICE_CONFIG[mode] || VOICE_CONFIG.spirited
  
  // Map our config to ElevenLabs API parameters
  return {
    stability: config.stability,
    similarity_boost: 0.80,
    style: getStyleValue(config.style),
    use_speaker_boost: true
  }
}

/**
 * Convert style name to numeric value for ElevenLabs
 */
function getStyleValue(style) {
  const styles = {
    relaxed: 0.1,   // Very consistent, calm
    casual: 0.15,
    alert: 0.2,     // Slightly more expressive
    rapid: 0.25     // More urgent variation
  }
  return styles[style] || 0.15
}

/**
 * Get speech rate multiplier (for native speech or playback speed)
 */
export function getSpeechRate(mode) {
  const config = VOICE_CONFIG[mode] || VOICE_CONFIG.spirited
  return config.speed
}

/**
 * Get minimum pause between callouts (ms)
 */
export function getMinPauseBetween(mode, userSpeedRatio = 1.0) {
  const config = VOICE_CONFIG[mode] || VOICE_CONFIG.spirited
  let pause = config.minPauseBetween
  
  // If user pushing hard, reduce pause
  if (userSpeedRatio > 1.15) {
    pause *= 0.8
  }
  
  return Math.max(pause, 1000) // Never less than 1 second
}

/**
 * Get all voice parameters for a mode
 */
export function getVoiceParamsForMode(mode, userSpeedRatio = 1.0) {
  const config = VOICE_CONFIG[mode] || VOICE_CONFIG.spirited
  
  return {
    // ElevenLabs settings
    elevenLabs: getVoiceSettings(mode),
    
    // Playback/timing settings
    speechRate: config.speed * (userSpeedRatio > 1.15 ? 1.1 : 1.0),
    minPause: getMinPauseBetween(mode, userSpeedRatio),
    
    // Style info
    style: config.style,
    mode: mode
  }
}

/**
 * Determine if we should speed up based on conditions
 */
export function shouldSpeedUpVoice(mode, userSpeed, expectedSpeed, timePressure = false) {
  // Always speed up in technical mode when user is pushing
  if (mode === DRIVING_MODE.TECHNICAL) {
    if (userSpeed > expectedSpeed * 1.1 || timePressure) {
      return true
    }
  }
  
  // Speed up if multiple callouts queued
  if (timePressure) {
    return true
  }
  
  return false
}

export default {
  getVoiceSettings,
  getSpeechRate,
  getMinPauseBetween,
  getVoiceParamsForMode,
  shouldSpeedUpVoice
}
