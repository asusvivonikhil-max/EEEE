import { ConflictError, ValidationError, AppError } from '../errors/AppError';

export const handleMongoError = (err: any): AppError | null => {
  // Duplicate key (unique index violation)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return new ConflictError(`${field.charAt(0).toUpperCase() + field.slice(1)} already registered`);
  }
  // Validation error from Mongoose schema
  if (err.name === 'ValidationError') {
    const details = Object.values(err.errors).map((e: any) => ({
      field: e.path,
      message: e.message,
    }));
    return new ValidationError(details);
  }
  // Cast error (invalid ObjectId)
  if (err.name === 'CastError') {
    return new AppError(`Invalid ${err.path}: ${err.value}`, 400, 'INVALID_ID');
  }
  return null; // Not a known Mongo error
};
