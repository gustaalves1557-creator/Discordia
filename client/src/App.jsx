import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import Login from './pages/Login';
import Register from './pages/Register';
import Chat from './pages/Chat';
import DMs from './pages/DMs';
import Download from './pages/Download';
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
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/" element={<Guard><Chat /></Guard>} />
          <Route path="/dms" element={<Guard><DMs /></Guard>} />
          <Route path="/download" element={<Download />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
