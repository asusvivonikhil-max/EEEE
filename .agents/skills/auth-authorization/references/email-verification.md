# Email Verification Flow

## On Register — send verification email

```javascript
// In authController.register — after user created:
const { raw, hashed } = generateEmailVerificationToken();

await User.findByIdAndUpdate(user._id, {
  emailVerificationToken: hashed,
  emailVerificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
});

const verifyUrl = `${process.env.FRONTEND_URL}/verify-email?token=${raw}`;
await emailService.sendVerification(user.email, verifyUrl);
```

## Token generator (add to tokenService.js)

```javascript
const generateEmailVerificationToken = () => {
  const raw    = crypto.randomBytes(32).toString('hex');
  const hashed = crypto.createHash('sha256').update(raw).digest('hex');
  return { raw, hashed };
};
```

## Verify endpoint

```javascript
// POST /api/auth/verify-email
exports.verifyEmail = asyncHandler(async (req, res) => {
  const hashed = crypto.createHash('sha256').update(req.body.token).digest('hex');

  const user = await User.findOne({
    emailVerificationToken: hashed,
    emailVerificationExpires: { $gt: new Date() }
  });

  if (!user) throw new BadRequestError('Token invalid or expired', 'INVALID_VERIFICATION_TOKEN');
  if (user.isEmailVerified) {
    return res.json({ success: true, message: 'Email already verified' });
  }

  await User.findByIdAndUpdate(user._id, {
    isEmailVerified: true,
    emailVerificationToken: undefined,
    emailVerificationExpires: undefined
  });

  res.json({ success: true, message: 'Email verified successfully' });
});

// POST /api/auth/resend-verification
exports.resendVerification = asyncHandler(async (req, res) => {
  const user = await User.findOne({ email: req.body.email });

  // Always 200 — don't reveal email existence
  if (!user || user.isEmailVerified) {
    return res.json({ success: true, message: 'If applicable, verification email sent.' });
  }

  const { raw, hashed } = generateEmailVerificationToken();
  await User.findByIdAndUpdate(user._id, {
    emailVerificationToken: hashed,
    emailVerificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000)
  });

  const verifyUrl = `${process.env.FRONTEND_URL}/verify-email?token=${raw}`;
  await emailService.sendVerification(user.email, verifyUrl);

  res.json({ success: true, message: 'If applicable, verification email sent.' });
});
```

## Enforce email verification on login (optional)

```javascript
// In login controller, after password check:
if (!user.isEmailVerified) {
  throw new AppError('Please verify your email before logging in.', 403, 'EMAIL_NOT_VERIFIED');
}
```

## User model additions

```javascript
// Add to User schema:
isEmailVerified:           { type: Boolean, default: false },
emailVerificationToken:    { type: String, select: false },
emailVerificationExpires:  { type: Date, select: false },
```
