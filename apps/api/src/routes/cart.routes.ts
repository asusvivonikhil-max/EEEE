import { Router } from 'express';
import { getCart, addToCart, updateCartItem, removeCartItem, clearCart } from '../controllers/cartController';
import { authenticate } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import { addToCartSchema, updateCartItemSchema } from '../validation/schemas/cart.schema';

const router = Router();

// All cart routes require authentication
router.use(authenticate);

router.get('/', getCart);
router.post('/items', validate(addToCartSchema), addToCart);
router.put('/items/:sku', validate(updateCartItemSchema), updateCartItem);
router.delete('/items/:sku', removeCartItem);
router.delete('/', clearCart);

export default router;
