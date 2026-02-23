import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import Login from './pages/Login';
import Gallery from './pages/Gallery';

export default function App() {
  const { user, loading, logout } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', gap: 16 }}>
        <img src="/땅땅로고.png" alt="로딩" style={{ width: 72, animation: 'logoSpin 1.2s cubic-bezier(0.34, 1.56, 0.64, 1) infinite' }} />
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--color-primary)', opacity: 0.7 }}>불러오는 중...</span>
        <style>{`@keyframes logoSpin { 0%,100% { transform: scale(1) rotate(0deg) } 50% { transform: scale(1.08) rotate(3deg) } }`}</style>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
      <Route path="/*" element={user ? <Gallery user={user} onLogout={logout} /> : <Navigate to="/login" />} />
    </Routes>
  );
}
