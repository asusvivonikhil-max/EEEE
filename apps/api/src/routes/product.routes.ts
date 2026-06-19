import { Router } from 'express';
import multer from 'multer';
import { listProducts, getProduct, createProduct, updateProduct, deleteProduct, bulkUploadProducts } from '../controllers/productController';
import { validate } from '../middleware/validate';
import { createProductSchema, updateProductSchema, productQuerySchema } from '../validation/schemas/product.schema';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/authorize';
import { uploadFile } from '../services/storageService';
import { imageQueue } from '../services/queueService';
import { asyncHandler } from '../middleware/errorHandler';
import { ValidationError } from '../errors/AppError';

const router = Router();
const upload = multer({
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});

router.get('/', validate(productQuerySchema, 'query'), listProducts);
router.get('/:id', getProduct);

router.post('/', authenticate, requireRole('seller', 'admin'), validate(createProductSchema), createProduct);
router.put('/:id', authenticate, validate(updateProductSchema), updateProduct);
router.delete('/:id', authenticate, deleteProduct);

// Upload endpoint
router.post(
  '/upload',
  authenticate,
  requireRole('seller', 'admin'),
  upload.single('image'),
  asyncHandler(async (req: any, res: any) => {
    if (!req.file) {
      throw new ValidationError([{ field: 'image', message: 'No image file uploaded' }]);
    }
    
    // Check file mimetype
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(req.file.mimetype)) {
      throw new ValidationError([{ field: 'image', message: 'Only JPEG, PNG, and WebP images are allowed' }]);
    }

    const fileUrl = await imageQueue.addJob(req.file);
    res.json({
      success: true,
      data: {
        url: fileUrl,
      },
    });
  })
);

// Bulk CSV Upload endpoint
router.post(
  '/bulk-upload',
  authenticate,
  requireRole('seller', 'admin'),
  upload.single('file'),
  bulkUploadProducts
);

export default router;
