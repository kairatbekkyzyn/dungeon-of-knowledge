import { createContext, useContext, useState, useCallback, useRef } from 'react'
import { useSound } from '../hooks/useSound'

type ToastType = 'success' | 'badge' | 'xp' | 'error'

interface Toast {
  id: number
  message: string
  type: ToastType
  exiting: boolean
}

interface ToastCtx {
  addToast: (message: string, type?: ToastType, silent?: boolean) => void
}

const ToastContext = createContext<ToastCtx>({ addToast: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

const TYPE_STYLES: Record<ToastType, { bg: string; border: string; color: string; icon: string }> = {
  success: { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.35)', color: '#10b981', icon: '✅' },
  badge:   { bg: 'rgba(232,160,48,0.12)', border: 'rgba(232,160,48,0.35)', color: '#e8a030', icon: '🏅' },
  xp:      { bg: 'rgba(56,189,248,0.10)', border: 'rgba(56,189,248,0.30)', color: '#38bdf8', icon: '⚡' },
  error:   { bg: 'rgba(239,68,68,0.10)',  border: 'rgba(239,68,68,0.30)',  color: '#ef4444', icon: '❌' },
}

let nextId = 0

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { playSound } = useSound()
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t))
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 280)
  }, [])

  const addToast = useCallback((message: string, type: ToastType = 'success', silent = false) => {
    const id = nextId++
    setToasts(prev => [...prev.slice(-3), { id, message, type, exiting: false }])
    const timer = setTimeout(() => removeToast(id), 2500)
    timers.current.set(id, timer)

    if (!silent) {
      const soundKey =
        type === 'error' ? 'toastError' :
        type === 'xp' ? 'toastXp' :
        'toastSuccess'
      playSound(soundKey, 0.55)
    }
  }, [removeToast, playSound])

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div style={{
        position: 'fixed', top: 20, right: 20, zIndex: 9999,
        display: 'flex', flexDirection: 'column', gap: 8,
        pointerEvents: 'none',
      }}>
        {toasts.map(toast => {
          const s = TYPE_STYLES[toast.type]
          return (
            <div
              key={toast.id}
              className={toast.exiting ? 'toast-exit' : 'toast-enter'}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 16px',
                background: s.bg,
                border: `1px solid ${s.border}`,
                borderRadius: 12,
                boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
                minWidth: 200, maxWidth: 320,
                backdropFilter: 'blur(8px)',
                pointerEvents: 'auto',
              }}
            >
              <span style={{ fontSize: 16 }}>{s.icon}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: s.color, fontFamily: 'Manrope' }}>
                {toast.message}
              </span>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
