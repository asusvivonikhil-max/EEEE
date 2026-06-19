import { Router } from 'express';
import { handleStripeWebhook } from '../controllers/webhookController';

const router = Router();

router.post('/stripe', handleStripeWebhook);

export default router;
