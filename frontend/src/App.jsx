import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Navbar from './components/Navbar';
import LoadingSpinner from './components/LoadingSpinner';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import ProjectDetailEnhanced from './pages/ProjectDetailEnhanced';
import AnnotationEditor from './pages/AnnotationEditor';
import AIDesignAssistant from './pages/AIDesignAssistant';
import AIFileAnalysis from './pages/AIFileAnalysis';
import PricingAnalysis from './pages/PricingAnalysis';

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <LoadingSpinner fullScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <>
      <Navbar />
      {children}
    </>
  );
};

// Public Route Component (redirect if already logged in)
const PublicRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <LoadingSpinner fullScreen />;
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

function AppRoutes() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route
        path="/login"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />
      <Route
        path="/register"
        element={
          <PublicRoute>
            <Register />
          </PublicRoute>
        }
      />

      {/* Protected Routes */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/project/:id"
        element={
          <ProtectedRoute>
            <ProjectDetailEnhanced />
          </ProtectedRoute>
        }
      />
      <Route
        path="/ai-design/:projectId"
        element={
          <ProtectedRoute>
            <AIDesignAssistant />
          </ProtectedRoute>
        }
      />
      
      {/* Annotation Editor - Full Screen (No Navbar) */}
      <Route
        path="/project/:projectId/annotate/:fileId"
        element={
          <ProtectedRoute>
            <AnnotationEditor />
          </ProtectedRoute>
        }
      />
      
      {/* AI File Analysis - Full Screen (No Navbar) */}
      <Route
        path="/ai-analysis"
        element={
          <ProtectedRoute>
            <AIFileAnalysis />
          </ProtectedRoute>
        }
      />
      
      {/* Pricing Analysis - Full Screen (No Navbar) */}
      <Route
        path="/project/:id/pricing"
        element={
          <ProtectedRoute>
            <PricingAnalysis />
          </ProtectedRoute>
        }
      />

      {/* Default Route */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </Router>
  );
}

export default App;
