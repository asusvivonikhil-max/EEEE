import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import authRoutes from './routes/auth.routes';
import productRoutes from './routes/product.routes';
import cartRoutes from './routes/cart.routes';
import orderRoutes from './routes/order.routes';
import webhookRoutes from './routes/webhook.routes';
import sellerRoutes from './routes/seller.routes';
import couponRoutes from './routes/coupon.routes';
import warehouseRoutes from './routes/warehouse.routes';
import { errorHandler } from './middleware/errorHandler';

const app = express();

app.use(cors());
app.use(cookieParser());

// Register Webhooks BEFORE express.json() to capture raw payload buffer
app.use('/api/webhooks', express.raw({ type: 'application/json' }), webhookRoutes);

app.use(express.json());

// Serve static uploaded media
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Register API Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/seller', sellerRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/warehouse', warehouseRoutes);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'E-Commerce API is running smoothly',
    timestamp: new Date().toISOString()
  });
});

// Global Error Handler Middleware
app.use(errorHandler);

export default app;
