import { useEffect, type ReactNode } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import { ToastProvider } from './components/Toast'
import Layout from './components/Layout'
import Login from './pages/Login'
import Register from './pages/Register'
import WorldMap from './pages/WorldMap'
import DungeonInterior from './pages/DungeonInterior'
import BossRoom from './pages/BossRoom'
import Forge from './pages/Forge'
import MonsterLog from './pages/MonsterLog'
import Stats from './pages/Stats'
import Profile from './pages/Profile'
import Badges from './pages/Badges'
import Leaderboard   from './pages/Leaderboard'
import Competitions  from './pages/Competitions'
import Friends       from './pages/Friends'
import PublicProfile from './pages/PublicProfile'

function PrivateRoute({ children }: { children: ReactNode }) {
  const token = useAuthStore(s => s.token)
  return token ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  const { token, fetchMe, theme } = useAuthStore()

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    if (token) fetchMe()
  }, [token])

  return (
    <ToastProvider>
      <Routes>
        <Route path="/login"    element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route index                      element={<WorldMap />} />
          <Route path="dungeon/:id"         element={<DungeonInterior />} />
          <Route path="dungeon/:id/boss"    element={<BossRoom />} />
          <Route path="forge"               element={<Forge />} />
          <Route path="monsters"            element={<MonsterLog />} />
          <Route path="stats"               element={<Stats />} />
          <Route path="profile"             element={<Profile />} />
          <Route path="badges"              element={<Badges />} />
          <Route path="leaderboard"        element={<Leaderboard />} />
          <Route path="competitions"       element={<Competitions />} />
          <Route path="friends"            element={<Friends />} />
          <Route path="profile/:userId"    element={<PublicProfile />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ToastProvider>
  )
}