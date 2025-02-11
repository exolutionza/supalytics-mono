import React from 'react';
import { Provider } from 'react-redux'; // Add this import
import { store } from '@/store/store'; // Add this import (adjust path as needed)
import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/auth-context';
import AppRoutes from './routes';
// import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from '@/components/theme-provider';

// Wrapper component that provides navigation functionality
const AuthWrapper = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  return (
    <AuthProvider
      onNavigate={(path) => navigate(path, { replace: true })}
      pathname={location.pathname}
    >
      <ThemeProvider defaultTheme="light" storageKey="vite-ui-theme">
        <AppRoutes />
      </ThemeProvider>
    </AuthProvider>
  );
};

// Main App component
function App() {
  return (
    <Provider store={store}> {/* Add Redux Provider here */}
      <Router>
        <Routes>
          <Route path="/*" element={<AuthWrapper />} />
        </Routes>
      </Router>
    </Provider>
  );
}

export default App;