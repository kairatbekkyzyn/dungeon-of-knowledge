import { useEffect, useState } from 'react'

interface Particle {
  id: number
  x: number
  y: number
  tx: number
  ty: number
  color: string
  size: number
}

interface ParticleEffectProps {
  x: number
  y: number
  colors?: string[]
  count?: number
  type?: 'burst' | 'damage' | 'heal' | 'xp'
  onComplete?: () => void
}

export function ParticleEffect({ x, y, colors, count = 12, type = 'burst', onComplete }: ParticleEffectProps) {
  const [particles, setParticles] = useState<Particle[]>([])

  useEffect(() => {
    const defaultColors = {
      burst: ['#e8a030', '#f59e0b', '#a78bfa'],
      damage: ['#ef4444', '#dc2626'],
      heal: ['#10b981', '#34d399'],
      xp: ['#38bdf8', '#06b6d4', '#0891b2'],
    }

    const selectedColors = colors || defaultColors[type]
    const newParticles = Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2
      const velocity = 40 + Math.random() * 60
      const tx = Math.cos(angle) * velocity
      const ty = Math.sin(angle) * velocity
      return {
        id: i,
        x,
        y,
        tx,
        ty,
        color: selectedColors[i % selectedColors.length],
        size: 4 + Math.random() * 4,
      }
    })
    setParticles(newParticles)

    const timer = setTimeout(() => {
      setParticles([])
      onComplete?.()
    }, 800)

    return () => clearTimeout(timer)
  }, [x, y, colors, count, type, onComplete])

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 999 }}>
      {particles.map(p => (
        <div
          key={p.id}
          className="particle"
          style={{
            left: p.x,
            top: p.y,
            width: p.size,
            height: p.size,
            borderRadius: '50%',
            background: p.color,
            '--tx': `${p.tx}px`,
            '--ty': `${p.ty}px`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  )
}
