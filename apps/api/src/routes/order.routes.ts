import { Router } from 'express';
import { createCheckoutOrder, simulatePaymentSuccess, listMyOrders, getOrderDetails, updateOrderStatus } from '../controllers/orderController';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/authorize';

const router = Router();

// All order routes require authentication
router.use(authenticate);

router.post('/checkout', createCheckoutOrder);
router.post('/:id/simulate-payment', simulatePaymentSuccess);
router.get('/', listMyOrders);
router.get('/:id', getOrderDetails);

// Status updates restricted to sellers and admins
router.put('/:id/status', requireRole('seller', 'admin'), updateOrderStatus);

export default router;
