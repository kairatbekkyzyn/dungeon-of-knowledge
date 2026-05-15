import { useCallback } from 'react'

export type SoundKey =
  | 'click'
  | 'hover'
  | 'bossEntrance'
  | 'correct'
  | 'wrong'
  | 'victory'
  | 'defeat'
  | 'forgeStart'
  | 'forgeComplete'
  | 'dungeonOpen'
  | 'toastSuccess'
  | 'toastError'
  | 'toastXp'

const soundMap: Record<SoundKey, string> = {
  click: '/sounds/ui-click.mp3',
  hover: '/sounds/ui-hover.mp3',
  bossEntrance: '/sounds/boss-entrance.mp3',
  correct: '/sounds/correct-hit.mp3',
  wrong: '/sounds/wrong-hit.mp3',
  victory: '/sounds/victory-fanfare.mp3',
  defeat: '/sounds/defeat-thud.mp3',
  forgeStart: '/sounds/forge-start.mp3',
  forgeComplete: '/sounds/forge-complete.mp3',
  dungeonOpen: '/sounds/dungeon-open.mp3',
  toastSuccess: '/sounds/toast-success.mp3',
  toastError: '/sounds/toast-error.mp3',
  toastXp: '/sounds/toast-xp.mp3',
}

export const useSound = () => {
  const playSound = useCallback((key: SoundKey, volume = 0.8, playbackRate = 1) => {
    if (typeof window === 'undefined' || !('Audio' in window)) {
      console.warn('[useSound] Audio not supported in this environment.')
      return
    }
    const src = soundMap[key]
    const audio = new Audio(src)
    audio.preload = 'auto'
    audio.volume = Math.max(0, Math.min(1, volume))
    audio.playbackRate = playbackRate
    audio.muted = false
    audio.addEventListener('error', () => {
      console.warn(`[useSound] Failed to load audio file: ${src}`)
    })
    audio.play().catch(err => {
      console.warn('[useSound] Audio play failed:', err)
    })
  }, [])

  return { playSound }
}
