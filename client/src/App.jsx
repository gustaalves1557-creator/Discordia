import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import Login from './pages/Login';
import Register from './pages/Register';
import Chat from './pages/Chat';
import DMs from './pages/DMs';
import Download from './pages/Download';
import ErrorBoundary from './components/ErrorBoundary';
import './App.css';

function Guard({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="auth-wrap">Carregando...</div>;
  if (!user) return <Navigate to="/login" />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<ErrorBoundary name="login"><Login /></ErrorBoundary>} />
          <Route path="/register" element={<ErrorBoundary name="register"><Register /></ErrorBoundary>} />
          <Route path="/" element={<Guard><ErrorBoundary name="chat"><Chat /></ErrorBoundary></Guard>} />
          <Route path="/dms" element={<Guard><ErrorBoundary name="dms"><DMs /></ErrorBoundary></Guard>} />
          <Route path="/download" element={<Download />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
