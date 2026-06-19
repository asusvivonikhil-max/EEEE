import { Router } from 'express';
import { getSellerAnalytics } from '../controllers/sellerController';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/authorize';

const router = Router();

router.use(authenticate);
router.use(requireRole('seller', 'admin'));

router.get('/analytics', getSellerAnalytics);

export default router;
