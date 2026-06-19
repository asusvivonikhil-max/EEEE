import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IOrderItemAllocation {
  warehouse: string;
  quantity: number;
}

export interface IOrderItem {
  productId: mongoose.Types.ObjectId;
  variantSku: string;
  snapshot: {
    name: string;
    sku: string;
    image?: string;
    price: number;
  };
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  allocations?: IOrderItemAllocation[];
}

export interface IOrderStatusHistory {
  status: string;
  timestamp?: Date;
  note?: string;
}

export interface IOrderDoc extends Document {
  orderNumber: string;
  customerId: mongoose.Types.ObjectId;
  items: IOrderItem[];
  shippingAddress: {
    street: string;
    city: string;
    state?: string;
    zip: string;
    country: string;
    phone: string;
  };
  subtotal: number;
  discountAmount: number;
  couponCode?: string;
  shipping: number;
  tax: number;
  total: number;
  paymentStatus: 'pending' | 'authorized' | 'paid' | 'failed' | 'refunded' | 'partial_refund';
  paymentMethod: 'stripe' | 'simulated';
  paymentIntentId?: string;
  status: 'pending' | 'paid' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';
  statusHistory: IOrderStatusHistory[];
  trackingNumber?: string;
  createdAt: Date;
  updatedAt: Date;
}

const orderItemSchema = new Schema<IOrderItem>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    variantSku: { type: String, required: true },
    snapshot: {
      name: { type: String, required: true },
      sku: { type: String, required: true },
      image: String,
      price: { type: Number, required: true, min: 0 },
    },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    totalPrice: { type: Number, required: true, min: 0 },
    allocations: [
      {
        warehouse: { type: String, required: true },
        quantity: { type: Number, required: true, min: 1 }
      }
    ]
  },
  { _id: false }
);

const orderSchema = new Schema<IOrderDoc>(
  {
    orderNumber: { type: String, unique: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    items: [orderItemSchema],
    shippingAddress: {
      street: { type: String, required: true },
      city: { type: String, required: true },
      state: String,
      zip: { type: String, required: true },
      country: { type: String, required: true },
      phone: { type: String, required: true },
    },
    subtotal: { type: Number, required: true, min: 0 },
    discountAmount: { type: Number, required: true, min: 0, default: 0 },
    couponCode: { type: String, uppercase: true, trim: true },
    shipping: { type: Number, required: true, min: 0, default: 0 },
    tax: { type: Number, required: true, min: 0, default: 0 },
    total: { type: Number, required: true, min: 0 },
    paymentStatus: {
      type: String,
      enum: ['pending', 'authorized', 'paid', 'failed', 'refunded', 'partial_refund'],
      default: 'pending',
      index: true,
    },
    paymentMethod: {
      type: String,
      enum: ['stripe', 'simulated'],
      required: true,
    },
    paymentIntentId: { type: String, index: true },
    status: {
      type: String,
      enum: ['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'],
      default: 'pending',
      index: true,
    },
    statusHistory: [
      {
        status: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
        note: String,
      },
    ],
    trackingNumber: String,
  },
  {
    timestamps: true,
  }
);

// Indexes for typical queries
orderSchema.index({ customerId: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ 'items.variantSku': 1 });

// Auto-generate order number (e.g. ORD-2026-00001)
orderSchema.pre<IOrderDoc>('save', async function (next) {
  if (this.isNew && !this.orderNumber) {
    const year = new Date().getFullYear();
    const count = await mongoose.model('Order').countDocuments({
      createdAt: {
        $gte: new Date(`${year}-01-01`),
        $lt: new Date(`${year + 1}-01-01`),
      },
    });
    this.orderNumber = `ORD-${year}-${String(count + 1).padStart(5, '0')}`;
  }
  next();
});

export const Order: Model<IOrderDoc> = mongoose.models.Order || mongoose.model<IOrderDoc>('Order', orderSchema);
