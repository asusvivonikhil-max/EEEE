# OAuth — Google Login with Passport.js

## Installation

```bash
npm install passport passport-google-oauth20 express-session
```

## Setup

```javascript
// config/passport.js
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');

passport.use(new GoogleStrategy({
  clientID:     process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL:  '/api/auth/google/callback',
  scope: ['profile', 'email']
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const email = profile.emails[0].value;

    let user = await User.findOne({ email });

    if (user) {
      // Existing user — update Google ID if not set
      if (!user.googleId) {
        user.googleId = profile.id;
        await user.save();
      }
      return done(null, user);
    }

    // New user — create account
    user = await User.create({
      name:       profile.displayName,
      email,
      googleId:   profile.id,
      avatar:     profile.photos[0]?.value,
      isEmailVerified: true, // Google already verified the email
      password:   require('crypto').randomBytes(32).toString('hex') // Random password — OAuth users don't use it
    });

    return done(null, user);
  } catch (err) {
    return done(err, null);
  }
}));

module.exports = passport;
```

## Routes

```javascript
// routes/auth.routes.js
const passport = require('../config/passport');
const { generateTokenPair } = require('../services/tokenService');

// Initiate Google OAuth
router.get('/google',
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })
);

// Google callback
router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/login?error=oauth_failed', session: false }),
  async (req, res) => {
    const user = req.user;
    const { accessToken, refreshToken, refreshExpiresAt } = generateTokenPair(user);

    await User.findByIdAndUpdate(user._id, {
      $push: { refreshTokens: { token: refreshToken, expiresAt: refreshExpiresAt } }
    });

    // Set httpOnly cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    // Redirect to frontend with access token in URL hash (never query string)
    res.redirect(`${process.env.FRONTEND_URL}/oauth-callback#token=${accessToken}`);
  }
);
```

## Frontend — Handle OAuth Callback

```jsx
// pages/OAuthCallback.jsx
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const OAuthCallback = () => {
  const { updateToken, restoreSession } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const hash = window.location.hash;
    const token = new URLSearchParams(hash.substring(1)).get('token');

    if (token) {
      updateToken(token);
      // Clear token from URL immediately
      window.history.replaceState(null, '', window.location.pathname);
      restoreSession().then(() => navigate('/dashboard'));
    } else {
      navigate('/login?error=oauth_failed');
    }
  }, []);

  return <div>Completing login...</div>;
};
```

## Required ENV vars

```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
FRONTEND_URL=http://localhost:3000
```

## Google Cloud Console setup
1. Go to console.cloud.google.com
2. Create project → Enable Google+ API
3. OAuth consent screen → External → fill details
4. Credentials → OAuth 2.0 Client ID → Web application
5. Authorized redirect URIs → `http://localhost:5000/api/auth/google/callback`
