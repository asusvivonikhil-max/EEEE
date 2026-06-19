import { create } from 'zustand';

export interface CartStoreItem {
  productId: string;
  name: string;
  slug: string;
  description?: string;
  brand?: string;
  category?: string;
  variantSku: string;
  price: number;
  salePrice?: number;
  stock: number;
  images: string[];
  quantity: number;
  subtotal: number;
}

interface CartState {
  items: CartStoreItem[];
  totalItems: number;
  subtotal: number;
  isLoading: boolean;
  error: string | null;
  fetchCart: (token: string | null, isOffline: boolean) => Promise<void>;
  addItem: (
    token: string | null,
    isOffline: boolean,
    payload: { productId: string; variantSku: string; quantity: number },
    productDetails?: any
  ) => Promise<void>;
  updateQuantity: (token: string | null, isOffline: boolean, sku: string, quantity: number) => Promise<void>;
  removeItem: (token: string | null, isOffline: boolean, sku: string) => Promise<void>;
  clearCart: (token: string | null, isOffline: boolean) => Promise<void>;
}

const API_URL = 'http://localhost:5000/api';

// Helper to get headers
const getHeaders = (token: string | null) => {
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

// Helper for offline cart totals calculation
const calculateOfflineTotals = (items: CartStoreItem[]) => {
  const totalItems = items.reduce((acc, item) => acc + item.quantity, 0);
  const subtotal = Number(items.reduce((acc, item) => acc + item.subtotal, 0).toFixed(2));
  return { totalItems, subtotal };
};

export const useCartStore = create<CartState>((set) => ({
  items: [],
  totalItems: 0,
  subtotal: 0,
  isLoading: false,
  error: null,

  fetchCart: async (token, isOffline) => {
    set({ isLoading: true, error: null });
    if (isOffline || !token) {
      const local = localStorage.getItem('mock_cart');
      const items = local ? JSON.parse(local) : [];
      const { totalItems, subtotal } = calculateOfflineTotals(items);
      set({ items, totalItems, subtotal, isLoading: false });
      return;
    }

    try {
      const response = await fetch(`${API_URL}/cart`, {
        headers: getHeaders(token),
      });
      if (!response.ok) throw new Error('Failed to fetch cart');
      const resData = await response.json();
      if (resData.success) {
        set({
          items: resData.data.items,
          totalItems: resData.data.totalItems,
          subtotal: resData.data.subtotal,
        });
      }
    } catch (err: any) {
      // Fallback to local storage if API call fails
      const local = localStorage.getItem('mock_cart');
      const items = local ? JSON.parse(local) : [];
      const { totalItems, subtotal } = calculateOfflineTotals(items);
      set({ items, totalItems, subtotal, error: err.message });
    } finally {
      set({ isLoading: false });
    }
  },

  addItem: async (token, isOffline, payload, productDetails) => {
    set({ isLoading: true, error: null });
    if (isOffline || !token) {
      const local = localStorage.getItem('mock_cart');
      const items: CartStoreItem[] = local ? JSON.parse(local) : [];
      const existingItemIndex = items.findIndex((i) => i.variantSku === payload.variantSku);

      if (existingItemIndex > -1) {
        const newQty = items[existingItemIndex].quantity + payload.quantity;
        if (items[existingItemIndex].stock < newQty) {
          set({ isLoading: false, error: `Only ${items[existingItemIndex].stock} units available in stock` });
          throw new Error('Stock limit exceeded');
        }
        items[existingItemIndex].quantity = newQty;
        const price = items[existingItemIndex].salePrice !== undefined && items[existingItemIndex].salePrice !== null
          ? items[existingItemIndex].salePrice
          : items[existingItemIndex].price;
        items[existingItemIndex].subtotal = Number((price! * newQty).toFixed(2));
      } else {
        if (!productDetails) {
          set({ isLoading: false, error: 'Product details required for offline addition' });
          return;
        }
        const activeVariant = productDetails.variants?.find((v: any) => v.sku === payload.variantSku) || productDetails.variants?.[0];
        if (!activeVariant) {
          set({ isLoading: false, error: 'Product variant not found' });
          return;
        }
        if (activeVariant.stock < payload.quantity) {
          set({ isLoading: false, error: `Only ${activeVariant.stock} units available in stock` });
          throw new Error('Stock limit exceeded');
        }

        const price = activeVariant.salePrice !== undefined && activeVariant.salePrice !== null ? activeVariant.salePrice : activeVariant.price;

        items.push({
          productId: payload.productId,
          name: productDetails.name || productDetails.title,
          slug: productDetails.slug || '',
          variantSku: payload.variantSku,
          price: activeVariant.price,
          salePrice: activeVariant.salePrice,
          stock: activeVariant.stock,
          images: activeVariant.images && activeVariant.images.length > 0 ? activeVariant.images : (productDetails.images || []),
          quantity: payload.quantity,
          subtotal: Number((price * payload.quantity).toFixed(2)),
        });
      }

      localStorage.setItem('mock_cart', JSON.stringify(items));
      const { totalItems, subtotal } = calculateOfflineTotals(items);
      set({ items, totalItems, subtotal, isLoading: false });
      return;
    }

    try {
      const response = await fetch(`${API_URL}/cart/items`, {
        method: 'POST',
        headers: getHeaders(token),
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || 'Failed to add item to cart');
      }
      const resData = await response.json();
      if (resData.success) {
        set({
          items: resData.data.items,
          totalItems: resData.data.totalItems,
          subtotal: resData.data.subtotal,
        });
      }
    } catch (err: any) {
      set({ error: err.message });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  updateQuantity: async (token, isOffline, sku, quantity) => {
    set({ isLoading: true, error: null });
    if (isOffline || !token) {
      const local = localStorage.getItem('mock_cart');
      let items: CartStoreItem[] = local ? JSON.parse(local) : [];
      const itemIndex = items.findIndex((i) => i.variantSku === sku);

      if (itemIndex > -1) {
        if (quantity === 0) {
          items.splice(itemIndex, 1);
        } else {
          if (items[itemIndex].stock < quantity) {
            set({ isLoading: false, error: `Only ${items[itemIndex].stock} units available in stock` });
            throw new Error('Stock limit exceeded');
          }
          items[itemIndex].quantity = quantity;
          const price = items[itemIndex].salePrice !== undefined && items[itemIndex].salePrice !== null
            ? items[itemIndex].salePrice
            : items[itemIndex].price;
          items[itemIndex].subtotal = Number((price * quantity).toFixed(2));
        }
      }

      localStorage.setItem('mock_cart', JSON.stringify(items));
      const { totalItems, subtotal } = calculateOfflineTotals(items);
      set({ items, totalItems, subtotal, isLoading: false });
      return;
    }

    try {
      const response = await fetch(`${API_URL}/cart/items/${sku}`, {
        method: 'PUT',
        headers: getHeaders(token),
        body: JSON.stringify({ quantity }),
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || 'Failed to update item quantity');
      }
      const resData = await response.json();
      if (resData.success) {
        set({
          items: resData.data.items,
          totalItems: resData.data.totalItems,
          subtotal: resData.data.subtotal,
        });
      }
    } catch (err: any) {
      set({ error: err.message });
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  removeItem: async (token, isOffline, sku) => {
    set({ isLoading: true, error: null });
    if (isOffline || !token) {
      const local = localStorage.getItem('mock_cart');
      let items: CartStoreItem[] = local ? JSON.parse(local) : [];
      items = items.filter((i) => i.variantSku !== sku);

      localStorage.setItem('mock_cart', JSON.stringify(items));
      const { totalItems, subtotal } = calculateOfflineTotals(items);
      set({ items, totalItems, subtotal, isLoading: false });
      return;
    }

    try {
      const response = await fetch(`${API_URL}/cart/items/${sku}`, {
        method: 'DELETE',
        headers: getHeaders(token),
      });
      if (!response.ok) throw new Error('Failed to remove item');
      const resData = await response.json();
      if (resData.success) {
        set({
          items: resData.data.items,
          totalItems: resData.data.totalItems,
          subtotal: resData.data.subtotal,
        });
      }
    } catch (err: any) {
      set({ error: err.message });
    } finally {
      set({ isLoading: false });
    }
  },

  clearCart: async (token, isOffline) => {
    set({ isLoading: true, error: null });
    if (isOffline || !token) {
      localStorage.removeItem('mock_cart');
      set({ items: [], totalItems: 0, subtotal: 0, isLoading: false });
      return;
    }

    try {
      const response = await fetch(`${API_URL}/cart`, {
        method: 'DELETE',
        headers: getHeaders(token),
      });
      if (!response.ok) throw new Error('Failed to clear cart');
      const resData = await response.json();
      if (resData.success) {
        set({
          items: resData.data.items,
          totalItems: resData.data.totalItems,
          subtotal: resData.data.subtotal,
        });
      }
    } catch (err: any) {
      set({ error: err.message });
    } finally {
      set({ isLoading: false });
    }
  },
}));
