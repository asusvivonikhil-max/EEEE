# Frontend Auth — React Context, Token Refresh, Route Guards

## Token Storage Strategy

```
✅ Access Token  → React state / memory only (lost on refresh — intentional)
✅ Refresh Token → httpOnly cookie (set by server, JS cannot read)
❌ NEVER         → localStorage or sessionStorage (XSS steals tokens)
```

## Auth Context

```jsx
// context/AuthContext.jsx
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../utils/apiClient';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser]               = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [loading, setLoading]         = useState(true); // true while verifying session

  // On mount — try to restore session via refresh token cookie
  useEffect(() => {
    restoreSession();
  }, []);

  const restoreSession = async () => {
    try {
      const { data } = await api.post('/auth/refresh'); // cookie sent automatically
      setAccessToken(data.accessToken);
      const { data: userData } = await api.get('/auth/me', {
        headers: { Authorization: `Bearer ${data.accessToken}` }
      });
      setUser(userData.user);
    } catch {
      // No valid session — user needs to log in
      setUser(null);
      setAccessToken(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    setUser(data.user);
    setAccessToken(data.accessToken);
    return data.user;
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setUser(null);
      setAccessToken(null);
    }
  };

  const updateToken = useCallback((token) => setAccessToken(token), []);

  return (
    <AuthContext.Provider value={{ user, accessToken, loading, login, logout, updateToken, restoreSession }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
};
```

## Axios Interceptor — Silent Token Refresh

```javascript
// utils/apiClient.js
import axios from 'axios';

let accessToken = null;
let refreshPromise = null; // Prevent multiple simultaneous refresh calls

export const setAccessToken = (token) => { accessToken = token; };

const api = axios.create({
  baseURL: '/api/v1',
  withCredentials: true // Send cookies on every request
});

// Attach access token to every request
api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// Handle 401 — silently refresh and retry
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;

      try {
        // Deduplicate: if refresh already in progress, wait for it
        if (!refreshPromise) {
          refreshPromise = api.post('/auth/refresh').finally(() => {
            refreshPromise = null;
          });
        }

        const { data } = await refreshPromise;
        accessToken = data.accessToken;
        original.headers.Authorization = `Bearer ${accessToken}`;
        return api(original); // Retry original request with new token

      } catch {
        // Refresh failed — session expired, redirect to login
        accessToken = null;
        window.location.href = '/login?expired=1';
        return Promise.reject(error);
      }
    }

    return Promise.reject(error?.response?.data || error);
  }
);

export default api;
```

## Route Guards

```jsx
// components/ProtectedRoute.jsx
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Require authentication
export const PrivateRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="loading-screen">Loading...</div>;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return children;
};

// Require specific role
export const RoleRoute = ({ children, roles }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="loading-screen">Loading...</div>;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (!roles.includes(user.role)) return <Navigate to="/unauthorized" replace />;
  return children;
};

// Redirect authenticated users away from login/register
export const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen">Loading...</div>;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
};
```

## Router Setup

```jsx
// App.jsx
import { Routes, Route } from 'react-router-dom';
import { PrivateRoute, RoleRoute, PublicRoute } from './components/ProtectedRoute';

function App() {
  return (
    <Routes>
      {/* Public routes — redirect if already logged in */}
      <Route path="/login"    element={<PublicRoute><LoginPage /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />

      {/* Any authenticated user */}
      <Route path="/profile"  element={<PrivateRoute><ProfilePage /></PrivateRoute>} />
      <Route path="/orders"   element={<PrivateRoute><OrdersPage /></PrivateRoute>} />

      {/* Seller only */}
      <Route path="/seller/*" element={<RoleRoute roles={['seller', 'admin']}><SellerLayout /></RoleRoute>} />

      {/* Admin only */}
      <Route path="/admin/*"  element={<RoleRoute roles={['admin']}><AdminLayout /></RoleRoute>} />

      {/* Fully public */}
      <Route path="/products" element={<ProductsPage />} />
    </Routes>
  );
}
```

## Role-Based UI Rendering

```jsx
// components/RoleGate.jsx
import { useAuth } from '../context/AuthContext';

export const RoleGate = ({ roles, children, fallback = null }) => {
  const { user } = useAuth();
  if (!user || !roles.includes(user.role)) return fallback;
  return children;
};

// Usage — hide UI elements based on role
<RoleGate roles={['admin']}>
  <button onClick={deleteUser}>Delete User</button>
</RoleGate>

<RoleGate roles={['admin', 'seller']} fallback={<p>Upgrade to seller account</p>}>
  <ProductUploadForm />
</RoleGate>
```

## useAuth Hook Usage Patterns

```jsx
// In any component
const { user, login, logout, loading } = useAuth();

// Login form
const handleLogin = async (e) => {
  e.preventDefault();
  try {
    await login(email, password);
    navigate(location.state?.from || '/dashboard');
  } catch (err) {
    setError(err.message || 'Login failed');
  }
};

// Display role-specific content
if (user?.role === 'admin') { /* show admin UI */ }

// User avatar/name in header
<span>{user?.name}</span>
<img src={user?.avatar} alt={user?.name} />
```
