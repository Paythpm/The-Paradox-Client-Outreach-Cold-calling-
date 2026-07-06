import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function ProtectedRoute({ children, adminOnly = false }) {
  const { user, isAdmin, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, background: 'var(--bg)' }}>
        <div className="spinner" />
        <p style={{ color: 'var(--text3)', fontSize: 14 }}>Loading...</p>
        <style>{`.spinner{width:36px;height:36px;border:2px solid var(--border);border-top:2px solid var(--accent);border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Admin-only routes — redirect non-admins to home
  if (adminOnly && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return children;
}
