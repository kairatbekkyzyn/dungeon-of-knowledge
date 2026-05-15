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
    <div style={{ background:'var(--bg)', minHeight:'100vh' }}
         className="flex items-center justify-center p-4 relative overflow-hidden">
      <div style={{
        position:'absolute', top:'20%', left:'50%', transform:'translate(-50%,-50%)',
        width:600, height:600, borderRadius:'50%',
        background:'radial-gradient(circle, rgba(232,160,48,0.06) 0%, transparent 70%)',
        pointerEvents:'none'
      }}/>

      <div style={{ width:'100%', maxWidth:420, position:'relative', zIndex:1 }}>
        <div className="text-center anim-up d-0" style={{ marginBottom:36 }}>
          <div style={{
            display:'inline-flex', alignItems:'center', justifyContent:'center',
            width:56, height:56, borderRadius:16, marginBottom:14,
            background:'linear-gradient(135deg, #e8a030, #9b59b6)',
            boxShadow:'0 0 40px rgba(232,160,48,0.3)'
          }} className="torch"><span style={{ fontSize:28 }}>🏰</span></div>
          <h1 className="h1" style={{ fontSize:28, letterSpacing:'-0.03em' }}>ExamAI</h1>
          <p className="t-secondary" style={{ marginTop:6, fontSize:13 }}>
            Dungeon of Knowledge
          </p>
        </div>

        <div className="card anim-scale d-1" style={{ padding:30 }}>
          <h2 className="h2" style={{ marginBottom:4 }}>Welcome back, Explorer</h2>
          <p className="t-secondary" style={{ fontSize:13, marginBottom:24 }}>
            Your dungeons await
          </p>

          {error && <ErrBox msg={error} />}

          <form onSubmit={submit} style={{ display:'flex', flexDirection:'column', gap:15 }}>
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" placeholder="you@university.edu"
                value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div>
              <label className="label">Password</label>
              <input className="input" type="password" placeholder="••••••••"
                value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
            <button type="submit" disabled={loading} className="btn-primary"
              style={{ width:'100%', marginTop:4, height:46, fontSize:14 }}>
              {loading ? <Spin /> : '⚔️ Enter the Dungeon →'}
            </button>
          </form>

          <div style={{
            marginTop:22, paddingTop:22, borderTop:'1px solid var(--border)',
            textAlign:'center', fontSize:13
          }}>
            <span className="t-secondary">No account? </span>
            <Link to="/register" style={{ color:'var(--cyan)', fontWeight:700, textDecoration:'none' }}>
              Begin your quest
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

function ErrBox({ msg }: { msg: string }) {
  return (
    <div style={{
      background:'var(--red-dim)', border:'1px solid rgba(192,57,43,0.25)',
      borderRadius:10, padding:'11px 15px', marginBottom:16,
      color:'var(--red)', fontSize:13
    }}>⚠ {msg}</div>
  )
}

function Spin() {
  return (
    <span className="spin" style={{
      display:'inline-block', width:15, height:15,
      border:'2px solid rgba(0,0,0,0.2)', borderTopColor:'var(--bg)', borderRadius:'50%'
    }}/>
  )
}