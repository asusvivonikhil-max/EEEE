import mongoose, { Schema, Document, Model } from 'mongoose';
import bcrypt from 'bcryptjs';
import { User as SharedUser } from '@e-commerce/shared';

export interface IUserDoc extends Document {
  name: string;
  email: string;
  password?: string;
  role: SharedUser['role'];
  isActive: boolean;
  isEmailVerified: boolean;
  refreshTokens: {
    token: string;
    createdAt?: Date;
    expiresAt: Date;
  }[];
  passwordChangedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
  passwordChangedAfter(jwtTimestamp: number): boolean;
  toSafeObject(): any;
}

const userSchema = new Schema<IUserDoc>(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false,
    },
    role: {
      type: String,
      enum: ['customer', 'seller', 'admin', 'warehouse'],
      default: 'customer',
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    refreshTokens: [
      {
        token: { type: String, required: true },
        createdAt: { type: Date, default: Date.now },
        expiresAt: { type: Date, required: true },
      },
    ],
    passwordChangedAt: Date,
  },
  {
    timestamps: true,
  }
);

// Indexes for fast lookup
userSchema.index({ role: 1, isActive: 1 });

// Pre-save hook to hash password and set passwordChangedAt
userSchema.pre<IUserDoc>('save', async function (next) {
  // Only hash the password if it has been modified or is new
  if (!this.isModified('password') || !this.password) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    
    if (!this.isNew) {
      this.passwordChangedAt = new Date(Date.now() - 1000); // 1s in past to ensure token generation timestamp is newer
    }
    next();
  } catch (error: any) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
  if (!this.password) {
    return false;
  }
  return bcrypt.compare(candidate, this.password);
};

// Check if password changed after token was issued
userSchema.methods.passwordChangedAfter = function (jwtTimestamp: number): boolean {
  if (this.passwordChangedAt) {
    const changedTimestamp = Math.floor(this.passwordChangedAt.getTime() / 1000);
    return changedTimestamp > jwtTimestamp;
  }
  return false;
};

// Remove sensitive fields from JSON output
userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.refreshTokens;
  delete obj.passwordChangedAt;
  return obj;
};

export const User: Model<IUserDoc> = mongoose.models.User || mongoose.model<IUserDoc>('User', userSchema);
