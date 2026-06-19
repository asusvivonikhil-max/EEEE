import { useState, useEffect } from 'react';
import type { User as SharedUser } from '@e-commerce/shared';
import { useCartStore } from './store/cartStore';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as ChartTooltip, 
  PieChart, 
  Pie, 
  Cell
} from 'recharts';

// Base API origin configuration
const API_URL = 'http://localhost:5000/api';

function App() {
  // Navigation & User State
  const [activeTab, setActiveTab] = useState<'storefront' | 'seller' | 'orders' | 'warehouse'>('storefront');
  const [user, setUser] = useState<SharedUser | null>(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });
  const [accessToken, setAccessToken] = useState<string | null>(() => {
    return localStorage.getItem('accessToken');
  });

  // Checkout & Order States
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [checkoutForm, setCheckoutForm] = useState({
    street: '',
    city: '',
    state: '',
    zip: '',
    country: '',
    phone: '',
  });
  const [checkoutResult, setCheckoutResult] = useState<{
    orderId: string;
    orderNumber: string;
    total: number;
    status: string;
    paymentMethod: string;
  } | null>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [isProcessingCheckout, setIsProcessingCheckout] = useState(false);

  // Cart UI States
  const [showCartDrawer, setShowCartDrawer] = useState(false);
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});

  // Zustand Cart Hooks
  const {
    items: cartItems,
    totalItems: cartTotalItems,
    subtotal: cartSubtotal,
    fetchCart,
    addItem: addCartItem,
    updateQuantity: updateCartItemQty,
    removeItem: removeCartItem,
    clearCart,
  } = useCartStore();

  // Auth Forms State
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '', role: 'customer' as SharedUser['role'] });

  // Storefront catalog state
  const [products, setProducts] = useState<any[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, pages: 1 });
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');

  // Seller Dashboard state
  const [sellerProducts, setSellerProducts] = useState<any[]>([]);
  const [productForm, setProductForm] = useState({
    name: '',
    description: '',
    category: 'electronics',
    brand: '',
    price: '',
    stock: '',
    sku: '',
    nycStock: '',
    laStock: '',
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);

  // Notifications
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // App running mode (Online vs Local Mock Fallback)
  const [isOfflineMode, setIsOfflineMode] = useState(false);

  // Sprints 5.1 - 5.3 states
  const [analytics, setAnalytics] = useState<any>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  // Sprints 6.1 - 6.3 states
  const [warehouseOrders, setWarehouseOrders] = useState<any[]>([]);
  const [pickList, setPickList] = useState<any[]>([]);
  const [checkedPicks, setCheckedPicks] = useState<Record<string, boolean>>({});
  const [shippingOrderId, setShippingOrderId] = useState<string | null>(null);
  const [trackingInput, setTrackingInput] = useState('');

  // Sprints 7.1 - 7.3 states
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [uploadingCsv, setUploadingCsv] = useState(false);
  const [csvUploadResult, setCsvUploadResult] = useState<any>(null);

  const [useVariants, setUseVariants] = useState(false);
  const [attributes, setAttributes] = useState<{ name: string; options: string }[]>([
    { name: 'Size', options: 'S, M, L' },
    { name: 'Color', options: 'Red, Blue' }
  ]);
  const [variantsList, setVariantsList] = useState<any[]>([]);

  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<any>(null);
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [couponError, setCouponError] = useState('');

  // Seller Coupon Management
  const [coupons, setCoupons] = useState<any[]>([]);
  const [showCouponForm, setShowCouponForm] = useState(false);
  const [couponForm, setCouponForm] = useState({
    code: '',
    discountType: 'percentage',
    discountValue: '',
    minOrderAmount: '',
    usageLimit: '',
  });

  const discountVal = appliedCoupon ? appliedCoupon.discountAmount : 0;
  const discountedSub = cartSubtotal - discountVal;
  const shippingVal = discountedSub >= 150 ? 0 : 15;
  const taxVal = Number((discountedSub * 0.08).toFixed(2));
  const totalVal = Number((discountedSub + shippingVal + taxVal).toFixed(2));

  // Show status alerts
  const showAlert = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };

  // ── Mock Database Fallback (if API Server/MongoDB is down) ──────────────────
  const getMockProducts = (): any[] => {
    const saved = localStorage.getItem('mock_products');
    if (saved) return JSON.parse(saved);

    const initialMocks = [
      {
        _id: 'mock-1',
        name: 'Quantum Sound Wireless Headphones',
        slug: 'quantum-sound-headphones',
        description: 'Premium active noise cancelling wireless over-ear headphones with high-fidelity acoustics and 40-hour battery life.',
        category: 'electronics',
        brand: 'Quantum',
        tags: ['headphones', 'audio', 'wireless'],
        variants: [{ sku: 'QTY-SND-BLK', price: 149.99, stock: 12, images: [] }],
        stats: { averageRating: 4.8, reviewCount: 42, salesCount: 150, viewCount: 400 },
        isActive: true,
        sellerId: { name: 'ElectroHub Store' },
      },
      {
        _id: 'mock-2',
        name: 'AeroGlide Running Shoes',
        slug: 'aeroglide-running-shoes',
        description: 'Lightweight breathable mesh athletic shoes featuring responsive foam midsoles for peak running performance.',
        category: 'clothing',
        brand: 'Aero',
        tags: ['shoes', 'sports', 'apparel'],
        variants: [{ sku: 'AERO-GLD-10', price: 89.99, stock: 8, images: [] }],
        stats: { averageRating: 4.5, reviewCount: 19, salesCount: 88, viewCount: 210 },
        isActive: true,
        sellerId: { name: 'Apex Sports' },
      },
      {
        _id: 'mock-3',
        name: 'Minimalist Walnut Study Desk',
        slug: 'minimalist-walnut-study-desk',
        description: 'Solid walnut writing table with integrated cable management slot and drawer, crafted for minimalists.',
        category: 'home',
        brand: 'Timbercraft',
        tags: ['desk', 'table', 'furniture'],
        variants: [{ sku: 'TMB-DESK-WLN', price: 299.00, stock: 4, images: [] }],
        stats: { averageRating: 4.9, reviewCount: 7, salesCount: 15, viewCount: 95 },
        isActive: true,
        sellerId: { name: 'Timbercraft Co' },
      }
    ];
    localStorage.setItem('mock_products', JSON.stringify(initialMocks));
    return initialMocks;
  };

  // ── Fetch Products ──────────────────────────────────────────────────────────
  const fetchProducts = async () => {
    try {
      const queryParams = new URLSearchParams();
      queryParams.append('page', pagination.page.toString());
      queryParams.append('limit', pagination.limit.toString());
      if (categoryFilter) queryParams.append('category', categoryFilter);
      if (searchQuery) queryParams.append('search', searchQuery);
      if (minPrice) queryParams.append('minPrice', minPrice);
      if (maxPrice) queryParams.append('maxPrice', maxPrice);

      const response = await fetch(`${API_URL}/products?${queryParams.toString()}`);
      if (!response.ok) throw new Error('API server returned error');
      const resData = await response.json();
      
      if (resData.success) {
        setProducts(resData.data.products);
        setPagination(resData.data.pagination);
        setIsOfflineMode(false);
      }
    } catch (error) {
      // API Offline Fallback Mode
      setIsOfflineMode(true);
      const allMocks = getMockProducts();
      
      // Apply filters locally
      let filtered = allMocks.filter(p => p.isActive);
      if (categoryFilter) {
        filtered = filtered.filter(p => p.category === categoryFilter);
      }
      if (searchQuery) {
        const s = searchQuery.toLowerCase();
        filtered = filtered.filter(p => p.name.toLowerCase().includes(s) || p.description.toLowerCase().includes(s));
      }
      if (minPrice) {
        filtered = filtered.filter(p => p.variants[0].price >= parseFloat(minPrice));
      }
      if (maxPrice) {
        filtered = filtered.filter(p => p.variants[0].price <= parseFloat(maxPrice));
      }

      setProducts(filtered);
      setPagination({
        page: 1,
        limit: 10,
        total: filtered.length,
        pages: 1,
      });
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [categoryFilter, searchQuery, minPrice, maxPrice]);

  // Load seller specific items
  useEffect(() => {
    if (user?.role === 'seller' || user?.role === 'admin') {
      if (isOfflineMode) {
        const allMocks = getMockProducts();
        setSellerProducts(allMocks.filter(p => p.sellerId?.name === user.name));
      } else {
        // In real backend, we'd query /api/products?sellerId=user.id
        // For simplicity, we just filter the catalog list
        const mine = products.filter(p => p.sellerId?._id === (user as any).id || p.sellerId?.email === user.email);
        setSellerProducts(mine);
      }
    }
  }, [products, user, isOfflineMode]);

  // Load shopping cart
  useEffect(() => {
    fetchCart(accessToken, isOfflineMode);
  }, [accessToken, isOfflineMode, fetchCart]);

  const handleAddToCart = async (product: any, variantSku: string) => {
    try {
      await addCartItem(accessToken, isOfflineMode, {
        productId: product._id,
        variantSku,
        quantity: 1,
      }, product);
      showAlert('success', 'Item added to cart!');
    } catch (error: any) {
      showAlert('error', error.message || 'Failed to add item to cart');
    }
  };

  const fetchOrders = async () => {
    if (isOfflineMode || !accessToken) {
      const local = localStorage.getItem('mock_orders');
      setOrders(local ? JSON.parse(local) : []);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/orders`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (!response.ok) throw new Error('Failed to fetch orders');
      const resData = await response.json();
      if (resData.success) {
        setOrders(resData.data);
      }
    } catch (err: any) {
      const local = localStorage.getItem('mock_orders');
      setOrders(local ? JSON.parse(local) : []);
    }
  };

  useEffect(() => {
    if (user) {
      fetchOrders();
    } else {
      setOrders([]);
    }
  }, [user, accessToken, isOfflineMode]);

  useEffect(() => {
    if ((user?.role === 'seller' || user?.role === 'admin') && activeTab === 'seller') {
      fetchAnalytics();
      fetchCoupons();
    }
  }, [user, activeTab, isOfflineMode]);

  useEffect(() => {
    if (user && ['warehouse', 'seller', 'admin'].includes(user.role) && activeTab === 'warehouse') {
      fetchWarehouseData();
    }
  }, [user, activeTab, isOfflineMode]);

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cartItems.length === 0) return showAlert('error', 'Cart is empty');

    setIsProcessingCheckout(true);

    if (isOfflineMode || !accessToken) {
      // Offline local checkout simulation
      setTimeout(() => {
        const orderNumber = `ORD-2026-${Math.floor(Math.random() * 90000 + 10000)}`;
        const orderId = 'mock-ord-' + Date.now();
        const discountVal = appliedCoupon ? appliedCoupon.discountAmount : 0;
        const discountedSub = cartSubtotal - discountVal;
        const shippingVal = discountedSub >= 150 ? 0 : 15;
        const taxVal = Number((discountedSub * 0.08).toFixed(2));
        const totalVal = Number((discountedSub + shippingVal + taxVal).toFixed(2));

        const mockProducts = JSON.parse(localStorage.getItem('mock_products') || '[]');
        const updatedItems = cartItems.map(item => {
          const pIndex = mockProducts.findIndex((mp: any) => mp._id === item.productId);
          let allocations: { warehouse: string; quantity: number }[] = [];
          
          if (pIndex > -1) {
            const vIndex = mockProducts[pIndex].variants.findIndex((v: any) => v.sku === item.variantSku);
            if (vIndex > -1) {
              const variant = mockProducts[pIndex].variants[vIndex];
              let whStocks = variant.warehouseStocks;
              if (!whStocks || whStocks.length === 0) {
                const baseStock = variant.stock || 0;
                const nycStock = Math.floor(baseStock / 2);
                const laStock = baseStock - nycStock;
                whStocks = [
                  { warehouse: 'NYC', stock: nycStock },
                  { warehouse: 'LA', stock: laStock }
                ];
              }

              let remainingQty = item.quantity;
              for (const whStock of whStocks) {
                if (remainingQty <= 0) break;
                if (whStock.stock > 0) {
                  const allocatedQty = Math.min(whStock.stock, remainingQty);
                  allocations.push({
                    warehouse: whStock.warehouse,
                    quantity: allocatedQty,
                  });
                  whStock.stock -= allocatedQty;
                  remainingQty -= allocatedQty;
                }
              }
              
              variant.warehouseStocks = whStocks;
              variant.stock = whStocks.reduce((sum: number, ws: any) => sum + ws.stock, 0);
            }
          }
          
          if (allocations.length === 0) {
            allocations = [
              { warehouse: 'NYC', quantity: Math.min(item.quantity, 5) },
              { warehouse: 'LA', quantity: Math.max(0, item.quantity - 5) }
            ];
          }

          return {
            productId: item.productId,
            variantSku: item.variantSku,
            snapshot: { name: item.name, sku: item.variantSku, image: item.images?.[0], price: item.price },
            quantity: item.quantity,
            unitPrice: item.price,
            totalPrice: item.subtotal,
            allocations
          };
        });

        const mockOrder = {
          _id: orderId,
          orderNumber,
          customerId: { name: user?.name || 'Guest User', email: user?.email || 'guest@example.com' },
          items: updatedItems,
          shippingAddress: checkoutForm,
          subtotal: cartSubtotal,
          discountAmount: discountVal,
          couponCode: appliedCoupon ? appliedCoupon.couponCode : undefined,
          shipping: shippingVal,
          tax: taxVal,
          total: totalVal,
          status: 'processing',
          paymentStatus: 'paid',
          paymentMethod: 'simulated',
          statusHistory: [
            { status: 'pending', timestamp: new Date().toISOString(), note: 'Order checkout initialized' },
            { status: 'paid', timestamp: new Date().toISOString(), note: 'Payment confirmed via simulated gateway (offline)' },
            { status: 'processing', timestamp: new Date().toISOString(), note: 'Order processing started' }
          ],
          createdAt: new Date().toISOString()
        };

        const existingOrders = JSON.parse(localStorage.getItem('mock_orders') || '[]');
        localStorage.setItem('mock_orders', JSON.stringify([mockOrder, ...existingOrders]));
        localStorage.setItem('mock_products', JSON.stringify(mockProducts));

        // Update offline coupon usage count
        if (appliedCoupon) {
          const localCoupons = JSON.parse(localStorage.getItem('mock_coupons') || '[]');
          const cIdx = localCoupons.findIndex((c: any) => c.code === appliedCoupon.couponCode);
          if (cIdx > -1) {
            localCoupons[cIdx].usageCount += 1;
            localStorage.setItem('mock_coupons', JSON.stringify(localCoupons));
            setCoupons(localCoupons);
          }
        }

        setCheckoutResult({
          orderId,
          orderNumber,
          total: mockOrder.total,
          status: 'processing',
          paymentMethod: 'simulated'
        });
        clearCart(null, true);
        fetchProducts(); // refresh catalog stock tags
        setOrders([mockOrder, ...existingOrders]);
        setIsProcessingCheckout(false);
        showAlert('success', 'Order created successfully (Offline Simulation)!');
      }, 1500);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/orders/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ 
          shippingAddress: checkoutForm,
          couponCode: appliedCoupon ? appliedCoupon.couponCode : undefined
        }),
      });
      const resData = await response.json();
      if (!response.ok) throw new Error(resData.message || 'Checkout failed');

      const { orderId, orderNumber, paymentMethod, total } = resData.data;

      if (paymentMethod === 'simulated') {
        const confirmRes = await fetch(`${API_URL}/orders/${orderId}/simulate-payment`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
        const confirmData = await confirmRes.json();
        if (!confirmRes.ok) throw new Error(confirmData.message || 'Payment simulation failed');

        setCheckoutResult({
          orderId,
          orderNumber,
          total,
          status: 'processing',
          paymentMethod: 'simulated'
        });
        clearCart(accessToken, false);
        fetchOrders();
      } else {
        // Stripe path - simulate card validation delay
        setTimeout(async () => {
          const confirmRes = await fetch(`${API_URL}/orders/${orderId}/simulate-payment`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          });
          const confirmData = await confirmRes.json();
          if (!confirmRes.ok) throw new Error(confirmData.message || 'Payment confirmation failed');

          setCheckoutResult({
            orderId,
            orderNumber,
            total,
            status: 'processing',
            paymentMethod: 'stripe'
          });
          clearCart(accessToken, false);
          fetchOrders();
        }, 1500);
      }
      showAlert('success', `Order ${orderNumber} created!`);
    } catch (error: any) {
      showAlert('error', error.message || 'Checkout request failed');
    } finally {
      setIsProcessingCheckout(false);
    }
  };

  const handleOrderStatusUpdate = async (orderId: string, status: string, trackingNumber?: string) => {
    if (isOfflineMode || !accessToken) {
      const local = localStorage.getItem('mock_orders');
      if (local) {
        const list = JSON.parse(local);
        const oIndex = list.findIndex((o: any) => o._id === orderId);
        if (oIndex > -1) {
          const currentStatus = list[oIndex].status;
          list[oIndex].status = status;
          if (trackingNumber) list[oIndex].trackingNumber = trackingNumber;
          list[oIndex].statusHistory.push({
            status,
            timestamp: new Date().toISOString(),
            note: `Status updated from ${currentStatus} to ${status} (offline)`
          });
          localStorage.setItem('mock_orders', JSON.stringify(list));
          setOrders(list);
          showAlert('success', `Order status updated to ${status}`);
        }
      }
      return;
    }

    try {
      const response = await fetch(`${API_URL}/orders/${orderId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ status, trackingNumber }),
      });
      const resData = await response.json();
      if (!response.ok) throw new Error(resData.message || 'Failed to update status');

      showAlert('success', `Order status updated to ${status}`);
      fetchOrders();
    } catch (err: any) {
      showAlert('error', err.message || 'Failed to update order status');
    }
  };

  // ── Authentication Actions ──────────────────────────────────────────────────
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isRegistering) {
      // Register request
      try {
        const response = await fetch(`${API_URL}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(authForm),
        });
        const resData = await response.json();
        if (!response.ok) throw new Error(resData.message || 'Registration failed');
        
        setUser(resData.data.user);
        setAccessToken(resData.data.accessToken);
        localStorage.setItem('user', JSON.stringify(resData.data.user));
        localStorage.setItem('accessToken', resData.data.accessToken);
        showAlert('success', `Registered successfully as ${resData.data.user.name}`);
        setShowAuthModal(false);
      } catch (error: any) {
        // Fallback registration local mock
        const mockUser: SharedUser = {
          id: `usr-${Date.now()}`,
          name: authForm.name,
          email: authForm.email,
          role: authForm.role,
          createdAt: new Date().toISOString(),
        };
        setUser(mockUser);
        setAccessToken('mock_token_pair_xxx');
        localStorage.setItem('user', JSON.stringify(mockUser));
        localStorage.setItem('accessToken', 'mock_token_pair_xxx');
        showAlert('success', `[Offline Mode] Registered as ${authForm.name}`);
        setShowAuthModal(false);
      }
    } else {
      // Login request
      try {
        const response = await fetch(`${API_URL}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: authForm.email, password: authForm.password }),
        });
        const resData = await response.json();
        if (!response.ok) throw new Error(resData.message || 'Login failed');
        
        setUser(resData.data.user);
        setAccessToken(resData.data.accessToken);
        localStorage.setItem('user', JSON.stringify(resData.data.user));
        localStorage.setItem('accessToken', resData.data.accessToken);
        showAlert('success', `Welcome back, ${resData.data.user.name}`);
        setShowAuthModal(false);
      } catch (error: any) {
        // Fallback login local mock
        const mockUser: SharedUser = {
          id: `usr-${Date.now()}`,
          name: authForm.name || authForm.email.split('@')[0],
          email: authForm.email,
          role: authForm.role || 'customer',
          createdAt: new Date().toISOString(),
        };
        setUser(mockUser);
        setAccessToken('mock_token_pair_xxx');
        localStorage.setItem('user', JSON.stringify(mockUser));
        localStorage.setItem('accessToken', 'mock_token_pair_xxx');
        showAlert('success', `[Offline Mode] Logged in as ${mockUser.name}`);
        setShowAuthModal(false);
      }
    }
  };

  const handleLogout = () => {
    setUser(null);
    setAccessToken(null);
    localStorage.removeItem('user');
    localStorage.removeItem('accessToken');
    showAlert('success', 'Logged out successfully');
  };

  // ── Product Operations ──────────────────────────────────────────────────────
  const handleProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return showAlert('error', 'You must login first');

    let imageUrl = '';

    // File upload
    if (selectedFile) {
      setUploadingFile(true);
      const formData = new FormData();
      formData.append('image', selectedFile);

      try {
        const response = await fetch(`${API_URL}/products/upload`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`
          },
          body: formData,
        });
        const resData = await response.json();
        if (!response.ok) throw new Error(resData.message || 'File upload failed');
        imageUrl = resData.data.url;
      } catch (error) {
        // Fallback upload (local DataURL preview)
        imageUrl = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.readAsDataURL(selectedFile);
          reader.onloadend = () => resolve(reader.result as string);
        });
      } finally {
        setUploadingFile(false);
      }
    }

    const payload = {
      name: productForm.name,
      description: productForm.description,
      category: productForm.category,
      brand: productForm.brand,
      variants: useVariants 
        ? variantsList.map(v => ({
            sku: v.sku || `SKU-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            price: parseFloat(v.price) || 0,
            stock: parseInt(v.stock) || 0,
            color: v.color,
            size: v.size,
            images: imageUrl ? [imageUrl] : [],
            warehouseStocks: v.warehouseStocks || [
              { warehouse: 'NYC', stock: Math.floor((parseInt(v.stock) || 0) / 2) },
              { warehouse: 'LA', stock: (parseInt(v.stock) || 0) - Math.floor((parseInt(v.stock) || 0) / 2) }
            ]
          }))
        : [
            {
              sku: productForm.sku || `SKU-${Date.now()}`,
              price: parseFloat(productForm.price),
              stock: (parseInt(productForm.nycStock) || 0) + (parseInt(productForm.laStock) || 0),
              images: imageUrl ? [imageUrl] : [],
              warehouseStocks: [
                { warehouse: 'NYC', stock: parseInt(productForm.nycStock) || 0 },
                { warehouse: 'LA', stock: parseInt(productForm.laStock) || 0 }
              ]
            }
          ]
    };

    try {
      const response = await fetch(`${API_URL}/products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });
      const resData = await response.json();
      if (!response.ok) throw new Error(resData.message || 'Product creation failed');

      showAlert('success', `Product "${productForm.name}" created successfully`);
      fetchProducts();
      resetProductForm();
    } catch (error) {
      // Fallback create local mock
      const mockProduct = {
        _id: `prod-${Date.now()}`,
        name: productForm.name,
        slug: productForm.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        description: productForm.description,
        category: productForm.category,
        brand: productForm.brand,
        tags: [],
        variants: useVariants
          ? variantsList.map(v => ({
              sku: v.sku || `SKU-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              price: parseFloat(v.price) || 0,
              stock: parseInt(v.stock) || 0,
              color: v.color,
              size: v.size,
              images: imageUrl ? [imageUrl] : [],
              warehouseStocks: v.warehouseStocks || [
                { warehouse: 'NYC', stock: Math.floor((parseInt(v.stock) || 0) / 2) },
                { warehouse: 'LA', stock: (parseInt(v.stock) || 0) - Math.floor((parseInt(v.stock) || 0) / 2) }
              ]
            }))
          : [
              {
                sku: productForm.sku || `SKU-${Date.now()}`,
                price: parseFloat(productForm.price),
                stock: (parseInt(productForm.nycStock) || 0) + (parseInt(productForm.laStock) || 0),
                images: imageUrl ? [imageUrl] : [],
                warehouseStocks: [
                  { warehouse: 'NYC', stock: parseInt(productForm.nycStock) || 0 },
                  { warehouse: 'LA', stock: parseInt(productForm.laStock) || 0 }
                ]
              }
            ],
        stats: { averageRating: 0, reviewCount: 0, salesCount: 0, viewCount: 0 },
        isActive: true,
        sellerId: { name: user.name }
      };

      const mockDb = getMockProducts();
      mockDb.unshift(mockProduct);
      localStorage.setItem('mock_products', JSON.stringify(mockDb));
      
      showAlert('success', `[Offline Mode] Created product "${productForm.name}"`);
      fetchProducts();
      resetProductForm();
    }
  };

  const resetProductForm = () => {
    setProductForm({
      name: '',
      description: '',
      category: 'electronics',
      brand: '',
      price: '',
      stock: '',
      sku: '',
      nycStock: '',
      laStock: '',
    });
    setUseVariants(false);
    setVariantsList([]);
    setSelectedFile(null);
  };

  const handleDeleteProduct = async (id: string) => {
    try {
      const response = await fetch(`${API_URL}/products/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        }
      });
      if (!response.ok) throw new Error('Deletion failed');
      showAlert('success', 'Product deleted');
      fetchProducts();
    } catch (error) {
      // Offline local delete
      const mockDb = getMockProducts();
      const updated = mockDb.filter(p => p._id !== id);
      localStorage.setItem('mock_products', JSON.stringify(updated));
      showAlert('success', '[Offline Mode] Product deleted');
      fetchProducts();
    }
  };

  // ── Seller Analytics & Coupon Operations (Sprints 5.1 - 5.3) ──────────────────
  const fetchAnalytics = async () => {
    if (isOfflineMode || !accessToken) {
      // Offline local analytics mock
      const mockSalesTrajectory = [
        { date: 'Jun 13', revenue: 120.00 },
        { date: 'Jun 14', revenue: 250.50 },
        { date: 'Jun 15', revenue: 80.00 },
        { date: 'Jun 16', revenue: 450.00 },
        { date: 'Jun 17', revenue: 190.20 },
        { date: 'Jun 18', revenue: 320.00 },
        { date: 'Jun 19', revenue: 540.00 },
      ];
      
      const categoryCounts: Record<string, number> = {};
      sellerProducts.forEach(p => {
        const cat = p.category || 'other';
        categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
      });

      const mockCategoryBreakdown = Object.entries(categoryCounts).map(([name, count]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        value: count * 5
      }));

      setAnalytics({
        kpis: {
          totalRevenue: 1950.70,
          totalSalesCount: 59,
          activeListings: sellerProducts.filter(p => p.isActive).length,
          totalListings: sellerProducts.length,
        },
        stockAlerts: sellerProducts.flatMap(p => 
          p.variants.filter((v: any) => v.stock < 5).map((v: any) => ({
            productId: p._id,
            productName: p.name,
            sku: v.sku,
            stock: v.stock,
            color: v.color,
            size: v.size
          }))
        ),
        salesTrajectory: mockSalesTrajectory,
        categoryBreakdown: mockCategoryBreakdown.length > 0 ? mockCategoryBreakdown : [{ name: 'Electronics', value: 10 }]
      });
      return;
    }

    setLoadingAnalytics(true);
    try {
      const response = await fetch(`${API_URL}/seller/analytics`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const resData = await response.json();
      if (response.ok) {
        setAnalytics(resData.data);
      } else {
        showAlert('error', resData.message || 'Failed to fetch analytics');
      }
    } catch (err: any) {
      showAlert('error', err.message || 'Failed to fetch analytics');
    } finally {
      setLoadingAnalytics(false);
    }
  };

  const fetchCoupons = async () => {
    if (isOfflineMode || !accessToken) {
      const local = localStorage.getItem('mock_coupons');
      if (local) {
        setCoupons(JSON.parse(local));
      } else {
        const defaultCoupons = [
          { _id: 'c1', code: 'SUMMER20', discountType: 'percentage', discountValue: 20, minOrderAmount: 50, usageLimit: 100, usageCount: 12, isActive: true },
          { _id: 'c2', code: 'FIXED10', discountType: 'fixed', discountValue: 10, minOrderAmount: 30, usageLimit: 50, usageCount: 4, isActive: true }
        ];
        localStorage.setItem('mock_coupons', JSON.stringify(defaultCoupons));
        setCoupons(defaultCoupons);
      }
      return;
    }

    try {
      const response = await fetch(`${API_URL}/coupons`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const resData = await response.json();
      if (response.ok) {
        setCoupons(resData.data);
      } else {
        showAlert('error', resData.message || 'Failed to fetch coupons');
      }
    } catch (err: any) {
      showAlert('error', err.message || 'Failed to fetch coupons');
    }
  };

  const handleCouponSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      code: couponForm.code.toUpperCase().trim(),
      discountType: couponForm.discountType,
      discountValue: parseFloat(couponForm.discountValue),
      minOrderAmount: parseFloat(couponForm.minOrderAmount) || 0,
      usageLimit: parseInt(couponForm.usageLimit) || undefined,
    };

    if (!payload.code || isNaN(payload.discountValue)) {
      return showAlert('error', 'Please enter a valid code and discount value');
    }

    if (isOfflineMode || !accessToken) {
      const local = localStorage.getItem('mock_coupons');
      const list = local ? JSON.parse(local) : [];
      const newCoupon = {
        _id: 'mock-c-' + Date.now(),
        ...payload,
        usageCount: 0,
        isActive: true,
        createdAt: new Date().toISOString()
      };
      const updated = [newCoupon, ...list];
      localStorage.setItem('mock_coupons', JSON.stringify(updated));
      setCoupons(updated);
      showAlert('success', `[Offline Mode] Coupon ${payload.code} created`);
      setCouponForm({ code: '', discountType: 'percentage', discountValue: '', minOrderAmount: '', usageLimit: '' });
      setShowCouponForm(false);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/coupons`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });
      const resData = await response.json();
      if (response.ok) {
        showAlert('success', `Coupon ${payload.code} created!`);
        fetchCoupons();
        setCouponForm({ code: '', discountType: 'percentage', discountValue: '', minOrderAmount: '', usageLimit: '' });
        setShowCouponForm(false);
      } else {
        showAlert('error', resData.message || 'Failed to create coupon');
      }
    } catch (err: any) {
      showAlert('error', err.message || 'Failed to create coupon');
    }
  };

  const generateVariantMatrix = () => {
    const validAttrs = attributes.filter(a => a.name.trim() && a.options.trim());
    if (validAttrs.length === 0) {
      showAlert('error', 'Please define at least one attribute with options');
      return;
    }

    const optionsArray = validAttrs.map(a => 
      a.options.split(',').map(o => o.trim()).filter(Boolean)
    );

    const cartesian = (arrays: string[][]): string[][] => {
      return arrays.reduce((acc, curr) => {
        return acc.flatMap(d => curr.map(e => [...d, e]));
      }, [[]] as string[][]);
    };

    const combinations = cartesian(optionsArray);

    const newVariants = combinations.map((combo, index) => {
      const attrValues = combo.join('-');
      const sku = `${productForm.sku || 'SKU'}-${attrValues.toUpperCase().replace(/\s+/g, '')}-${index + 1}`;
      const defaultStock = parseInt(productForm.stock) || 10;
      const nycStock = Math.floor(defaultStock / 2);
      const laStock = defaultStock - nycStock;
      
      const variantObj: any = {
        sku,
        price: parseFloat(productForm.price) || 0,
        stock: defaultStock,
        warehouseStocks: [
          { warehouse: 'NYC', stock: nycStock },
          { warehouse: 'LA', stock: laStock }
        ]
      };

      combo.forEach((val, idx) => {
        const nameLower = validAttrs[idx].name.toLowerCase();
        if (nameLower === 'color') {
          variantObj.color = val;
        } else if (nameLower === 'size') {
          variantObj.size = val;
        } else {
          variantObj[nameLower] = val;
        }
      });

      return variantObj;
    });

    setVariantsList(newVariants);
    showAlert('success', `Generated matrix with ${newVariants.length} combinations!`);
  };

  const updateVariantField = (index: number, field: string, value: any) => {
    const updated = [...variantsList];
    updated[index] = {
      ...updated[index],
      [field]: value
    };
    setVariantsList(updated);
  };

  const updateVariantWarehouseStock = (index: number, warehouse: string, stockVal: number) => {
    const updated = [...variantsList];
    const currentStocks = [...(updated[index].warehouseStocks || [])];
    const idx = currentStocks.findIndex((ws: any) => ws.warehouse === warehouse);
    if (idx !== -1) {
      currentStocks[idx] = { ...currentStocks[idx], stock: stockVal };
    } else {
      currentStocks.push({ warehouse, stock: stockVal });
    }
    updated[index].stock = currentStocks.reduce((sum: number, w: any) => sum + w.stock, 0);
    updated[index].warehouseStocks = currentStocks;
    setVariantsList(updated);
  };

  const fetchWarehouseData = async () => {
    if (isOfflineMode || !accessToken) {
      const localOrders = localStorage.getItem('mock_orders');
      const ordersList = localOrders ? JSON.parse(localOrders) : [];
      const processingOrders = ordersList.filter((o: any) => o.status === 'processing');
      setWarehouseOrders(processingOrders);
      
      const pickMap: { [key: string]: any } = {};
      for (const order of processingOrders) {
        for (const item of order.items) {
          const allocs = item.allocations || [
            { warehouse: 'NYC', quantity: Math.floor(item.quantity / 2) || 1 },
            { warehouse: 'LA', quantity: item.quantity - (Math.floor(item.quantity / 2) || 1) }
          ];
          for (const alloc of allocs) {
            if (alloc.quantity <= 0) continue;
            const key = `${alloc.warehouse}_${item.variantSku}`;
            if (pickMap[key]) {
              pickMap[key].quantity += alloc.quantity;
            } else {
              pickMap[key] = {
                sku: item.variantSku,
                name: item.snapshot?.name || item.name || 'Product',
                warehouse: alloc.warehouse,
                quantity: alloc.quantity
              };
            }
          }
        }
      }
      setPickList(Object.values(pickMap));
      return;
    }

    try {
      const resQueue = await fetch(`${API_URL}/warehouse/orders`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      const dataQueue = await resQueue.json();
      if (resQueue.ok && dataQueue.success) {
        setWarehouseOrders(dataQueue.data);
      }

      const resPick = await fetch(`${API_URL}/warehouse/picklist`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      const dataPick = await resPick.json();
      if (resPick.ok && dataPick.success) {
        setPickList(dataPick.data);
      }
    } catch (err: any) {
      console.error('Error fetching warehouse data:', err);
      showAlert('error', 'Failed to load warehouse queue data');
    }
  };

  const handlePackAndShipOrder = async (orderId: string, trackingNumber: string) => {
    if (!trackingNumber.trim()) {
      showAlert('error', 'Tracking number is required to pack and ship');
      return;
    }

    if (isOfflineMode || !accessToken) {
      const local = localStorage.getItem('mock_orders');
      if (local) {
        const list = JSON.parse(local);
        const oIndex = list.findIndex((o: any) => o._id === orderId);
        if (oIndex > -1) {
          const currentStatus = list[oIndex].status;
          list[oIndex].status = 'shipped';
          list[oIndex].trackingNumber = trackingNumber;
          list[oIndex].statusHistory.push({
            status: 'shipped',
            timestamp: new Date().toISOString(),
            note: `Order packed and shipped (offline) - transitioned from ${currentStatus} to shipped with tracking: ${trackingNumber}`
          });
          localStorage.setItem('mock_orders', JSON.stringify(list));
          showAlert('success', 'Order packed and shipped successfully');
          fetchWarehouseData();
        }
      }
      return;
    }

    try {
      const response = await fetch(`${API_URL}/warehouse/orders/${orderId}/pack`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ trackingNumber }),
      });
      const resData = await response.json();
      if (!response.ok) throw new Error(resData.message || 'Failed to pack and ship order');

      showAlert('success', 'Order packed and shipped successfully');
      fetchWarehouseData();
    } catch (err: any) {
      showAlert('error', err.message || 'Failed to pack and ship order');
    }
  };

  const handleCsvUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvFile) {
      showAlert('error', 'Please select a CSV file');
      return;
    }

    setUploadingCsv(true);
    setCsvUploadResult(null);

    if (isOfflineMode || !accessToken) {
      setTimeout(() => {
        try {
          const reader = new FileReader();
          reader.onload = (event) => {
            const text = event.target?.result as string;
            if (!text) return;

            const lines = text.split(/\r?\n/);
            if (lines.length === 0 || !lines[0].trim()) {
              showAlert('error', 'CSV file is empty');
              setUploadingCsv(false);
              return;
            }

            const parseCsvLine = (lineText: string) => {
              const result = [];
              let current = '';
              let inQuotes = false;
              for (let idx = 0; idx < lineText.length; idx++) {
                const char = lineText[idx];
                if (char === '"') {
                  inQuotes = !inQuotes;
                } else if (char === ',' && !inQuotes) {
                  result.push(current.trim());
                  current = '';
                } else {
                  current += char;
                }
              }
              result.push(current.trim());
              return result;
            };

            const headers = parseCsvLine(lines[0]).map(h => h.toLowerCase());
            const mockDb = getMockProducts();
            let successCount = 0;
            const errors: string[] = [];

            for (let i = 1; i < lines.length; i++) {
              const line = lines[i].trim();
              if (!line) continue;

              const values = parseCsvLine(line);
              const rowNum = i + 1;

              const row: any = {};
              headers.forEach((h, idx) => {
                row[h] = values[idx];
              });

              const name = row.name;
              const description = row.description;
              const category = row.category;
              const brand = row.brand;
              const sku = row.sku;
              const priceVal = parseFloat(row.price);
              const stockVal = parseInt(row.stock);
              const color = row.color;
              const size = row.size;

              if (!name || !category || !sku || isNaN(priceVal) || isNaN(stockVal)) {
                errors.push(`Row ${rowNum}: Missing required fields (name, category, sku, price, stock).`);
                continue;
              }

              let existing = mockDb.find((p: any) => p.name === name);
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

              if (existing) {
                const variantExists = existing.variants.some((v: any) => v.sku === sku);
                if (variantExists) {
                  errors.push(`Row ${rowNum}: SKU '${sku}' already exists for product '${name}' in local database.`);
                  continue;
                }
                existing.variants.push(newVariant);
              } else {
                if (!description) {
                  errors.push(`Row ${rowNum}: Description is required for new products.`);
                  continue;
                }
                const newProduct = {
                  _id: `prod-${Date.now()}-${i}`,
                  name,
                  slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                  description,
                  category,
                  brand: brand || undefined,
                  tags: [],
                  variants: [newVariant],
                  stats: { averageRating: 0, reviewCount: 0, salesCount: 0, viewCount: 0 },
                  isActive: true,
                  sellerId: { name: user?.name || 'Seller' }
                };
                mockDb.unshift(newProduct);
              }
              successCount++;
            }

            localStorage.setItem('mock_products', JSON.stringify(mockDb));
            setCsvUploadResult({
              processedCount: successCount,
              totalRows: lines.length - 1,
              errors
            });
            showAlert('success', `[Offline Mode] Processed CSV. Created/Updated ${successCount} products.`);
            fetchProducts();
            setCsvFile(null);
          };
          reader.readAsText(csvFile);
        } catch (err: any) {
          showAlert('error', 'Failed to parse CSV file locally');
        } finally {
          setUploadingCsv(false);
        }
      }, 1500);
      return;
    }

    try {
      const formData = new FormData();
      formData.append('file', csvFile);

      const response = await fetch(`${API_URL}/products/bulk-upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: formData,
      });

      const resData = await response.json();
      if (!response.ok) throw new Error(resData.message || 'Failed to upload CSV');

      setCsvUploadResult(resData.data || { processedCount: resData.message });
      showAlert('success', resData.message || 'CSV Upload processed successfully');
      fetchProducts();
      setCsvFile(null);
    } catch (err: any) {
      showAlert('error', err.message || 'Failed to upload CSV file');
    } finally {
      setUploadingCsv(false);
    }
  };

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    setApplyingCoupon(true);
    setCouponError('');

    if (isOfflineMode || !accessToken) {
      setTimeout(() => {
        const codeUpper = couponCode.toUpperCase().trim();
        const local = localStorage.getItem('mock_coupons');
        const list = local ? JSON.parse(local) : [
          { code: 'SUMMER20', discountType: 'percentage', discountValue: 20, minOrderAmount: 50, usageLimit: 100, usageCount: 0, isActive: true },
          { code: 'FIXED10', discountType: 'fixed', discountValue: 10, minOrderAmount: 30, usageLimit: 50, usageCount: 0, isActive: true }
        ];

        const target = list.find((c: any) => c.code === codeUpper);
        if (!target) {
          setCouponError('Invalid promo code');
          showAlert('error', 'Invalid promo code');
          setApplyingCoupon(false);
          return;
        }
        if (!target.isActive) {
          setCouponError('Coupon code is inactive');
          showAlert('error', 'Coupon code is inactive');
          setApplyingCoupon(false);
          return;
        }
        if (cartSubtotal < target.minOrderAmount) {
          setCouponError(`Minimum subtotal of $${target.minOrderAmount} required`);
          showAlert('error', `Minimum subtotal of $${target.minOrderAmount} required`);
          setApplyingCoupon(false);
          return;
        }

        let discount = 0;
        if (target.discountType === 'percentage') {
          discount = Number((cartSubtotal * (target.discountValue / 100)).toFixed(2));
        } else {
          discount = target.discountValue;
        }
        if (discount > cartSubtotal) discount = cartSubtotal;

        setAppliedCoupon({
          couponCode: target.code,
          discountType: target.discountType,
          discountValue: target.discountValue,
          discountAmount: discount
        });
        showAlert('success', `Coupon ${target.code} applied!`);
        setApplyingCoupon(false);
      }, 800);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/coupons/apply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: couponCode, subtotal: cartSubtotal })
      });
      const resData = await response.json();
      if (response.ok) {
        setAppliedCoupon(resData.data);
        showAlert('success', `Coupon '${resData.data.couponCode}' applied!`);
      } else {
        setCouponError(resData.message || 'Failed to apply coupon');
        showAlert('error', resData.message || 'Failed to apply coupon');
      }
    } catch (err: any) {
      setCouponError(err.message || 'Network error applying coupon');
      showAlert('error', err.message || 'Network error applying coupon');
    } finally {
      setApplyingCoupon(false);
    }
  };

  return (
    <>
      {/* ── Navigation Bar ── */}
      <header>
        <div className="logo">MERN E-Store</div>
        <div className="nav-links">
          <button 
            className={`nav-btn ${activeTab === 'storefront' ? 'active' : ''}`}
            onClick={() => setActiveTab('storefront')}
          >
            Storefront
          </button>
          
          {(user?.role === 'seller' || user?.role === 'admin') && (
            <button 
              className={`nav-btn ${activeTab === 'seller' ? 'active' : ''}`}
              onClick={() => setActiveTab('seller')}
            >
              Seller Dashboard
            </button>
          )}

          {user && ['warehouse', 'seller', 'admin'].includes(user.role) && (
            <button 
              className={`nav-btn ${activeTab === 'warehouse' ? 'active' : ''}`}
              onClick={() => { setActiveTab('warehouse'); fetchWarehouseData(); }}
            >
              Warehouse Queue
            </button>
          )}

          {user && (
            <button 
              className={`nav-btn ${activeTab === 'orders' ? 'active' : ''}`}
              onClick={() => { setActiveTab('orders'); fetchOrders(); }}
            >
              My Orders
            </button>
          )}

          <button className="nav-btn" onClick={() => setShowCartDrawer(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            🛒 Cart <span style={{ background: 'var(--accent-color)', color: '#0f172a', padding: '0.1rem 0.4rem', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 'bold' }}>{cartTotalItems}</span>
          </button>

          {user ? (
            <>
              <span className="user-badge">{user.name} ({user.role})</span>
              <button className="nav-btn" onClick={handleLogout}>Log Out</button>
            </>
          ) : (
            <button className="nav-btn" onClick={() => { setIsRegistering(false); setShowAuthModal(true); }}>
              Sign In
            </button>
          )}
        </div>
      </header>

      {/* ── Main Layout ── */}
      <main>
        {/* Status Messages */}
        {notification && (
          <div className={`notification ${notification.type}`}>
            {notification.type === 'success' ? '✅' : '❌'} {notification.message}
          </div>
        )}

        {isOfflineMode && (
          <div className="notification success" style={{ background: 'rgba(56, 189, 248, 0.15)', border: '1px solid rgba(56, 189, 248, 0.3)', color: '#bae6fd' }}>
            ℹ️ <strong>Offline Preview Mode:</strong> The local MERN backend server is offline. The storefront has automatically loaded local mock data so you can fully test registrations, catalog grids, and uploads in your browser!
          </div>
        )}

        {/* ── Tab View: Customer Storefront ── */}
        {activeTab === 'storefront' && (
          <section>
            <div className="hero">
              <h1>Explore Our Collection</h1>
              <p>Discover high-quality electronics, apparel, home essentials, and more.</p>
            </div>

            {/* Filter controls panel */}
            <div className="controls-panel">
              <input 
                type="text" 
                placeholder="Search products by title or description..." 
                className="search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              
              <select 
                className="filter-select"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="">All Categories</option>
                <option value="electronics">Electronics</option>
                <option value="clothing">Clothing</option>
                <option value="books">Books</option>
                <option value="home">Home & Kitchen</option>
                <option value="sports">Sports</option>
              </select>

              <div className="price-inputs">
                <input 
                  type="number" 
                  placeholder="Min Price" 
                  className="price-input"
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                />
                <span>-</span>
                <input 
                  type="number" 
                  placeholder="Max Price" 
                  className="price-input"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                />
              </div>
            </div>

            {/* Products grid */}
            {products.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                <h3>No products found matching the criteria.</h3>
              </div>
            ) : (
              <div className="product-grid">
                {products.map((p) => {
                  const selectedSku = selectedVariants[p._id] || p.variants[0]?.sku;
                  const variant = p.variants.find((v: any) => v.sku === selectedSku) || p.variants[0];
                  return (
                    <div className="product-card" key={p._id}>
                      <div className="product-img-container">
                        <span className="category-tag">{p.category}</span>
                        {variant?.images?.[0] ? (
                          <img src={variant.images[0].startsWith('http') || variant.images[0].startsWith('data') ? variant.images[0] : `http://localhost:5000${variant.images[0]}`} className="product-img" alt={p.name} />
                        ) : (
                          <div className="no-img-placeholder">
                            <span>📷</span>
                            <span>No Photo Available</span>
                          </div>
                        )}
                      </div>
                      <div className="product-info" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100% - 180px)' }}>
                        <div className="product-brand">{p.brand || 'Generic'}</div>
                        <h3 className="product-title">{p.name}</h3>
                        <p className="product-desc" style={{ flex: 1 }}>{p.description}</p>
                        
                        {p.variants.length > 1 && (
                          <div className="variant-select-container" style={{ marginBottom: '0.75rem' }}>
                            <select 
                              className="variant-select"
                              value={selectedSku}
                              onChange={(e) => setSelectedVariants({ ...selectedVariants, [p._id]: e.target.value })}
                            >
                              {p.variants.map((v: any) => (
                                <option key={v.sku} value={v.sku}>
                                  {v.color || v.size ? `${v.color || ''} ${v.size || ''} - $${v.price}` : v.sku}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        <div className="product-footer" style={{ marginTop: 'auto' }}>
                          <div className="product-price">${variant?.price?.toFixed(2)}</div>
                          <span className={`stock-tag ${variant?.stock > 0 ? 'in-stock' : 'out-stock'}`}>
                            {variant?.stock > 0 ? `${variant.stock} In Stock` : 'Out of Stock'}
                          </span>
                        </div>

                        <button
                          className="btn btn-primary"
                          style={{ width: '100%', marginTop: '0.75rem', padding: '0.5rem', background: 'var(--primary-gradient)', border: 'none', borderRadius: '8px', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}
                          disabled={!variant || variant.stock <= 0}
                          onClick={() => handleAddToCart(p, variant.sku)}
                        >
                          {variant && variant.stock > 0 ? '🛒 Add to Cart' : 'Out of Stock'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ── Tab View: Seller Portal ── */}
        {activeTab === 'seller' && (
          <section className="seller-grid">
            {/* Analytics Header Section */}
            <div style={{ gridColumn: 'span 2', marginBottom: '2rem' }}>
              <h2 style={{ background: 'var(--primary-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', width: 'fit-content', marginBottom: '1.5rem' }}>
                Seller Dashboard & Analytics
              </h2>

              {loadingAnalytics && !analytics ? (
                <div className="spinner-container" style={{ minHeight: '150px' }}><div className="spinner"></div></div>
              ) : analytics ? (
                <div>
                  {/* KPI Cards Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                    <div className="form-panel" style={{ padding: '1.25rem', textAlign: 'center', background: 'var(--panel-bg)', borderRadius: '12px', border: '1px solid var(--panel-border)' }}>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>TOTAL REVENUE</div>
                      <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--accent-color)', marginTop: '0.25rem' }}>
                        ${analytics.kpis.totalRevenue.toFixed(2)}
                      </div>
                    </div>
                    <div className="form-panel" style={{ padding: '1.25rem', textAlign: 'center', background: 'var(--panel-bg)', borderRadius: '12px', border: '1px solid var(--panel-border)' }}>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>ITEMS SOLD</div>
                      <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#10b981', marginTop: '0.25rem' }}>
                        {analytics.kpis.totalSalesCount} units
                      </div>
                    </div>
                    <div className="form-panel" style={{ padding: '1.25rem', textAlign: 'center', background: 'var(--panel-bg)', borderRadius: '12px', border: '1px solid var(--panel-border)' }}>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>ACTIVE LISTINGS</div>
                      <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#38bdf8', marginTop: '0.25rem' }}>
                        {analytics.kpis.activeListings} / {analytics.kpis.totalListings}
                      </div>
                    </div>
                    <div className="form-panel" style={{ padding: '1.25rem', textAlign: 'center', background: 'var(--panel-bg)', borderRadius: '12px', border: '1px solid var(--panel-border)', borderColor: analytics.stockAlerts.length > 0 ? 'rgba(239, 68, 68, 0.4)' : 'var(--panel-border)' }}>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>STOCK ALERTS</div>
                      <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: analytics.stockAlerts.length > 0 ? '#ef4444' : '#10b981', marginTop: '0.25rem' }}>
                        {analytics.stockAlerts.length} low
                      </div>
                    </div>
                  </div>

                  {/* Charts Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem', marginBottom: '2rem' }}>
                    <div className="form-panel" style={{ padding: '1.5rem', background: 'var(--panel-bg)', borderRadius: '15px', border: '1px solid var(--panel-border)' }}>
                      <h4 style={{ margin: '0 0 1rem 0', color: 'var(--text-muted)' }}>Sales Revenue (Last 7 Days)</h4>
                      <div style={{ width: '100%', height: 250 }}>
                        <ResponsiveContainer>
                          <AreaChart data={analytics.salesTrajectory}>
                            <defs>
                              <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="var(--accent-color)" stopOpacity={0.4}/>
                                <stop offset="95%" stopColor="var(--accent-color)" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" />
                            <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={11} />
                            <YAxis stroke="var(--text-muted)" fontSize={11} />
                            <ChartTooltip contentStyle={{ background: '#1e293b', border: '1px solid var(--panel-border)', borderRadius: '8px' }} />
                            <Area type="monotone" dataKey="revenue" stroke="var(--accent-color)" fillOpacity={1} fill="url(#colorRev)" strokeWidth={2} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="form-panel" style={{ padding: '1.5rem', background: 'var(--panel-bg)', borderRadius: '15px', border: '1px solid var(--panel-border)' }}>
                      <h4 style={{ margin: '0 0 1rem 0', color: 'var(--text-muted)' }}>Sales by Category</h4>
                      <div style={{ width: '100%', height: 250, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {analytics.categoryBreakdown.length === 0 ? (
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No data available</div>
                        ) : (
                          <ResponsiveContainer>
                            <PieChart>
                              <Pie
                                data={analytics.categoryBreakdown}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                                outerRadius={80}
                                fill="#8884d8"
                                dataKey="value"
                              >
                                {analytics.categoryBreakdown.map((_: any, index: number) => (
                                  <Cell key={`cell-${index}`} fill={['#a855f7', '#3b82f6', '#10b981', '#f59e0b', '#ec4899'][index % 5]} />
                                ))}
                              </Pie>
                              <ChartTooltip contentStyle={{ background: '#1e293b', border: '1px solid var(--panel-border)', borderRadius: '8px' }} />
                            </PieChart>
                          </ResponsiveContainer>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Stock Alerts Details Table (if any) */}
                  {analytics.stockAlerts.length > 0 && (
                    <div className="form-panel" style={{ padding: '1.5rem', background: 'rgba(239, 68, 68, 0.05)', borderRadius: '15px', border: '1px solid rgba(239, 68, 68, 0.2)', marginBottom: '2rem' }}>
                      <h4 style={{ margin: '0 0 1rem 0', color: '#ef4444' }}>⚠️ Inventory Alerts (Stock &lt; 5)</h4>
                      <div style={{ overflowX: 'auto' }}>
                        <table className="product-table" style={{ width: '100%', fontSize: '0.85rem' }}>
                          <thead>
                            <tr>
                              <th>Product</th>
                              <th>SKU</th>
                              <th>Variant</th>
                              <th>Stock</th>
                            </tr>
                          </thead>
                          <tbody>
                            {analytics.stockAlerts.map((alert: any, idx: number) => (
                              <tr key={idx}>
                                <td style={{ fontWeight: 600 }}>{alert.productName}</td>
                                <td>{alert.sku}</td>
                                <td>{[alert.size, alert.color].filter(Boolean).join(' / ') || 'Default'}</td>
                                <td style={{ color: '#ef4444', fontWeight: 'bold' }}>{alert.stock} units</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            {/* Left Column: Form */}
            <div className="form-panel">
              <h2 style={{ marginTop: 0, marginBottom: '1.5rem' }}>List New Product</h2>
              <form onSubmit={handleProductSubmit}>
                <div className="form-group">
                  <label>Product Name</label>
                  <input 
                    type="text" 
                    required 
                    className="form-control"
                    value={productForm.name}
                    onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>Description</label>
                  <textarea 
                    rows={4}
                    required 
                    className="form-control"
                    value={productForm.description}
                    onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>Category</label>
                  <select 
                    className="form-control"
                    value={productForm.category}
                    onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}
                  >
                    <option value="electronics">Electronics</option>
                    <option value="clothing">Clothing</option>
                    <option value="books">Books</option>
                    <option value="home">Home & Kitchen</option>
                    <option value="sports">Sports</option>
                  </select>
                </div>

                <div className="form-group">
                       <label>Price ($) *</label>
                    <input 
                      type="number" 
                      step="0.01"
                      required 
                      className="form-control"
                      value={productForm.price}
                      onChange={(e) => setProductForm({ ...productForm, price: e.target.value })}
                    />
                  </div>
                  {!useVariants ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                      <div>
                        <label>NYC Stock *</label>
                        <input 
                          type="number" 
                          required 
                          className="form-control"
                          placeholder="NYC"
                          value={productForm.nycStock}
                          onChange={(e) => setProductForm({ ...productForm, nycStock: e.target.value })}
                        />
                      </div>
                      <div>
                        <label>LA Stock *</label>
                        <input 
                          type="number" 
                          required 
                          className="form-control"
                          placeholder="LA"
                          value={productForm.laStock}
                          onChange={(e) => setProductForm({ ...productForm, laStock: e.target.value })}
                        />
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label>Base Stock (Default Split)</label>
                      <input 
                        type="number" 
                        required 
                        className="form-control"
                        placeholder="Base Stock"
                        value={productForm.stock}
                        onChange={(e) => setProductForm({ ...productForm, stock: e.target.value })}
                      />
                    </div>
                  )}

                <div className="form-group">
                  <label>SKU Code</label>
                  <input 
                    type="text" 
                    placeholder="Auto-generated if empty"
                    className="form-control"
                    value={productForm.sku}
                    onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })}
                  />
                </div>

                {/* Variant Engine toggle */}
                <div className="form-group" style={{ borderTop: '1px solid var(--panel-border)', paddingTop: '1.25rem', marginTop: '1.25rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 'bold' }}>
                    <input 
                      type="checkbox" 
                      checked={useVariants}
                      onChange={(e) => setUseVariants(e.target.checked)}
                      style={{ width: 'auto' }}
                    />
                    Configure Product Variations (Sizes, Colors, etc.)
                  </label>
                </div>

                {useVariants && (
                  <div style={{ background: 'rgba(15, 23, 42, 0.3)', padding: '1rem', borderRadius: '10px', border: '1px solid var(--panel-border)', marginBottom: '1.5rem' }}>
                    <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.95rem', color: 'var(--accent-color)' }}>Attribute Configurator</h4>
                    
                    {attributes.map((attr, idx) => (
                      <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1.2fr 2fr auto', gap: '0.75rem', alignItems: 'center', marginBottom: '0.75rem' }}>
                        <input 
                          type="text" 
                          placeholder="Attribute Name (e.g. Size)" 
                          className="form-control"
                          value={attr.name}
                          onChange={(e) => {
                            const updated = [...attributes];
                            updated[idx].name = e.target.value;
                            setAttributes(updated);
                          }}
                          style={{ padding: '0.35rem', fontSize: '0.85rem' }}
                        />
                        <input 
                          type="text" 
                          placeholder="Options, comma-separated (e.g. S, M, L)" 
                          className="form-control"
                          value={attr.options}
                          onChange={(e) => {
                            const updated = [...attributes];
                            updated[idx].options = e.target.value;
                            setAttributes(updated);
                          }}
                          style={{ padding: '0.35rem', fontSize: '0.85rem' }}
                        />
                        <button 
                          type="button" 
                          className="action-btn delete" 
                          onClick={() => {
                            setAttributes(attributes.filter((_, i) => i !== idx));
                          }}
                          style={{ padding: '0.35rem 0.5rem' }}
                        >
                          &times;
                        </button>
                      </div>
                    ))}

                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                      <button 
                        type="button" 
                        className="btn-secondary" 
                        onClick={() => setAttributes([...attributes, { name: '', options: '' }])}
                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                      >
                        ➕ Add Attribute
                      </button>
                      <button 
                        type="button" 
                        className="btn-primary" 
                        onClick={generateVariantMatrix}
                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', background: 'var(--primary-gradient)' }}
                      >
                        ⚡ Generate Combination Matrix
                      </button>
                    </div>

                    {variantsList.length > 0 && (
                      <div style={{ marginTop: '1.5rem' }}>
                        <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-muted)', display: 'block', marginBottom: '0.5rem' }}>Generated Variations Grid</label>
                        <div style={{ overflowX: 'auto', maxHeight: '300px' }}>
                          <table className="product-table" style={{ fontSize: '0.8rem', width: '100%' }}>
                            <thead>
                              <tr>
                                <th>Attributes</th>
                                 <th>SKU *</th>
                                 <th>Price ($) *</th>
                                 <th>NYC / LA Stock *</th>
                              </tr>
                            </thead>
                            <tbody>
                              {variantsList.map((v, idx) => {
                                const attributesLabel = Object.entries(v)
                                  .filter(([key]) => key !== 'sku' && key !== 'price' && key !== 'stock')
                                  .map(([key, val]) => `${key}: ${val}`)
                                  .join(', ');
                                
                                return (
                                  <tr key={idx}>
                                    <td style={{ fontWeight: 600 }}>{attributesLabel || 'Default'}</td>
                                    <td>
                                      <input 
                                        type="text" 
                                        required 
                                        className="form-control"
                                        value={v.sku}
                                        onChange={(e) => updateVariantField(idx, 'sku', e.target.value)}
                                        style={{ padding: '0.2rem 0.4rem', fontSize: '0.75rem' }}
                                      />
                                    </td>
                                    <td>
                                      <input 
                                        type="number" 
                                        step="0.01" 
                                        required 
                                        className="form-control"
                                        value={v.price}
                                        onChange={(e) => updateVariantField(idx, 'price', e.target.value)}
                                        style={{ padding: '0.2rem 0.4rem', fontSize: '0.75rem', width: '60px' }}
                                      />
                                    </td>
                                    <td style={{ display: 'flex', gap: '0.25rem', border: 'none', padding: '0.2rem' }}>
                                      <input 
                                        type="number" 
                                        required 
                                        placeholder="NYC"
                                        className="form-control"
                                        value={v.warehouseStocks?.find((ws: any) => ws.warehouse === 'NYC')?.stock ?? 5}
                                        onChange={(e) => updateVariantWarehouseStock(idx, 'NYC', parseInt(e.target.value) || 0)}
                                        style={{ padding: '0.2rem 0.4rem', fontSize: '0.75rem', width: '50px' }}
                                        title="NYC Stock"
                                      />
                                      <input 
                                        type="number" 
                                        required 
                                        placeholder="LA"
                                        className="form-control"
                                        value={v.warehouseStocks?.find((ws: any) => ws.warehouse === 'LA')?.stock ?? 5}
                                        onChange={(e) => updateVariantWarehouseStock(idx, 'LA', parseInt(e.target.value) || 0)}
                                        style={{ padding: '0.2rem 0.4rem', fontSize: '0.75rem', width: '50px' }}
                                        title="LA Stock"
                                      />
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="form-group">
                  <label>Product Image</label>
                  <input 
                    type="file" 
                    accept="image/*"
                    style={{ display: 'none' }}
                    id="product-file-input"
                    onChange={(e) => {
                      if (e.target.files?.[0]) setSelectedFile(e.target.files[0]);
                    }}
                  />
                  <div 
                    className="file-dropzone"
                    onClick={() => document.getElementById('product-file-input')?.click()}
                  >
                    {selectedFile ? (
                      <div style={{ color: 'var(--success-color)' }}>
                        📄 {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                      </div>
                    ) : (
                      <div style={{ color: 'var(--text-muted)' }}>
                        📁 Click to choose or drop image file here
                      </div>
                    )}
                  </div>
                </div>

                <button 
                  type="submit" 
                  className="btn-primary" 
                  style={{ width: '100%', marginTop: '1rem' }}
                  disabled={uploadingFile}
                >
                  {uploadingFile ? 'Uploading...' : 'Publish Listing'}
                </button>
              </form>
            </div>

            {/* Bulk CSV Importer Panel */}
            <div className="form-panel" style={{ marginTop: '2rem' }}>
              <h3 style={{ margin: '0 0 1rem 0', color: 'var(--accent-color)', fontSize: '1.2rem', fontWeight: 'bold' }}>Bulk Upload via CSV</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.4', marginBottom: '1.25rem' }}>
                Batch upload products and variations. Provide a CSV file containing the headers below:<br />
                <code style={{ background: 'rgba(0,0,0,0.3)', padding: '0.2rem 0.4rem', borderRadius: '4px', display: 'block', margin: '0.5rem 0', wordBreak: 'break-all', fontSize: '0.75rem', color: 'var(--accent-color)' }}>
                  name,description,category,brand,sku,price,stock,color,size
                </code>
                * Provide the same product <strong>name</strong> on multiple rows to group them as variations.
              </p>
              
              <form onSubmit={handleCsvUploadSubmit}>
                <div className="form-group">
                  <input 
                    type="file" 
                    accept=".csv"
                    style={{ display: 'none' }}
                    id="csv-file-input"
                    onChange={(e) => {
                      if (e.target.files?.[0]) setCsvFile(e.target.files[0]);
                    }}
                  />
                  <div 
                    className="file-dropzone"
                    onClick={() => document.getElementById('csv-file-input')?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (e.dataTransfer.files?.[0]) setCsvFile(e.dataTransfer.files[0]);
                    }}
                    style={{ borderStyle: 'dashed', background: 'rgba(15, 23, 42, 0.2)' }}
                  >
                    {csvFile ? (
                      <div style={{ color: 'var(--success-color)' }}>
                        📄 {csvFile.name} ({(csvFile.size / 1024).toFixed(1)} KB)
                      </div>
                    ) : (
                      <div style={{ color: 'var(--text-muted)' }}>
                        📁 Click to choose or drop CSV file here
                      </div>
                    )}
                  </div>
                </div>

                <button 
                  type="submit" 
                  className="btn-primary" 
                  style={{ width: '100%', marginTop: '1rem', background: 'var(--primary-gradient)' }}
                  disabled={uploadingCsv}
                >
                  {uploadingCsv ? 'Processing CSV...' : '🚀 Start Bulk Upload'}
                </button>
              </form>

              {csvUploadResult && (
                <div style={{ marginTop: '1.5rem', background: 'rgba(15, 23, 42, 0.4)', border: '1px solid var(--panel-border)', padding: '1rem', borderRadius: '10px' }}>
                  <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: 'var(--success-color)' }}>Upload Report</h4>
                  <div style={{ fontSize: '0.8rem', lineHeight: '1.4' }}>
                    ✅ Processed Rows: <strong>{csvUploadResult.processedCount}</strong> / {csvUploadResult.totalRows || 0}<br />
                    ❌ Parsing Failures: <strong>{csvUploadResult.errors?.length || 0}</strong>
                  </div>
                  
                  {csvUploadResult.errors && csvUploadResult.errors.length > 0 && (
                    <div style={{ marginTop: '0.75rem', maxHeight: '150px', overflowY: 'auto', borderTop: '1px solid var(--panel-border)', paddingTop: '0.5rem' }}>
                      <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--error-color)' }}>Row Errors:</label>
                      <ul style={{ margin: '0.25rem 0 0 0', paddingLeft: '1.2rem', color: '#fca5a5', fontSize: '0.75rem', lineHeight: '1.4' }}>
                        {csvUploadResult.errors.map((err: string, eIdx: number) => (
                          <li key={eIdx}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right Column: Manage listings */}
            <div className="list-panel">
              <h2 style={{ marginTop: 0, marginBottom: '1.5rem' }}>Active Inventory</h2>
              
              {sellerProducts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                  <h4>No active listings found for your account.</h4>
                  <p>Use the form to publish your first item.</p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="product-table">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Category</th>
                        <th>Price</th>
                        <th>Stock</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sellerProducts.map((p) => {
                        const variant = p.variants[0];
                        return (
                          <tr key={p._id}>
                            <td style={{ fontWeight: 600 }}>{p.name}</td>
                            <td>{p.category}</td>
                            <td>${variant?.price?.toFixed(2)}</td>
                            <td>{variant?.stock} units</td>
                            <td>
                              <button 
                                className="action-btn delete"
                                onClick={() => handleDeleteProduct(p._id)}
                              >
                                🗑️ Delete
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Coupon Manager Panel */}
            <div className="form-panel" style={{ gridColumn: 'span 2', marginTop: '2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h2 style={{ margin: 0 }}>Coupon Promotions</h2>
                <button 
                  className="btn-primary" 
                  onClick={() => setShowCouponForm(!showCouponForm)}
                  style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                >
                  {showCouponForm ? 'Cancel' : '➕ Create Promo Coupon'}
                </button>
              </div>

              {showCouponForm && (
                <form onSubmit={handleCouponSubmit} style={{ background: 'rgba(15, 23, 42, 0.3)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--panel-border)', marginBottom: '2rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                    <div className="form-group">
                      <label>Promo Code (e.g. SUMMER20)</label>
                      <input 
                        type="text" 
                        required 
                        placeholder="SUMMER20"
                        className="form-control"
                        value={couponForm.code}
                        onChange={(e) => setCouponForm({ ...couponForm, code: e.target.value })}
                        style={{ textTransform: 'uppercase' }}
                      />
                    </div>
                    <div className="form-group">
                      <label>Discount Type</label>
                      <select 
                        className="form-control"
                        value={couponForm.discountType}
                        onChange={(e) => setCouponForm({ ...couponForm, discountType: e.target.value })}
                      >
                        <option value="percentage">Percentage (%)</option>
                        <option value="fixed">Fixed Amount ($)</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Discount Value</label>
                      <input 
                        type="number" 
                        required 
                        placeholder="20"
                        className="form-control"
                        value={couponForm.discountValue}
                        onChange={(e) => setCouponForm({ ...couponForm, discountValue: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>Min Order Amount ($)</label>
                      <input 
                        type="number" 
                        placeholder="0"
                        className="form-control"
                        value={couponForm.minOrderAmount}
                        onChange={(e) => setCouponForm({ ...couponForm, minOrderAmount: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>Usage Limit (Max Uses)</label>
                      <input 
                        type="number" 
                        placeholder="No limit"
                        className="form-control"
                        value={couponForm.usageLimit}
                        onChange={(e) => setCouponForm({ ...couponForm, usageLimit: e.target.value })}
                      />
                    </div>
                  </div>
                  <button type="submit" className="btn-primary" style={{ marginTop: '1.5rem', padding: '0.6rem 1.5rem' }}>
                    Publish Promo Code
                  </button>
                </form>
              )}

              {coupons.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  No active coupon campaigns published yet.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="product-table" style={{ fontSize: '0.85rem' }}>
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Discount</th>
                        <th>Min Order</th>
                        <th>Usage</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {coupons.map((coupon: any) => (
                        <tr key={coupon._id}>
                          <td style={{ fontWeight: 'bold', color: 'var(--accent-color)' }}>{coupon.code}</td>
                          <td>
                            {coupon.discountType === 'percentage' 
                              ? `${coupon.discountValue}% Off` 
                              : `$${coupon.discountValue.toFixed(2)} Off`}
                          </td>
                          <td>${coupon.minOrderAmount.toFixed(2)}</td>
                          <td>
                            {coupon.usageCount} / {coupon.usageLimit || '∞'} uses
                          </td>
                          <td>
                            <span className={`stock-tag ${coupon.isActive ? 'in-stock' : 'out-stock'}`}>
                              {coupon.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── Tab View: Orders History & Management ── */}
        {activeTab === 'orders' && (
          <section className="orders-panel" style={{ width: '100%' }}>
            <h2 style={{ marginBottom: '1.5rem', background: 'var(--primary-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', width: 'fit-content' }}>
              {user?.role === 'admin' ? 'All Platform Orders' : 'Your Order History'}
            </h2>

            {orders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', background: 'var(--panel-bg)', border: '1px solid var(--panel-border)', borderRadius: '15px', color: 'var(--text-muted)' }}>
                <h3>No orders found</h3>
                <p>Buy some products to create your first order history!</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                {orders.map((order) => (
                  <div key={order._id} className="form-panel" style={{ padding: '1.5rem 2rem', background: 'var(--panel-bg)', borderRadius: '15px', border: '1px solid var(--panel-border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--panel-border)', paddingBottom: '1rem', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
                      <div>
                        <strong style={{ fontSize: '1.1rem', color: 'var(--accent-color)' }}>{order.orderNumber}</strong>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginLeft: '1rem' }}>
                          Placed on: {new Date(order.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <span className={`stock-tag ${order.paymentStatus === 'paid' ? 'in-stock' : 'out-stock'}`} style={{ textTransform: 'capitalize' }}>
                          Payment: {order.paymentStatus}
                        </span>
                        <span className="user-badge" style={{ background: 'rgba(56, 189, 248, 0.15)', borderColor: 'rgba(56, 189, 248, 0.3)', color: '#bae6fd', textTransform: 'capitalize' }}>
                          Delivery: {order.status}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem', flexWrap: 'wrap' }} className="order-details-grid">
                      {/* Left: Items & Address */}
                      <div>
                        <h4 style={{ margin: '0 0 1rem 0' }}>Order Items</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
                          {order.items.map((item: any, idx: number) => (
                            <div key={idx} style={{ display: 'flex', gap: '1rem', alignItems: 'center', background: 'rgba(15, 23, 42, 0.3)', padding: '0.75rem', borderRadius: '10px', border: '1px solid var(--panel-border)' }}>
                              {item.snapshot.image ? (
                                <img
                                  src={item.snapshot.image.startsWith('http') || item.snapshot.image.startsWith('data') ? item.snapshot.image : `http://localhost:5000${item.snapshot.image}`}
                                  alt={item.snapshot.name}
                                  style={{ width: '50px', height: '50px', objectFit: 'cover', borderRadius: '6px' }}
                                />
                              ) : (
                                <div style={{ width: '50px', height: '50px', borderRadius: '6px', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>📷</div>
                              )}
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{item.snapshot.name}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>SKU: {item.variantSku}</div>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '0.85rem' }}>{item.quantity} x ${item.unitPrice.toFixed(2)}</div>
                                <div style={{ fontWeight: 'bold', fontSize: '0.9rem', color: 'var(--accent-color)' }}>${item.totalPrice.toFixed(2)}</div>
                              </div>
                            </div>
                          ))}
                        </div>

                        <h4 style={{ margin: '1.5rem 0 0.5rem 0' }}>Shipping Address</h4>
                        <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                          {order.shippingAddress.street}, {order.shippingAddress.city}
                          {order.shippingAddress.state ? `, ${order.shippingAddress.state}` : ''}, {order.shippingAddress.zip}, {order.shippingAddress.country}
                          <br />
                          <strong>Phone:</strong> {order.shippingAddress.phone}
                        </div>
                      </div>

                      {/* Right: Invoice Summary & Status timeline */}
                      <div style={{ borderLeft: '1px solid var(--panel-border)', paddingLeft: '1.5rem' }} className="order-summary-sidebar">
                        <h4 style={{ margin: '0 0 1rem 0' }}>Order Summary</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Subtotal</span>
                            <span>${order.subtotal.toFixed(2)}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Shipping</span>
                            <span>{order.shipping === 0 ? 'FREE' : `$${order.shipping.toFixed(2)}`}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Tax (8%)</span>
                            <span>${order.tax.toFixed(2)}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed var(--panel-border)', paddingTop: '0.5rem', fontWeight: 'bold', fontSize: '1rem', color: 'var(--accent-color)' }}>
                            <span>Total</span>
                            <span>${order.total.toFixed(2)}</span>
                          </div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                            <strong>Payment Method:</strong> {order.paymentMethod === 'stripe' ? 'Stripe Gateway' : 'Simulated Checkout'}
                          </div>
                          {order.trackingNumber && (
                            <div style={{ fontSize: '0.85rem', color: '#bae6fd', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.2)', padding: '0.5rem', borderRadius: '6px', marginTop: '0.5rem' }}>
                              🚚 <strong>Tracking Number:</strong> {order.trackingNumber}
                            </div>
                          )}
                        </div>

                        <h4 style={{ margin: '1rem 0 0.5rem 0' }}>Tracking Timeline</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.8rem', maxHeight: '180px', overflowY: 'auto' }}>
                          {order.statusHistory.map((h: any, hIdx: number) => (
                            <div key={hIdx} style={{ display: 'flex', gap: '0.5rem' }}>
                              <span style={{ color: 'var(--accent-color)' }}>•</span>
                              <div>
                                <span style={{ fontWeight: 'bold', textTransform: 'capitalize' }}>{h.status}:</span>{' '}
                                <span style={{ color: 'var(--text-muted)' }}>{h.note}</span>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                                  {new Date(h.timestamp).toLocaleString()}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Admin / Seller controls */}
                        {(user?.role === 'seller' || user?.role === 'admin') && (
                          <div style={{ marginTop: '2rem', borderTop: '1px solid var(--panel-border)', paddingTop: '1.5rem' }}>
                            <h4 style={{ margin: '0 0 1rem 0', color: '#a855f7' }}>Manager Operations</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                              <div>
                                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Update Status</label>
                                <select 
                                  className="form-control"
                                  style={{ padding: '0.4rem', fontSize: '0.85rem' }}
                                  defaultValue=""
                                  onChange={(e) => {
                                    const nextStatus = e.target.value;
                                    if (nextStatus) {
                                      if (nextStatus === 'shipped') {
                                        const trackNum = window.prompt('Enter tracking number for shipment:');
                                        if (trackNum) {
                                          handleOrderStatusUpdate(order._id, 'shipped', trackNum);
                                        } else {
                                          e.target.value = '';
                                          showAlert('error', 'Tracking number is required to ship order');
                                        }
                                      } else {
                                        if (window.confirm(`Are you sure you want to transition order status to ${nextStatus}?`)) {
                                          handleOrderStatusUpdate(order._id, nextStatus);
                                        } else {
                                          e.target.value = '';
                                        }
                                      }
                                    }
                                  }}
                                >
                                  <option value="">-- Choose Status --</option>
                                  {order.status === 'pending' && <option value="cancelled">Cancel Order (Fail)</option>}
                                  {order.status === 'paid' && <option value="processing">Start Processing</option>}
                                  {order.status === 'processing' && <option value="shipped">Mark Shipped (Enter Tracking)</option>}
                                  {order.status === 'shipped' && <option value="delivered">Mark Delivered</option>}
                                  {['paid', 'processing', 'shipped', 'delivered'].includes(order.status) && <option value="refunded">Refund Order (Cancel/Return)</option>}
                                </select>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {activeTab === 'warehouse' && (
          <section className="warehouse-portal" style={{ animation: 'fadeIn 0.5s ease' }}>
            <div className="hero" style={{ marginBottom: '2rem' }}>
              <h1 style={{ background: 'var(--primary-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontSize: '2.5rem', fontWeight: 800 }}>Warehouse Operations</h1>
              <p>Manage order allocations, picking tasks, and ship pack checklists</p>
            </div>

            {/* Consolidated Pick List Section */}
            <div className="controls-panel" style={{ flexDirection: 'column', alignItems: 'stretch', marginBottom: '2.5rem', gap: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--panel-border)', paddingBottom: '0.75rem' }}>
                <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--accent-color)', fontWeight: 'bold' }}>📦 Consolidated Pick List</h2>
                <button 
                  className="btn-primary" 
                  onClick={fetchWarehouseData}
                  style={{ padding: '0.4rem 1rem', fontSize: '0.85rem' }}
                >
                  🔄 Refresh Queue
                </button>
              </div>

              {pickList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  No items require picking. All processing orders are packed!
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="product-table" style={{ width: '100%', fontSize: '0.9rem' }}>
                    <thead>
                      <tr>
                        <th style={{ width: '50px', textAlign: 'center' }}>Picked</th>
                        <th>Warehouse</th>
                        <th>SKU</th>
                        <th>Product Name</th>
                        <th style={{ textAlign: 'right' }}>Quantity to Pick</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pickList.map((item, idx) => {
                        const pickKey = `${item.warehouse}_${item.sku}`;
                        const isChecked = !!checkedPicks[pickKey];
                        return (
                          <tr key={idx} style={{ opacity: isChecked ? 0.6 : 1, transition: 'opacity 0.2s', textDecoration: isChecked ? 'line-through' : 'none' }}>
                            <td style={{ textAlign: 'center' }}>
                              <input 
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  setCheckedPicks({
                                    ...checkedPicks,
                                    [pickKey]: e.target.checked
                                  });
                                }}
                                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                              />
                            </td>
                            <td>
                              <span style={{ 
                                padding: '0.2rem 0.5rem', 
                                borderRadius: '4px', 
                                fontSize: '0.75rem', 
                                fontWeight: 'bold', 
                                background: item.warehouse === 'NYC' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(168, 85, 247, 0.15)',
                                color: item.warehouse === 'NYC' ? '#38bdf8' : '#c084fc',
                                border: `1px solid ${item.warehouse === 'NYC' ? 'rgba(56, 189, 248, 0.3)' : 'rgba(168, 85, 247, 0.3)'}`
                              }}>
                                {item.warehouse}
                              </span>
                            </td>
                            <td style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{item.sku}</td>
                            <td>{item.name}</td>
                            <td style={{ textAlign: 'right', fontWeight: 'bold', fontSize: '1.05rem', color: 'var(--accent-color)' }}>{item.quantity}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Packing Queue Section */}
            <div style={{ display: 'grid', gap: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--accent-color)', fontWeight: 'bold' }}>📋 Order Packing Queue</h2>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{warehouseOrders.length} orders pending packaging</span>
              </div>

              {warehouseOrders.length === 0 ? (
                <div className="controls-panel" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                  🎉 All orders have been packed and shipped!
                </div>
              ) : (
                warehouseOrders.map((order) => (
                  <div key={order._id} className="controls-panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '1rem', padding: '1.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid var(--panel-border)', paddingBottom: '1rem' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 'bold' }}>{order.orderNumber}</h3>
                          <span style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.3)', padding: '0.15rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase' }}>
                            {order.status}
                          </span>
                        </div>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Ordered {new Date(order.createdAt).toLocaleString()}</span>
                      </div>
                      
                      {shippingOrderId === order._id ? (
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <input 
                            type="text" 
                            placeholder="Enter Tracking Number" 
                            className="form-control"
                            value={trackingInput}
                            onChange={(e) => setTrackingInput(e.target.value)}
                            style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem', width: '200px' }}
                          />
                          <button 
                            className="btn-primary"
                            onClick={() => {
                              handlePackAndShipOrder(order._id, trackingInput);
                              setShippingOrderId(null);
                              setTrackingInput('');
                            }}
                            style={{ padding: '0.4rem 0.85rem', fontSize: '0.85rem' }}
                          >
                            Confirm Ship
                          </button>
                          <button 
                            className="btn"
                            onClick={() => {
                              setShippingOrderId(null);
                              setTrackingInput('');
                            }}
                            style={{ padding: '0.4rem 0.65rem', fontSize: '0.85rem', background: 'rgba(255,255,255,0.05)' }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button 
                          className="btn-primary"
                          onClick={() => setShippingOrderId(order._id)}
                          style={{ padding: '0.45rem 1.25rem', fontSize: '0.85rem' }}
                        >
                          📦 Pack & Ship Order
                        </button>
                      )}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginTop: '0.5rem' }}>
                      <div>
                        <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Shipping Destination</h4>
                        <div style={{ fontSize: '0.85rem', lineHeight: '1.4' }}>
                          <strong>{order.customerId?.name || 'Customer'}</strong><br />
                          {order.shippingAddress.street}<br />
                          {order.shippingAddress.city}, {order.shippingAddress.state || ''} {order.shippingAddress.zip}<br />
                          {order.shippingAddress.country}<br />
                          📞 {order.shippingAddress.phone}
                        </div>
                      </div>

                      <div>
                        <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Items checklist</h4>
                        <div style={{ display: 'grid', gap: '0.75rem' }}>
                          {order.items.map((item: any, itemIdx: number) => (
                            <div key={itemIdx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(15, 23, 42, 0.3)', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--panel-border)', fontSize: '0.85rem' }}>
                              <div>
                                <strong style={{ color: 'var(--text-main)' }}>{item.snapshot?.name || item.name}</strong>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>SKU: {item.variantSku}</div>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontWeight: 'bold' }}>Qty: {item.quantity}</div>
                                {item.allocations && item.allocations.length > 0 && (
                                  <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.2rem', justifyContent: 'flex-end' }}>
                                    {item.allocations.map((alloc: any, aIdx: number) => (
                                      <span key={aIdx} style={{ fontSize: '0.7rem', padding: '0.1rem 0.3rem', borderRadius: '3px', background: 'rgba(255,255,255,0.08)', color: 'var(--text-muted)' }}>
                                        {alloc.warehouse}: {alloc.quantity}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        )}
      </main>

      {/* ── Authentication Modal Overlay ── */}
      {showAuthModal && (
        <div 
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(15, 23, 42, 0.85)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100
          }}
          onClick={() => setShowAuthModal(false)}
        >
          <div className="auth-container" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0, textAlign: 'center', fontSize: '1.75rem', fontWeight: 800 }}>
              {isRegistering ? 'Create Account' : 'Sign In'}
            </h2>
            <form onSubmit={handleAuthSubmit}>
              {isRegistering && (
                <>
                  <div className="form-group">
                    <label>Full Name</label>
                    <input 
                      type="text" 
                      required 
                      className="form-control"
                      value={authForm.name}
                      onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label>Account Role</label>
                    <select 
                      className="form-control"
                      value={authForm.role}
                      onChange={(e) => setAuthForm({ ...authForm, role: e.target.value as SharedUser['role'] })}
                    >
                      <option value="customer">Customer (Buy Products)</option>
                      <option value="seller">Seller (Publish Catalog)</option>
                      <option value="warehouse">Warehouse Staff (Fulfillment)</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                </>
              )}

              <div className="form-group">
                <label>Email Address</label>
                <input 
                  type="email" 
                  required 
                  className="form-control"
                  value={authForm.email}
                  onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Password</label>
                <input 
                  type="password" 
                  required 
                  className="form-control"
                  value={authForm.password}
                  onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                />
              </div>

              <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: '1rem', padding: '0.85rem' }}>
                {isRegistering ? 'Sign Up' : 'Log In'}
              </button>
            </form>

            <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              {isRegistering ? (
                <span>
                  Already have an account?{' '}
                  <a href="#" style={{ color: '#a855f7', textDecoration: 'none' }} onClick={(e) => { e.preventDefault(); setIsRegistering(false); }}>
                    Sign In
                  </a>
                </span>
              ) : (
                <span>
                  Don't have an account?{' '}
                  <a href="#" style={{ color: '#a855f7', textDecoration: 'none' }} onClick={(e) => { e.preventDefault(); setIsRegistering(true); }}>
                    Create one
                  </a>
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Cart Drawer Overlay ── */}
      {showCartDrawer && (
        <div className="cart-drawer-overlay" onClick={() => setShowCartDrawer(false)}>
          <div className="cart-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="cart-header">
              <h2>Your Shopping Cart</h2>
              <button className="close-btn" onClick={() => setShowCartDrawer(false)}>&times;</button>
            </div>

            <div className="cart-items-list">
              {cartItems.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
                  <span style={{ fontSize: '3rem', display: 'block', marginBottom: '1rem' }}>🛒</span>
                  <h3>Your cart is empty</h3>
                  <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>Add some products to get started!</p>
                </div>
              ) : (
                cartItems.map((item) => (
                  <div className="cart-item-card" key={item.variantSku}>
                    {item.images?.[0] ? (
                      <img
                        src={item.images[0].startsWith('http') || item.images[0].startsWith('data') ? item.images[0] : `http://localhost:5000${item.images[0]}`}
                        className="cart-item-img"
                        alt={item.name}
                      />
                    ) : (
                      <div className="cart-item-img" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', fontSize: '1.2rem' }}>📷</div>
                    )}
                    <div className="cart-item-details">
                      <h4 className="cart-item-title">{item.name}</h4>
                      <span className="cart-item-sku">SKU: {item.variantSku}</span>
                      <span className="cart-item-price">${(item.salePrice !== undefined && item.salePrice !== null ? item.salePrice : item.price).toFixed(2)}</span>
                      
                      <div className="cart-item-actions">
                        <div className="quantity-control">
                          <button
                            className="qty-btn"
                            disabled={item.quantity <= 1}
                            onClick={() => updateCartItemQty(accessToken, isOfflineMode, item.variantSku, item.quantity - 1)}
                          >
                            -
                          </button>
                          <span className="qty-val">{item.quantity}</span>
                          <button
                            className="qty-btn"
                            disabled={item.quantity >= item.stock}
                            onClick={() => updateCartItemQty(accessToken, isOfflineMode, item.variantSku, item.quantity + 1)}
                          >
                            +
                          </button>
                        </div>
                        <button
                          className="remove-item-btn"
                          onClick={() => removeCartItem(accessToken, isOfflineMode, item.variantSku)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {cartItems.length > 0 && (
              <div className="cart-footer">
                <div className="cart-summary-row">
                  <span className="cart-summary-label">Total Items</span>
                  <span className="cart-summary-val">{cartTotalItems}</span>
                </div>
                <div className="cart-summary-row cart-total-row">
                  <span className="cart-summary-label">Subtotal</span>
                  <span className="cart-summary-val">${cartSubtotal.toFixed(2)}</span>
                </div>
                <button
                  className="checkout-btn"
                  onClick={() => {
                    if (!user) {
                      showAlert('error', 'You must log in to proceed to checkout');
                      setShowCartDrawer(false);
                      setIsRegistering(false);
                      setShowAuthModal(true);
                    } else {
                      setAppliedCoupon(null);
                      setCouponCode('');
                      setCouponError('');
                      setShowCheckoutModal(true);
                      setShowCartDrawer(false);
                    }
                  }}
                >
                  Proceed to Checkout
                </button>
                <button
                  className="btn"
                  style={{ background: 'transparent', color: 'var(--error-color)', border: '1px solid rgba(239,68,68,0.2)', padding: '0.5rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem', marginTop: '0.5rem' }}
                  onClick={() => {
                    if (window.confirm('Are you sure you want to clear your cart?')) {
                      clearCart(accessToken, isOfflineMode);
                    }
                  }}
                >
                  Clear Cart
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Checkout Modal Overlay ── */}
      {showCheckoutModal && (
        <div className="cart-drawer-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="form-panel" style={{ maxWidth: '600px', width: '90%', maxHeight: '90vh', overflowY: 'auto', background: '#1e293b', border: '1px solid var(--panel-border)', borderRadius: '20px', padding: '2.5rem', boxShadow: 'var(--shadow)', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ margin: 0, background: 'var(--primary-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontSize: '1.5rem', fontWeight: 'bold' }}>Secure Checkout</h2>
              <button className="close-btn" onClick={() => { setShowCheckoutModal(false); setCheckoutResult(null); }}>&times;</button>
            </div>

            {checkoutResult ? (
              /* Success Receipt */
              <div style={{ textAlign: 'center', padding: '1rem' }}>
                <span style={{ fontSize: '3.5rem', display: 'block', marginBottom: '1rem' }}>🎉</span>
                <h3 style={{ color: 'var(--success-color)', fontSize: '1.4rem', margin: '0.5rem 0' }}>Order Confirmed!</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Thank you for your purchase. Your invoice receipt is generated below.</p>
                
                <div style={{ margin: '2rem 0', background: 'rgba(15, 23, 42, 0.4)', border: '1px solid var(--panel-border)', padding: '1.5rem', borderRadius: '15px', textAlign: 'left' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.65rem', fontSize: '0.9rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Order Reference:</span>
                    <strong>{checkoutResult.orderNumber}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.65rem', fontSize: '0.9rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Amount Charged:</span>
                    <strong style={{ color: 'var(--accent-color)' }}>${checkoutResult.total.toFixed(2)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.65rem', fontSize: '0.9rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Payment Channel:</span>
                    <strong>{checkoutResult.paymentMethod === 'stripe' ? 'Stripe Gateway' : 'Simulated Checkout'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Delivery Status:</span>
                    <strong style={{ color: 'var(--success-color)', textTransform: 'capitalize' }}>{checkoutResult.status}</strong>
                  </div>
                </div>

                <button 
                  className="btn-primary" 
                  style={{ width: '100%', padding: '0.85rem' }}
                  onClick={() => {
                    setCheckoutResult(null);
                    setShowCheckoutModal(false);
                    setActiveTab('orders');
                    fetchOrders();
                  }}
                >
                  View Order Details & Tracking
                </button>
              </div>
            ) : (
              /* Shipping & Card inputs form */
              <form onSubmit={handleCheckoutSubmit}>
                <h4 style={{ margin: '0 0 1rem 0', color: 'var(--accent-color)', fontSize: '1rem', borderBottom: '1px solid var(--panel-border)', paddingBottom: '0.5rem' }}>1. Shipping Information</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label>Street Address</label>
                    <input 
                      type="text" 
                      required 
                      className="form-control"
                      value={checkoutForm.street}
                      onChange={(e) => setCheckoutForm({ ...checkoutForm, street: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>City</label>
                    <input 
                      type="text" 
                      required 
                      className="form-control"
                      value={checkoutForm.city}
                      onChange={(e) => setCheckoutForm({ ...checkoutForm, city: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>State / Province</label>
                    <input 
                      type="text" 
                      className="form-control"
                      value={checkoutForm.state}
                      onChange={(e) => setCheckoutForm({ ...checkoutForm, state: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>ZIP / Postal Code</label>
                    <input 
                      type="text" 
                      required 
                      className="form-control"
                      value={checkoutForm.zip}
                      onChange={(e) => setCheckoutForm({ ...checkoutForm, zip: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Country Code (e.g. US)</label>
                    <input 
                      type="text" 
                      required 
                      className="form-control"
                      value={checkoutForm.country}
                      onChange={(e) => setCheckoutForm({ ...checkoutForm, country: e.target.value })}
                    />
                  </div>
                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label>Phone Number</label>
                    <input 
                      type="tel" 
                      required 
                      className="form-control"
                      value={checkoutForm.phone}
                      onChange={(e) => setCheckoutForm({ ...checkoutForm, phone: e.target.value })}
                    />
                  </div>
                </div>

                <h4 style={{ margin: '1.5rem 0 1rem 0', color: 'var(--accent-color)', fontSize: '1rem', borderBottom: '1px solid var(--panel-border)', paddingBottom: '0.5rem' }}>2. Payment Information</h4>
                <div style={{ margin: '0 0 1.5rem 0', padding: '1rem', background: 'rgba(15, 23, 42, 0.4)', borderRadius: '10px', border: '1px solid var(--panel-border)' }}>
                  <div className="form-group">
                    <label>Card Number</label>
                    <input 
                      type="text" 
                      placeholder="4242 4242 4242 4242"
                      required 
                      className="form-control"
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
                    <div className="form-group">
                      <label>Expiry Date</label>
                      <input 
                        type="text" 
                        placeholder="MM/YY"
                        required 
                        className="form-control"
                      />
                    </div>
                    <div className="form-group">
                      <label>CVC</label>
                      <input 
                        type="text" 
                        placeholder="123"
                        required 
                        className="form-control"
                      />
                    </div>
                  </div>
                </div>

                <h4 style={{ margin: '1.5rem 0 1rem 0', color: 'var(--accent-color)', fontSize: '1rem', borderBottom: '1px solid var(--panel-border)', paddingBottom: '0.5rem' }}>3. Coupon Code</h4>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
                  <input 
                    type="text" 
                    placeholder="Enter Coupon Code (e.g. SUMMER20)"
                    className="form-control"
                    value={couponCode}
                    onChange={(e) => {
                      setCouponCode(e.target.value);
                      setCouponError('');
                    }}
                    disabled={!!appliedCoupon || applyingCoupon}
                    style={{ textTransform: 'uppercase' }}
                  />
                  {appliedCoupon ? (
                    <button 
                      type="button" 
                      className="action-btn delete"
                      onClick={() => {
                        setAppliedCoupon(null);
                        setCouponCode('');
                      }}
                      style={{ padding: '0.5rem 1rem' }}
                    >
                      Remove
                    </button>
                  ) : (
                    <button 
                      type="button" 
                      className="btn-primary" 
                      onClick={handleApplyCoupon}
                      disabled={applyingCoupon || !couponCode.trim()}
                      style={{ padding: '0.5rem 1rem', background: 'var(--primary-gradient)' }}
                    >
                      {applyingCoupon ? 'Applying...' : 'Apply'}
                    </button>
                  )}
                </div>
                {couponError && <div style={{ color: '#ef4444', fontSize: '0.85rem', marginTop: '-1rem', marginBottom: '1rem' }}>{couponError}</div>}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', margin: '2rem 0 1.5rem 0', padding: '1rem', borderTop: '1px solid var(--panel-border)', borderBottom: '1px solid var(--panel-border)', fontSize: '0.95rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Cart Subtotal:</span>
                    <span>${cartSubtotal.toFixed(2)}</span>
                  </div>
                  {appliedCoupon && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--success-color)' }}>
                      <span>Discount Coupon ({appliedCoupon.couponCode}):</span>
                      <span>-${appliedCoupon.discountAmount.toFixed(2)}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Shipping cost:</span>
                    <span>{shippingVal === 0 ? 'FREE' : `$${shippingVal.toFixed(2)}`}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Estimated Tax (8%):</span>
                    <span>${taxVal.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '1.1rem', color: 'var(--accent-color)', marginTop: '0.5rem' }}>
                    <span>Order Total:</span>
                    <span>${totalVal.toFixed(2)}</span>
                  </div>
                </div>

                <button 
                  type="submit" 
                  className="btn-primary" 
                  style={{ width: '100%', padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                  disabled={isProcessingCheckout}
                >
                  {isProcessingCheckout ? (
                    <>
                      <span className="spinner" style={{ display: 'inline-block', border: '2px solid white', borderTop: '2px solid transparent', borderRadius: '50%', width: '16px', height: '16px' }}></span>
                      Processing Payment...
                    </>
                  ) : (
                    `Confirm & Pay $${totalVal.toFixed(2)}`
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default App;
