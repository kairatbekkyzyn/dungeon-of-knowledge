import { useState, useCallback } from 'react'

export interface AnimationState {
  type: 'damage' | 'heal' | 'critical' | 'level-up' | 'combo' | 'success' | 'error' | null
  intensity: number
}

export const useGameAnimations = () => {
  const [animation, setAnimation] = useState<AnimationState>({ type: null, intensity: 1 })

  const triggerAnimation = useCallback((type: AnimationState['type'], intensity = 1) => {
    setAnimation({ type, intensity })
    if (type) {
      setTimeout(() => setAnimation({ type: null, intensity: 1 }), 600)
    }
  }, [])

  return { animation, triggerAnimation }
}

export const getShakeClass = (intensity: number = 1) => {
  return intensity > 1.5 ? 'shake-strong' : intensity > 0.5 ? 'door-shake' : ''
}

export const getParticleCount = (damage: number) => {
  if (damage > 50) return 24
  if (damage > 30) return 18
  if (damage > 10) return 12
  return 8
}

export const getParticleColors = (type: 'damage' | 'heal' | 'xp' | 'crit') => {
  const colors: Record<string, string[]> = {
    damage: ['#ef4444', '#dc2626', '#f87171'],
    heal: ['#10b981', '#34d399', '#6ee7b7'],
    xp: ['#38bdf8', '#06b6d4', '#f59e0b'],
    crit: ['#a78bfa', '#c084fc', '#e9d5ff'],
  }
  return colors[type]
}
