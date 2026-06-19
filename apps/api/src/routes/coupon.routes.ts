import { Router } from 'express';
import { createCoupon, listCoupons, applyCouponCode } from '../controllers/couponController';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/authorize';

const router = Router();

// Apply coupon code is public (accessible by customers during checkout)
router.post('/apply', applyCouponCode);

// Other coupon routes require authentication and seller/admin role
router.use(authenticate);
router.use(requireRole('seller', 'admin'));

router.post('/', createCoupon);
router.get('/', listCoupons);

export default router;
