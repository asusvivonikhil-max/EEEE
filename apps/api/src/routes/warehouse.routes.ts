import { Router } from 'express';
import { getFulfillmentQueue, getConsolidatedPickList, packAndShipOrder } from '../controllers/warehouseController';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/authorize';

const router = Router();

// All warehouse routes require authentication and warehouse/seller/admin role
router.use(authenticate);
router.use(requireRole('warehouse', 'seller', 'admin'));

router.get('/orders', getFulfillmentQueue);
router.get('/picklist', getConsolidatedPickList);
router.post('/orders/:id/pack', packAndShipOrder);

export default router;
