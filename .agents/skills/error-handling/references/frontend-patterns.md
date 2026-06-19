# Frontend Error Patterns — Toast, Form Errors, Loading States

## Toast Notification System (React + react-hot-toast)

```bash
npm install react-hot-toast
```

```jsx
// App.jsx — add Toaster once at root
import { Toaster } from 'react-hot-toast';

function App() {
  return (
    <>
      <Toaster position="top-right" toastOptions={{
        error: { duration: 5000 },
        success: { duration: 3000 }
      }} />
      <Router />
    </>
  );
}
```

```javascript
// utils/toast.js — wrapper with consistent error handling
import toast from 'react-hot-toast';

export const showError = (err) => {
  const message = err?.message || err?.details?.[0]?.message || 'Something went wrong';
  toast.error(message);
};

export const showSuccess = (message) => toast.success(message);

// Usage in any component
try {
  await api.post('/orders', payload);
  showSuccess('Order placed successfully!');
} catch (err) {
  showError(err); // Automatically extracts best message
}
```

## Form Error Display (React Hook Form)

```jsx
// components/RegisterForm.jsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import api from '../utils/apiClient';
import { showSuccess, showError } from '../utils/toast';

const schema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Minimum 8 characters'),
  name: z.string().min(2, 'Name too short')
});

const RegisterForm = () => {
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema)
  });

  const onSubmit = async (data) => {
    try {
      await api.post('/auth/register', data);
      showSuccess('Account created!');
    } catch (err) {
      // Map server validation errors back to form fields
      if (err.code === 'VALIDATION_ERROR' && err.details) {
        err.details.forEach(({ field, message }) => {
          setError(field, { message });
        });
        return;
      }
      if (err.code === 'DUPLICATE') {
        setError('email', { message: 'Email already registered' });
        return;
      }
      showError(err);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div>
        <input {...register('email')} placeholder="Email" />
        {errors.email && <span className="error">{errors.email.message}</span>}
      </div>
      <div>
        <input {...register('password')} type="password" placeholder="Password" />
        {errors.password && <span className="error">{errors.password.message}</span>}
      </div>
      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Creating account...' : 'Register'}
      </button>
    </form>
  );
};
```

## Loading / Error / Empty States Component

```jsx
// components/AsyncState.jsx
const AsyncState = ({ loading, error, empty, emptyMessage, children, onRetry }) => {
  if (loading) return (
    <div className="loading-spinner">
      <div className="spinner" />
      <p>Loading...</p>
    </div>
  );

  if (error) return (
    <div className="error-state">
      <p>⚠️ {error.message || 'Failed to load data'}</p>
      {onRetry && <button onClick={onRetry}>Try again</button>}
    </div>
  );

  if (empty) return (
    <div className="empty-state">
      <p>{emptyMessage || 'No data found'}</p>
    </div>
  );

  return children;
};

// Usage
<AsyncState
  loading={loading}
  error={error}
  empty={products.length === 0}
  emptyMessage="No products found"
  onRetry={refetch}
>
  <ProductGrid products={products} />
</AsyncState>
```

## Network Status Detection

```javascript
// hooks/useNetworkStatus.js
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';

const useNetworkStatus = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast.success('Connection restored');
    };
    const handleOffline = () => {
      setIsOnline(false);
      toast.error('No internet connection', { duration: Infinity, id: 'offline' });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
};
```
