import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IWarehouseStock {
  warehouse: string;
  stock: number;
}

export interface IVariant {
  sku: string;
  color?: string;
  size?: string;
  price: number;
  salePrice?: number;
  stock: number;
  reserved?: number;
  images: string[];
  warehouseStocks: IWarehouseStock[];
}

export interface IProductDoc extends Document {
  name: string;
  slug: string;
  description: string;
  category: string;
  subcategory?: string;
  brand?: string;
  tags: string[];
  sellerId: mongoose.Types.ObjectId;
  variants: IVariant[];
  stats: {
    averageRating: number;
    reviewCount: number;
    salesCount: number;
    viewCount: number;
  };
  isActive: boolean;
  isFeatured: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const warehouseStockSchema = new Schema<IWarehouseStock>(
  {
    warehouse: { type: String, required: true },
    stock: { type: Number, required: true, min: 0, default: 0 }
  },
  { _id: false }
);

const variantSchema = new Schema<IVariant>(
  {
    sku: { type: String, required: true },
    color: String,
    size: String,
    price: { type: Number, required: true, min: 0 },
    salePrice: { type: Number, min: 0 },
    stock: { type: Number, required: true, min: 0, default: 0 },
    reserved: { type: Number, default: 0 },
    images: [{ type: String }],
    warehouseStocks: { type: [warehouseStockSchema], default: [] }
  },
  { _id: true }
);

const productSchema = new Schema<IProductDoc>(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    slug: { type: String, required: true, unique: true, lowercase: true },
    description: { type: String, required: true, maxlength: 5000 },
    category: { type: String, required: true, index: true },
    subcategory: String,
    brand: { type: String, index: true },
    tags: [{ type: String, lowercase: true }],
    sellerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    variants: [variantSchema],
    stats: {
      averageRating: { type: Number, default: 0, min: 0, max: 5 },
      reviewCount: { type: Number, default: 0 },
      salesCount: { type: Number, default: 0 },
      viewCount: { type: Number, default: 0 },
    },
    isActive: { type: Boolean, default: true, index: true },
    isFeatured: { type: Boolean, default: false, index: true },
  },
  {
    timestamps: true,
  }
);

// Indexes
productSchema.index({ category: 1, isActive: 1 });
productSchema.index({ sellerId: 1, isActive: 1 });
productSchema.index({ tags: 1 });
productSchema.index({ 'stats.averageRating': -1 });
productSchema.index({ createdAt: -1 });

// Full text search index
productSchema.index({ name: 'text', description: 'text', tags: 'text' });

// pre-save slug generator & multi-warehouse stock summarizer
productSchema.pre<IProductDoc>('save', function (next) {
  if (this.isModified('name') && !this.slug) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  // Auto-calculate variants total stock or split base stock for compatibility
  for (const variant of this.variants) {
    if (variant.warehouseStocks && variant.warehouseStocks.length > 0) {
      variant.stock = variant.warehouseStocks.reduce((sum, wh) => sum + wh.stock, 0);
    } else {
      const baseStock = variant.stock || 0;
      const nycStock = Math.floor(baseStock / 2);
      const laStock = baseStock - nycStock;
      variant.warehouseStocks = [
        { warehouse: 'NYC', stock: nycStock },
        { warehouse: 'LA', stock: laStock }
      ];
    }
  }

  next();
});

export const Product: Model<IProductDoc> = mongoose.models.Product || mongoose.model<IProductDoc>('Product', productSchema);
