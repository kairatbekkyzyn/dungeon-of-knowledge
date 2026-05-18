/**
 * DungeonRoadMap.tsx
 *
 * Drop-in replacement for the dungeon "map" phase in DungeonInterior.tsx.
 *
 * USAGE — inside DungeonInterior.tsx, replace your existing room-grid/map JSX with:
 *
 *   import DungeonRoadMap from './DungeonRoadMap'
 *
 *   // inside the 'map' phase render:
 *   <DungeonRoadMap
 *     rooms={rooms}
 *     dungeonTitle={dungeon.title}
 *     bossUnlocked={dungeon.boss_unlocked}
 *     onSelectRoom={(room) => { ... your existing room-select logic ... }}
 *     onBossChallenge={() => { ... your existing boss logic ... }}
 *   />
 *
 * The component is self-contained – it only needs the props below and
 * the CSS variables already defined in index.css.
 */

import { useRef, useEffect, useState } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Room {
  topic: string
  mastery: number
  state: string           // 'new' | 'in_progress' | 'mastered'
  question_count?: number
  accessible?: boolean
}

interface DungeonRoadMapProps {
  rooms: Room[]
  dungeonTitle: string
  bossUnlocked?: boolean
  onSelectRoom: (room: Room) => void
  onBossChallenge?: () => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function lerp(a: number, b: number, t: number) { return a + (b - a) * t }

/** Build a smooth SVG path that snakes left-right through the stop points */
function buildSvgPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return ''
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]
    const curr = points[i]
    const cy = lerp(prev.y, curr.y, 0.5)
    d += ` C ${prev.x} ${cy}, ${curr.x} ${cy}, ${curr.x} ${curr.y}`
  }
  return d
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function RoadStop({
  room,
  index,
  x,
  y,
  isLast,
  isBoss,
  onClick,
  animDelay,
}: {
  room?: Room
  index: number
  x: number
  y: number
  isLast?: boolean
  isBoss?: boolean
  onClick: () => void
  animDelay: number
}) {
  const [hovered, setHovered] = useState(false)
  const [popped,  setPopped]  = useState(false)

  // entrance pop
  useEffect(() => {
    const t = setTimeout(() => setPopped(true), animDelay)
    return () => clearTimeout(t)
  }, [animDelay])

  const mastery  = room?.mastery ?? 0
  const state    = room?.state   ?? 'new'
  const accessible = room?.accessible !== false

  const bgColor =
    isBoss            ? 'radial-gradient(135deg at 30% 30%, #c0392b, #7b0d0d)'  :
    state === 'mastered'    ? 'radial-gradient(135deg at 30% 30%, #10b981, #065f46)'  :
    state === 'in_progress' ? 'radial-gradient(135deg at 30% 30%, #f59e0b, #92400e)'  :
    accessible              ? 'radial-gradient(135deg at 30% 30%, #334155, #1e293b)'  :
                              'radial-gradient(135deg at 30% 30%, #1e1e2e, #0f0f1a)'

  const glowColor =
    isBoss            ? 'rgba(192,57,43,0.7)'  :
    state === 'mastered'    ? 'rgba(16,185,129,0.6)' :
    state === 'in_progress' ? 'rgba(245,158,11,0.6)' : 'rgba(255,255,255,0.05)'

  const icon =
    isBoss            ? '👹' :
    state === 'mastered'    ? '✅' :
    state === 'in_progress' ? '⚔️' :
    accessible              ? '🔓' : '🔒'

  const size    = isBoss ? 72 : 60
  const label   = isBoss ? 'BOSS' : room?.topic ?? ''
  const shortLabel = label.length > 18 ? label.slice(0, 16) + '…' : label

  // mastery ring
  const r     = (size - 10) / 2
  const circ  = 2 * Math.PI * r
  const ringColor =
    state === 'mastered'    ? '#10b981' :
    state === 'in_progress' ? '#f59e0b' : 'rgba(255,255,255,0.1)'

  return (
    <g
      style={{ cursor: accessible || isBoss ? 'pointer' : 'default' }}
      onClick={() => (accessible || isBoss) && onClick()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      transform={`translate(${x - size / 2}, ${y - size / 2})`}
    >
      {/* Glow blob behind circle */}
      {(hovered || state === 'mastered' || isBoss) && (
        <circle
          cx={size / 2} cy={size / 2} r={size / 2 + 10}
          fill={glowColor}
          style={{
            filter: 'blur(12px)',
            opacity: hovered ? 0.9 : 0.5,
            transition: 'opacity 0.3s',
          }}
        />
      )}

      {/* Outer ring (mastery) */}
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none"
        stroke="rgba(255,255,255,0.06)"
        strokeWidth={5}
      />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none"
        stroke={ringColor}
        strokeWidth={5}
        strokeDasharray={circ}
        strokeDashoffset={circ * (1 - mastery)}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 1s ease 0.3s' }}
      />

      {/* Main circle */}
      <foreignObject x={5} y={5} width={size - 10} height={size - 10}>
        <div
          style={{
            width: '100%', height: '100%', borderRadius: '50%',
            background: bgColor,
            border: `2px solid ${
              isBoss ? 'rgba(192,57,43,0.8)' :
              state === 'mastered' ? 'rgba(16,185,129,0.5)' :
              state === 'in_progress' ? 'rgba(245,158,11,0.5)' :
              'rgba(255,255,255,0.1)'
            }`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: isBoss ? 26 : 22,
            opacity: accessible || isBoss ? 1 : 0.4,
            transform: popped
              ? (hovered ? 'scale(1.12)' : 'scale(1)')
              : 'scale(0)',
            transition: 'transform 0.35s cubic-bezier(0.34,1.56,0.64,1)',
            boxSizing: 'border-box',
          }}
        >
          {icon}
        </div>
      </foreignObject>

      {/* Step number badge */}
      {!isBoss && (
        <circle cx={size - 4} cy={4} r={10} fill="var(--bg)" stroke="var(--border2)" strokeWidth={1} />
      )}
      {!isBoss && (
        <text x={size - 4} y={8} textAnchor="middle" fill="var(--text2)"
          style={{ fontSize: 9, fontFamily: 'JetBrains Mono', fontWeight: 700 }}>
          {index + 1}
        </text>
      )}

      {/* Label below node */}
      <foreignObject
        x={-40}
        y={size + 6}
        width={size + 80}
        height={36}
      >
        <div style={{
          width: '100%',
          textAlign: 'center',
          fontFamily: 'Syne, sans-serif',
          fontWeight: isBoss ? 800 : 600,
          fontSize: isBoss ? 12 : 11,
          color: isBoss ? 'var(--red)' :
                 state === 'mastered' ? 'var(--emerald)' :
                 state === 'in_progress' ? 'var(--amber)' : 'var(--text2)',
          lineHeight: 1.25,
          padding: '2px 4px',
          background: 'rgba(0,0,0,0.4)',
          borderRadius: 6,
          backdropFilter: 'blur(4px)',
          pointerEvents: 'none',
        }}>
          {shortLabel}
        </div>
      </foreignObject>
    </g>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function DungeonRoadMap({
  rooms,
  dungeonTitle,
  bossUnlocked = false,
  onSelectRoom,
  onBossChallenge,
}: DungeonRoadMapProps) {
  const svgRef   = useRef<SVGSVGElement>(null)
  const stops    = rooms.length

  // Layout: stops alternate left / right in a winding snake
  const SVG_W     = 340
  const TOP_PAD   = 60
  const STOP_GAP  = 110
  const LEFT_X    = SVG_W * 0.28
  const RIGHT_X   = SVG_W * 0.72
  const BOSS_X    = SVG_W / 2
  const totalH    = TOP_PAD + stops * STOP_GAP + (bossUnlocked ? STOP_GAP + 80 : 60)

  // Generate stop positions
  const stopPoints: { x: number; y: number }[] = rooms.map((_, i) => ({
    x: i % 2 === 0 ? LEFT_X : RIGHT_X,
    y: TOP_PAD + i * STOP_GAP,
  }))
  if (bossUnlocked) {
    stopPoints.push({ x: BOSS_X, y: TOP_PAD + stops * STOP_GAP })
  }

  const roadPath = buildSvgPath(stopPoints)

  // Progress: how far along the road the player is
  const masteredCount  = rooms.filter(r => r.state === 'mastered').length
  const progressFrac   = stops > 0 ? masteredCount / stops : 0

  return (
    <div style={{ width: '100%', maxWidth: 440, margin: '0 auto' }}>

      {/* Header */}
      <div style={{
        textAlign: 'center', marginBottom: 8,
        padding: '14px 20px 10px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '18px 18px 0 0',
      }}>
        <p style={{
          fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.1em', color: 'var(--text2)', marginBottom: 4,
        }}>Dungeon Road</p>
        <h2 style={{
          fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: 18,
          color: 'var(--text)', margin: 0,
        }}>{dungeonTitle}</h2>

        {/* Progress bar */}
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            flex: 1, height: 6, background: 'rgba(255,255,255,0.06)',
            borderRadius: 6, overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', borderRadius: 6,
              width: `${progressFrac * 100}%`,
              background: masteredCount === stops
                ? 'var(--emerald)'
                : 'linear-gradient(90deg, var(--amber), var(--cyan))',
              transition: 'width 1s ease',
            }}/>
          </div>
          <span style={{
            fontSize: 11, fontFamily: 'JetBrains Mono', fontWeight: 700,
            color: 'var(--amber)', flexShrink: 0,
          }}>
            {masteredCount}/{stops}
          </span>
        </div>
      </div>

      {/* SVG road */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderTop: 'none',
        borderRadius: '0 0 18px 18px',
        overflow: 'hidden',
      }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SVG_W} ${totalH}`}
          width="100%"
          style={{ display: 'block' }}
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Subtle grid dots background */}
          <defs>
            <pattern id="dots" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1" fill="rgba(255,255,255,0.03)"/>
            </pattern>
            {/* Glow filter for road */}
            <filter id="roadGlow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
          <rect width={SVG_W} height={totalH} fill="url(#dots)"/>

          {/* Road shadow (thicker, blurred) */}
          <path
            d={roadPath}
            fill="none"
            stroke="rgba(0,0,0,0.4)"
            strokeWidth={22}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Road base (asphalt grey) */}
          <path
            d={roadPath}
            fill="none"
            stroke="#1e2233"
            strokeWidth={18}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Road center dashes */}
          <path
            d={roadPath}
            fill="none"
            stroke="rgba(255,220,80,0.25)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="12 16"
          />

          {/* Completed road highlight */}
          {masteredCount > 0 && stopPoints.length > 1 && (
            <path
              d={buildSvgPath(stopPoints.slice(0, masteredCount + 1))}
              fill="none"
              stroke="rgba(16,185,129,0.5)"
              strokeWidth={6}
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#roadGlow)"
              style={{ transition: 'stroke-dashoffset 1s ease' }}
            />
          )}

          {/* Room stops */}
          {rooms.map((room, i) => (
            <RoadStop
              key={room.topic}
              room={room}
              index={i}
              x={stopPoints[i].x}
              y={stopPoints[i].y}
              onClick={() => onSelectRoom(room)}
              animDelay={i * 100 + 150}
            />
          ))}

          {/* Boss stop */}
          {bossUnlocked && (
            <RoadStop
              room={undefined}
              index={rooms.length}
              x={BOSS_X}
              y={stopPoints[stopPoints.length - 1].y}
              isBoss
              onClick={() => onBossChallenge?.()}
              animDelay={rooms.length * 100 + 200}
            />
          )}

          {/* Start label */}
          <text
            x={stopPoints[0].x}
            y={TOP_PAD - 28}
            textAnchor="middle"
            fill="rgba(255,255,255,0.2)"
            style={{ fontSize: 10, fontFamily: 'JetBrains Mono', fontWeight: 700 }}
          >
            ▼ START
          </text>

          {/* Finish flag at the bottom */}
          {!bossUnlocked && (
            <text
              x={SVG_W / 2}
              y={totalH - 14}
              textAnchor="middle"
              fill="rgba(255,255,255,0.12)"
              style={{ fontSize: 10, fontFamily: 'JetBrains Mono', fontWeight: 700 }}
            >
              🏁 FINISH
            </text>
          )}
        </svg>
      </div>

      {/* Legend */}
      <div style={{
        display: 'flex', gap: 12, justifyContent: 'center',
        marginTop: 14, flexWrap: 'wrap',
      }}>
        {[
          { color: 'var(--emerald)', label: 'Mastered' },
          { color: 'var(--amber)',   label: 'In Progress' },
          { color: 'var(--text3)',   label: 'Not started' },
          { color: 'var(--red)',     label: 'Boss' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: color, flexShrink: 0,
            }}/>
            <span style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'JetBrains Mono' }}>
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}