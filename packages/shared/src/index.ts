export interface User {
  id: string;
  name: string;
  email: string;
  role: 'customer' | 'seller' | 'admin' | 'warehouse';
  createdAt: string;
}

export interface Product {
  id: string;
  title: string;
  description: string;
  price: number;
  inventory: number;
  images: string[];
  sellerId: string;
}

export interface CartItem {
  productId: string;
  variantSku: string;
  quantity: number;
}

export interface Cart {
  userId: string;
  items: CartItem[];
}
