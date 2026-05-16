import { useState, FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

export default function Login() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const { login }               = useAuthStore()
  const navigate                = useNavigate()

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setError(''); setLoading(true)
    try { await login(email, password); navigate('/') }
    catch (err: any) { setError(err.response?.data?.detail ?? 'Invalid email or password.') }
    finally { setLoading(false) }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
    }}>
      {/* Ambient glow */}
      <div style={{
        position:'fixed', top:'40%', left:'50%', transform:'translate(-50%,-50%)',
        width:600, height:600, borderRadius:'50%', pointerEvents:'none',
        background:'radial-gradient(circle, rgba(232,160,48,0.07) 0%, transparent 70%)',
      }}/>

      <div style={{ width:'100%', maxWidth:420, position:'relative' }}>
        {/* Logo */}
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{
            display:'inline-flex', alignItems:'center', justifyContent:'center',
            width:60, height:60, borderRadius:18, marginBottom:16,
            background:'linear-gradient(135deg, #e8a030, #9b59b6)',
            boxShadow:'0 0 40px rgba(232,160,48,0.3)'
          }} className="torch"><span style={{ fontSize:30 }}>🏰</span></div>
          <h1 style={{ fontFamily:'Syne', fontSize:28, fontWeight:800, color:'var(--text)', margin:0, letterSpacing:'-0.02em' }}>ExamAI</h1>
          <p style={{ color:'var(--text2)', fontSize:14, marginTop:6 }}>Dungeon of Knowledge</p>
        </div>

        {/* Card */}
        <div style={{
          background:'var(--surface)', border:'1px solid var(--border)',
          borderRadius:20, padding:32,
        }}>
          <h2 style={{ fontFamily:'Syne', fontSize:22, fontWeight:700, color:'var(--text)', margin:'0 0 4px' }}>
            Welcome back, Explorer
          </h2>
          <p style={{ color:'var(--text2)', fontSize:13, marginBottom:28 }}>Your dungeons await</p>

          {error && (
            <div style={{
              background:'var(--red-dim)', border:'1px solid rgba(192,57,43,0.25)',
              borderRadius:10, padding:'11px 15px', marginBottom:20,
              color:'var(--red)', fontSize:13
            }}>⚠ {error}</div>
          )}

          <form onSubmit={submit} style={{ display:'flex', flexDirection:'column', gap:18 }}>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              <label style={{ fontSize:12, fontWeight:700, color:'var(--text2)', fontFamily:'Manrope', letterSpacing:'0.05em', textTransform:'uppercase' }}>
                Email
              </label>
              <input type="email" placeholder="you@university.edu"
                value={email} onChange={e => setEmail(e.target.value)} required />
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              <label style={{ fontSize:12, fontWeight:700, color:'var(--text2)', fontFamily:'Manrope', letterSpacing:'0.05em', textTransform:'uppercase' }}>
                Password
              </label>
              <input type="password" placeholder="••••••••"
                value={password} onChange={e => setPassword(e.target.value)} required />
            </div>

            <button type="submit" disabled={loading} className="btn-primary"
              style={{ width:'100%', marginTop:4, height:48, fontSize:15 }}>
              {loading ? <Spin /> : '⚔️ Enter the Dungeon →'}
            </button>
          </form>

          <div style={{
            marginTop:24, paddingTop:24, borderTop:'1px solid var(--border)',
            textAlign:'center', fontSize:13
          }}>
            <span style={{ color:'var(--text2)' }}>No account? </span>
            <Link to="/register" style={{ color:'var(--cyan)', fontWeight:700, textDecoration:'none' }}>
              Begin your quest
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

function Spin() {
  return <span className="spin" style={{
    display:'inline-block', width:16, height:16,
    border:'2px solid rgba(0,0,0,0.2)', borderTopColor:'var(--bg)', borderRadius:'50%'
  }}/>
}