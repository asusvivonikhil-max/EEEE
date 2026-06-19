import { Request, Response } from 'express';
import { Product } from '../models/Product';
import { asyncHandler } from '../middleware/errorHandler';
import { NotFoundError, ValidationError, ForbiddenError } from '../errors/AppError';
// @ts-ignore
import csvParser from 'csv-parser';
import { Readable } from 'stream';

export const listProducts = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, category, minPrice, maxPrice, search } = req.query as any;

  const query: any = { isActive: true };

  if (category) {
    query.category = category;
  }

  if (search) {
    // Mongo full-text search index query
    query.$text = { $search: search };
  }

  if (minPrice !== undefined || maxPrice !== undefined) {
    const priceQuery: any = {};
    if (minPrice !== undefined) priceQuery.$gte = Number(minPrice);
    if (maxPrice !== undefined) priceQuery.$lte = Number(maxPrice);
    query['variants.price'] = priceQuery;
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [products, total] = await Promise.all([
    Product.find(query)
      .sort(search ? { score: { $meta: 'textScore' } } : { createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate('sellerId', 'name email'),
    Product.countDocuments(query),
  ]);

  res.json({
    success: true,
    data: {
      products,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    },
  });
});

export const getProduct = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const product = await Product.findOne({ _id: id, isActive: true }).populate('sellerId', 'name email');
  if (!product) {
    throw new NotFoundError('Product');
  }

  res.json({
    success: true,
    data: product,
  });
});

export const createProduct = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new ForbiddenError('Authentication required');
  }

  const productData = {
    ...req.body,
    sellerId: req.user._id,
  };

  const product = await Product.create(productData);

  res.status(201).json({
    success: true,
    data: product,
  });
});

export const updateProduct = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const product = await Product.findById(id);
  if (!product) {
    throw new NotFoundError('Product');
  }

  // Ensure owner or admin is editing
  if (req.user?.role !== 'admin' && product.sellerId.toString() !== req.user?._id.toString()) {
    throw new ForbiddenError('You do not own this product');
  }

  const updatedProduct = await Product.findByIdAndUpdate(id, req.body, {
    new: true,
    runValidators: true,
  });

  res.json({
    success: true,
    data: updatedProduct,
  });
});

export const deleteProduct = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const product = await Product.findById(id);
  if (!product) {
    throw new NotFoundError('Product');
  }

  // Ensure owner or admin is deleting
  if (req.user?.role !== 'admin' && product.sellerId.toString() !== req.user?._id.toString()) {
    throw new ForbiddenError('You do not own this product');
  }

  // Soft delete (deactivate)
  product.isActive = false;
  await product.save();

  res.json({
    success: true,
    message: 'Product deleted successfully',
  });
});

export const bulkUploadProducts = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || !['seller', 'admin'].includes(req.user.role)) {
    throw new ForbiddenError('Sellers or Admin rights required');
  }

  if (!req.file) {
    throw new ValidationError([{ field: 'file', message: 'No CSV file uploaded' }]);
  }

  if (req.file.mimetype !== 'text/csv' && !req.file.originalname.endsWith('.csv')) {
    throw new ValidationError([{ field: 'file', message: 'Only CSV files are allowed' }]);
  }

  const results: any[] = [];
  const errors: string[] = [];
  let processedCount = 0;

  try {
    const stream = Readable.from(req.file.buffer);

    await new Promise<void>((resolve, reject) => {
      stream
        .pipe(
          csvParser({
            mapHeaders: ({ header }) => header.toLowerCase().trim(),
          })
        )
        .on('data', (row: any) => {
          results.push(row);
        })
        .on('end', () => {
          resolve();
        })
        .on('error', (err: any) => {
          reject(err);
        });
    });

    for (let i = 0; i < results.length; i++) {
      const row = results[i];
      const rowNum = i + 2; // header is row 1

      const name = row.name?.trim();
      const description = row.description?.trim();
      const category = row.category?.trim();
      const brand = row.brand?.trim();
      const sku = row.sku?.trim();
      const priceVal = parseFloat(row.price);
      const stockVal = parseInt(row.stock);
      const color = row.color?.trim();
      const size = row.size?.trim();

      if (!name || !category || !sku || isNaN(priceVal) || isNaN(stockVal)) {
        errors.push(`Row ${rowNum}: Missing required fields (name, category, sku, price, stock).`);
        continue;
      }

      // Check if product with the same name already exists for this seller
      let product = await Product.findOne({ name, sellerId: req.user._id });

      const newVariant = {
        sku,
        price: priceVal,
        stock: stockVal,
        color: color || undefined,
        size: size || undefined,
        images: [],
        warehouseStocks: [
          { warehouse: 'NYC', stock: Math.floor(stockVal / 2) },
          { warehouse: 'LA', stock: stockVal - Math.floor(stockVal / 2) }
        ]
      };

      if (product) {
        // Check if SKU already exists in this product
        const exists = product.variants.some(v => v.sku === sku);
        if (exists) {
          errors.push(`Row ${rowNum}: SKU '${sku}' already exists for product '${name}'.`);
          continue;
        }
        product.variants.push(newVariant as any);
        await product.save();
      } else {
        // Create new product
        if (!description) {
          errors.push(`Row ${rowNum}: Description is required for new products.`);
          continue;
        }

        product = new Product({
          name,
          description,
          category,
          brand: brand || undefined,
          sellerId: req.user._id,
          variants: [newVariant],
          isActive: true
        });
        await product.save();
      }

      processedCount++;
    }
  } catch (err: any) {
    throw new ValidationError([{ field: 'file', message: `Failed to process CSV file: ${err.message}` }]);
  }

  res.json({
    success: true,
    message: `Processed CSV upload. Successfully created/updated ${processedCount} products.`,
    data: {
      processedCount,
      totalRows: results.length,
      errors
    }
  });
});
