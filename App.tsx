import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  ShoppingBag, 
  User, 
  Home, 
  Grid, 
  MessageCircle, 
  Search, 
  ChevronLeft, 
  Plus, 
  Minus, 
  Trash2, 
  Send, 
  CheckCircle2, 
  Heart, 
  Share2, 
  SlidersHorizontal,
  Package,
  MapPin,
  CreditCard,
  Settings,
  HelpCircle,
  LogOut,
  ChevronRight,
  Sparkles,
  ArrowRight,
  AlertCircle,
  RefreshCw,
  Info,
  ShieldCheck,
  Zap
} from 'lucide-react';

// --- API & CONSTANTS ---
const API_ENDPOINT = 'https://mvwflakurihhakdrlteg.supabase.co/functions/v1/get-divoom-products';

// Currency Formatter
const formatIDR = (price) => {
  if (typeof price !== 'number' || isNaN(price)) return 'Rp 0';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(price);
};

// Normalize API values before rendering or using them in cart calculations.
const isValidPrice = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;

const getActivePrice = (product) => {
  if (isValidPrice(product?.sale_price) && product.sale_price > 0) return product.sale_price;
  return isValidPrice(product?.price) ? product.price : null;
};

const getNumericStock = (product) => {
  const candidates = [product?.stock_quantity, product?.stock, product?.quantity];
  const value = candidates.find((candidate) => typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0);
  return value === undefined ? null : Math.floor(value);
};

const normalizeProduct = (product) => {
  if (!product || typeof product !== 'object' || Array.isArray(product)) return null;
  const hasId = (typeof product.id === 'string' && product.id.trim()) || (typeof product.id === 'number' && Number.isFinite(product.id));
  if (!hasId || typeof product.title !== 'string' || !product.title.trim()) return null;
  return {
    ...product,
    title: product.title.trim(),
    description: typeof product.description === 'string' ? product.description : '',
    rich_text_description: typeof product.rich_text_description === 'string' ? product.rich_text_description : '',
    availability: typeof product.availability === 'string' ? product.availability : 'out of stock',
    product_type: typeof product.product_type === 'string' ? product.product_type : 'Audio & Display'
  };
};

// Initial Mock Livechat Messages
const INITIAL_CHAT_MESSAGES = [
  { id: 1, sender: 'system', text: 'Welcome to Divoom Official Store support! How can we assist with your pixel display or Bluetooth audio today?', time: '10:00 AM' },
  { id: 2, sender: 'system', text: 'Note: Customer care team operates Mon-Sat 09:00 - 18:00 WIB.', time: '10:01 AM' }
];

// --- MAIN APPLICATION COMPONENT ---
export default function App() {
  // Navigation State
  const [currentPage, setCurrentPage] = useState('home'); // 'home' | 'catalog' | 'detail' | 'cart' | 'profile' | 'livechat'
  const [selectedProductGroupId, setSelectedProductGroupId] = useState(null);
  const [selectedVariantId, setSelectedVariantId] = useState(null);
  const [activeCategory, setActiveCategory] = useState('All');

  // Product API State
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState(null);

  // Cart & Wishlist State
  const [cart, setCart] = useState([]);
  const [wishlist, setWishlist] = useState([]);
  const [chatMessages, setChatMessages] = useState(INITIAL_CHAT_MESSAGES);

  // Toast and request lifecycle refs
  const [toastMessage, setToastMessage] = useState(null);
  const toastTimerRef = useRef(null);
  const requestControllerRef = useRef(null);

  const showToast = (msg) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(msg);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, 3000);
  };

  // Fetch API Products with cancellation to prevent stale responses.
  const fetchProducts = async () => {
    if (requestControllerRef.current) requestControllerRef.current.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    setLoading(true);
    setApiError(null);
    try {
      const response = await fetch(API_ENDPOINT, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP Error Status: ${response.status}`);
      const json = await response.json();
      if (controller.signal.aborted) return;
      if (json && json.success === true && Array.isArray(json.data)) {
        const normalizedProducts = json.data.map(normalizeProduct).filter(Boolean);
        setProducts(normalizedProducts);
        if (json.data.length > 0 && normalizedProducts.length === 0) {
          throw new Error('Product API returned no valid product records.');
        }
      } else {
        throw new Error(json?.message || 'Invalid API response format received.');
      }
    } catch (err) {
      if (err?.name === 'AbortError' || controller.signal.aborted) return;
      console.error('Failed to fetch Divoom products:', err);
      setApiError(typeof err?.message === 'string' ? err.message : 'Failed to connect to Divoom Product Service.');
    } finally {
      if (!controller.signal.aborted && requestControllerRef.current === controller) {
        setLoading(false);
        requestControllerRef.current = null;
      }
    }
  };

  useEffect(() => {
    fetchProducts();
    return () => {
      if (requestControllerRef.current) requestControllerRef.current.abort();
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // Group products by item_group_id or fallback to id
  const productFamilies = useMemo(() => {
    const map = new Map();
    products.forEach((prod) => {
      const rawGroupId = prod.item_group_id || prod.id;
      if (rawGroupId === null || rawGroupId === undefined || String(rawGroupId).trim() === '') return;
      const groupId = String(rawGroupId);
      if (!map.has(groupId)) {
        map.set(groupId, []);
      }
      map.get(groupId).push(prod);
    });
    return Array.from(map.entries()).map(([groupId, items]) => {
      // Representative product record (first variant)
      const primary = items[0];
      return {
        groupId,
        primary,
        variants: items,
        category: primary.product_type || 'Audio & Display',
        hasInStock: items.some(item => item.availability?.toLowerCase() === 'in stock')
      };
    });
  }, [products]);

  // Derived Product Categories from API data
  const categories = useMemo(() => {
    const set = new Set(['All']);
    products.forEach(p => {
      if (p.product_type) set.add(p.product_type);
    });
    return Array.from(set);
  }, [products]);

  // Cart Calculations
  const cartItemCount = useMemo(() => {
    return cart.reduce((acc, item) => acc + item.quantity, 0);
  }, [cart]);

  const cartSubtotal = useMemo(() => {
    return cart.reduce((acc, item) => {
      const activePrice = getActivePrice(item.product);
      const quantity = Number.isInteger(item.quantity) && item.quantity > 0 ? item.quantity : 0;
      return acc + ((activePrice !== null ? activePrice : 0) * quantity);
    }, 0);
  }, [cart]);

  // Navigation handlers
  const navigateTo = (page, groupId = null) => {
    if (groupId) {
      setSelectedProductGroupId(groupId);
    }
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Cart Operations
  const addToCart = (productRecord, quantity = 1) => {
    if (!productRecord || !Number.isInteger(quantity) || quantity < 1) {
      showToast('Invalid product quantity.');
      return;
    }
    if (getActivePrice(productRecord) === null) {
      showToast('This item has an invalid price and cannot be added.');
      return;
    }
    if (productRecord.availability?.toLowerCase() !== 'in stock') {
      showToast('Selected item is currently out of stock.');
      return;
    }
    const availableStock = getNumericStock(productRecord);
    const existingItem = cart.find((item) => String(item.product.id) === String(productRecord.id));
    const nextQuantity = (existingItem?.quantity || 0) + quantity;
    if (availableStock !== null && nextQuantity > availableStock) {
      showToast('Requested quantity exceeds available stock.');
      return;
    }
    setCart((prev) => {
      const existingIdx = prev.findIndex((item) => String(item.product.id) === String(productRecord.id));
      if (existingIdx > -1) {
        return prev.map((item, index) => index === existingIdx
          ? { ...item, quantity: item.quantity + quantity }
          : item);
      }
      return [...prev, { product: productRecord, quantity }];
    });
    showToast(`Added ${productRecord.title} to bag`);
  };

  const updateCartQuantity = (index, delta) => {
    setCart((prev) => prev.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      const newQty = item.quantity + delta;
      const availableStock = getNumericStock(item.product);
      if (!Number.isInteger(newQty) || newQty < 1 || (availableStock !== null && newQty > availableStock)) return item;
      return { ...item, quantity: newQty };
    }));
  };

  const removeFromCart = (index) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
    showToast('Item removed from shopping bag');
  };

  const toggleWishlist = (groupId) => {
    setWishlist((prev) => 
      prev.includes(groupId) ? prev.filter(id => id !== groupId) : [...prev, groupId]
    );
  };

  // Selected Group details for ProductDetailPage
  const selectedGroupObj = useMemo(() => {
    return productFamilies.find(f => f.groupId === selectedProductGroupId) || productFamilies[0];
  }, [productFamilies, selectedProductGroupId]);

  const selectedVariant = selectedGroupObj?.variants?.find(v => String(v.id) === String(selectedVariantId)) || selectedGroupObj?.primary;

  useEffect(() => {
    setSelectedVariantId(selectedGroupObj?.variants?.[0]?.id ?? null);
  }, [selectedGroupObj?.groupId]);

  return (
    <div className="h-[100vh] w-full bg-neutral-950 text-neutral-800 flex justify-center font-sans antialiased selection:bg-rose-500 selection:text-white">
      {/* Mobile Root Frame Constraints with Explicit flex-col and h-[100vh] */}
      <div className="w-full max-w-[500px] h-[100vh] bg-neutral-900 flex flex-col relative overflow-hidden shadow-2xl border-x border-neutral-800">

        {/* Global Floating Toast */}
        {toastMessage && (
          <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-[440px] bg-neutral-800 text-white text-xs py-3 px-4 rounded-xl shadow-xl flex items-center justify-between border border-neutral-700 animate-in fade-in duration-200">
            <div className="flex items-center space-x-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="font-medium tracking-wide">{toastMessage}</span>
            </div>
            <button onClick={() => setToastMessage(null)} className="text-neutral-400 hover:text-white text-xs font-semibold ml-2">
              Close
            </button>
          </div>
        )}

        {/* APP HEADER - Always Fixed at Top */}
        <Header 
          currentPage={currentPage}
          cartCount={cartItemCount}
          onCartClick={() => navigateTo('cart')}
          onProfileClick={() => navigateTo('profile')}
          onBrandClick={() => navigateTo('home')}
          onBackClick={() => navigateTo('catalog')}
        />

        {/* MAIN SCROLLABLE CONTENT REGION - Flex-1 and Scrollable */}
        <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-neutral-950 text-neutral-100">
          {currentPage === 'home' && (
            <HomePage 
              productFamilies={productFamilies}
              categories={categories}
              loading={loading}
              error={apiError}
              onRetry={fetchProducts}
              onNavigate={navigateTo}
              onSelectCategory={(cat) => {
                setActiveCategory(cat);
                navigateTo('catalog');
              }}
              wishlist={wishlist}
              onToggleWishlist={toggleWishlist}
            />
          )}

          {currentPage === 'catalog' && (
            <CatalogPage 
              productFamilies={productFamilies}
              categories={categories}
              activeCategory={activeCategory}
              onCategoryChange={setActiveCategory}
              loading={loading}
              error={apiError}
              onRetry={fetchProducts}
              onSelectProductGroup={(groupId) => navigateTo('detail', groupId)}
              wishlist={wishlist}
              onToggleWishlist={toggleWishlist}
            />
          )}

          {currentPage === 'detail' && (
            <ProductDetailPage 
              family={selectedGroupObj}
              loading={loading}
              onAddToCart={addToCart}
              selectedVariantId={selectedVariantId}
              onSelectVariant={setSelectedVariantId}
              onBack={() => navigateTo('catalog')}
              wishlist={wishlist}
              onToggleWishlist={toggleWishlist}
            />
          )}

          {currentPage === 'cart' && (
            <CartPage 
              cart={cart}
              onUpdateQuantity={updateCartQuantity}
              onRemoveItem={removeFromCart}
              subtotal={cartSubtotal}
              onExplore={() => navigateTo('catalog')}
            />
          )}

          {currentPage === 'profile' && (
            <ProfilePage 
              wishlistCount={wishlist.length}
              cartCount={cartItemCount}
              onNavigate={navigateTo}
            />
          )}

          {currentPage === 'livechat' && (
            <LivechatPage 
              messages={chatMessages}
              onSendMessage={(txt) => {
                const userMsg = {
                  id: Date.now(),
                  sender: 'user',
                  text: txt,
                  time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                };
                setChatMessages(prev => [...prev, userMsg]);
              }}
            />
          )}
        </main>

        {/* BOTTOM NAVIGATION / BOTTOM ACTION BAR - Conditionally Rendered */}
        {currentPage === 'detail' ? (
          <ProductBottomActionBar
            family={selectedGroupObj}
            selectedVariant={selectedVariant}
            onAddToCart={addToCart}
          />
        ) : currentPage === 'cart' ? (
          <CartBottomActionBar 
            subtotal={cartSubtotal}
            cartLength={cart.length}
          />
        ) : (
          <BottomNav currentPage={currentPage} onNavigate={navigateTo} />
        )}

      </div>
    </div>
  );
}

// --- HEADER COMPONENT ---
function Header({ currentPage, cartCount, onCartClick, onProfileClick, onBrandClick, onBackClick }) {
  const isDetailPage = currentPage === 'detail';

  return (
    <header className="shrink-0 bg-neutral-900 border-b border-neutral-800/80 px-4 py-3 flex items-center justify-between text-white z-30 shadow-md min-h-[56px]">
      <div className="flex items-center space-x-2">
        {isDetailPage ? (
          <button 
            onClick={onBackClick}
            className="p-1 -ml-1 text-neutral-300 hover:text-white flex items-center space-x-1 focus:outline-none"
            aria-label="Back to Catalog"
          >
            <ChevronLeft className="w-5 h-5 text-rose-500" />
            <span className="text-xs uppercase tracking-wider font-semibold">Catalog</span>
          </button>
        ) : (
          <div 
            onClick={onBrandClick}
            className="flex items-center space-x-2 cursor-pointer group"
          >
            <div className="w-7 h-7 rounded-lg bg-rose-600 flex items-center justify-center font-bold text-white text-xs shadow-lg shadow-rose-950">
              D
            </div>
            <div>
              <h1 className="font-serif tracking-widest text-sm font-black text-neutral-100 uppercase leading-none">
                DIVOOM <span className="text-rose-500 font-sans text-[10px] font-bold tracking-wider">STORE</span>
              </h1>
              <span className="text-[9px] text-neutral-400 font-mono tracking-tighter">OFFICIAL PIXEL TECH</span>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center space-x-2">
        {/* Shopping Cart Button */}
        <button 
          onClick={onCartClick}
          className={`relative p-2 rounded-lg transition-colors ${
            currentPage === 'cart' ? 'bg-neutral-800 text-rose-400' : 'text-neutral-300 hover:bg-neutral-800'
          }`}
          aria-label={`Shopping Cart with ${cartCount} items`}
        >
          <ShoppingBag className="w-5 h-5" />
          {cartCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-rose-600 text-white font-bold text-[10px] min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1 border-2 border-neutral-900">
              {cartCount}
            </span>
          )}
        </button>

        {/* Profile Button */}
        <button 
          onClick={onProfileClick}
          className={`p-2 rounded-lg transition-colors ${
            currentPage === 'profile' ? 'bg-neutral-800 text-rose-400' : 'text-neutral-300 hover:bg-neutral-800'
          }`}
          aria-label="User Profile"
        >
          <User className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}

// --- BOTTOM NAVIGATION COMPONENT ---
function BottomNav({ currentPage, onNavigate }) {
  const navItems = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'catalog', label: 'Catalog', icon: Grid },
    { id: 'livechat', label: 'Livechat', icon: MessageCircle }
  ];

  return (
    <nav className="shrink-0 bg-neutral-900 border-t border-neutral-800/80 px-4 py-2 flex items-center justify-around z-30 shadow-lg">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = currentPage === item.id || (item.id === 'catalog' && currentPage === 'detail');
        return (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`flex flex-col items-center py-1 px-4 transition-all duration-200 relative ${
              isActive ? 'text-rose-500 scale-105' : 'text-neutral-400 hover:text-neutral-200'
            }`}
            aria-label={item.label}
          >
            <Icon className="w-5 h-5 stroke-[2]" />
            <span className="text-[10px] uppercase tracking-wider mt-1 font-semibold">
              {item.label}
            </span>
            {isActive && (
              <span className="absolute -bottom-1 w-6 h-[3px] bg-rose-500 rounded-full" />
            )}
          </button>
        );
      })}
    </nav>
  );
}

// --- 1. HOME PAGE ---
function HomePage({ productFamilies, categories, loading, error, onRetry, onNavigate, onSelectCategory, wishlist, onToggleWishlist }) {
  const featuredFamilies = productFamilies.slice(0, 6);

  return (
    <div className="space-y-6 pb-6">
      {/* Hero Banner Section */}
      <section className="relative h-[290px] bg-neutral-900 overflow-hidden border-b border-neutral-800">
        <img 
          src="https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&q=80&w=1000" 
          alt="Divoom Pixel Art Display Tech" 
          className="w-full h-full object-cover opacity-35 scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/60 to-transparent flex flex-col justify-end p-5">
          <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 bg-rose-600/20 border border-rose-500/40 rounded-full text-rose-400 text-[10px] font-mono uppercase tracking-wider mb-2 w-max">
            <Zap className="w-3 h-3 text-rose-400" />
            <span>Smart Pixel Audio & Display</span>
          </div>
          <h2 className="text-2xl font-serif font-black text-white leading-tight mb-2">
            Retro Audio <br />
            <span className="text-rose-500 font-sans italic font-normal">Retro Pixel Magic</span>
          </h2>
          <p className="text-xs text-neutral-300 mb-4 max-w-[300px] line-clamp-2 leading-relaxed font-light">
            Explore authentic Divoom Bluetooth speakers, programmable LED displays, and artisan desktop art tech.
          </p>
          <button 
            onClick={() => onNavigate('catalog')}
            className="w-full sm:w-auto bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs tracking-widest uppercase py-3 px-6 rounded-lg transition-colors flex items-center justify-center space-x-2 shadow-lg shadow-rose-950"
          >
            <span>Browse Full Catalog</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* Categories Shortcut */}
      <section className="px-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs uppercase tracking-widest font-bold text-neutral-400">Categories</h3>
          <button 
            onClick={() => onNavigate('catalog')}
            className="text-xs text-rose-400 font-semibold hover:underline"
          >
            View All
          </button>
        </div>
        <div className="flex space-x-2 overflow-x-auto pb-2 scrollbar-none">
          {categories.filter(c => c !== 'All').map((cat) => (
            <button
              key={cat}
              onClick={() => onSelectCategory(cat)}
              className="px-3.5 py-2 bg-neutral-900 rounded-lg border border-neutral-800 text-xs font-medium text-neutral-300 hover:border-rose-500 hover:text-white shrink-0 transition-all"
            >
              {cat}
            </button>
          ))}
        </div>
      </section>

      {/* Brand Features Banner */}
      <section className="px-4">
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3.5 flex items-center justify-around text-center">
          <div className="flex flex-col items-center">
            <ShieldCheck className="w-4 h-4 text-rose-400 mb-1" />
            <span className="text-[11px] font-bold text-neutral-200">Official Warranty</span>
            <span className="text-[9px] text-neutral-400">100% Authentic Divoom</span>
          </div>
          <div className="h-7 w-[1px] bg-neutral-800" />
          <div className="flex flex-col items-center">
            <Sparkles className="w-4 h-4 text-amber-400 mb-1" />
            <span className="text-[11px] font-bold text-neutral-200">Pixel App Sync</span>
            <span className="text-[9px] text-neutral-400">Divoom App Connected</span>
          </div>
        </div>
      </section>

      {/* API Loading / Error / Content */}
      <section className="px-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Featured Gear</h3>
            <p className="text-[11px] text-neutral-400">Top-rated Divoom creations available now</p>
          </div>
        </div>

        {loading && <LoadingState />}

        {error && <ErrorState message={error} onRetry={onRetry} />}

        {!loading && !error && featuredFamilies.length === 0 && (
          <EmptyCatalogState />
        )}

        {!loading && !error && featuredFamilies.length > 0 && (
          <div className="grid grid-cols-2 gap-3.5">
            {featuredFamilies.map((fam) => (
              <ProductFamilyCard 
                key={fam.groupId} 
                family={fam} 
                onSelect={() => onNavigate('detail', fam.groupId)}
                isWishlisted={wishlist.includes(fam.groupId)}
                onToggleWishlist={() => onToggleWishlist(fam.groupId)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// --- 2. CATALOG PAGE ---
function CatalogPage({ productFamilies, categories, activeCategory, onCategoryChange, loading, error, onRetry, onSelectProductGroup, wishlist, onToggleWishlist }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('featured'); // 'featured' | 'price-low' | 'price-high'

  const filteredFamilies = useMemo(() => {
    return productFamilies.filter((fam) => {
      const primary = fam.primary;
      const matchesCategory = activeCategory === 'All' || fam.category === activeCategory;
      const title = typeof primary?.title === 'string' ? primary.title : '';
      const description = typeof primary?.description === 'string' ? primary.description : '';
      const query = searchQuery.toLowerCase();
      const matchesSearch = title.toLowerCase().includes(query) || description.toLowerCase().includes(query);
      return matchesCategory && matchesSearch;
    }).sort((a, b) => {
      const getActivePrice = (item) => (typeof item.sale_price === 'number' && item.sale_price > 0) ? item.sale_price : item.price;
      if (sortBy === 'price-low') return getActivePrice(a.primary) - getActivePrice(b.primary);
      if (sortBy === 'price-high') return getActivePrice(b.primary) - getActivePrice(a.primary);
      return 0;
    });
  }, [productFamilies, activeCategory, searchQuery, sortBy]);

  return (
    <div className="p-4 space-y-4">
      {/* Search Bar */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            placeholder="Search Divoom Ditoo, Planet-9, Pixoo..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-neutral-900 border border-neutral-800 rounded-lg pl-10 pr-9 py-2.5 text-xs text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-rose-500 shadow-sm"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-400 hover:text-white"
            >
              Clear
            </button>
          )}
        </div>

        {/* Categories Pills */}
        <div className="flex space-x-2 overflow-x-auto pb-1 scrollbar-none">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => onCategoryChange(cat)}
              className={`px-3.5 py-1.5 rounded-full text-xs transition-colors shrink-0 ${
                activeCategory === cat
                  ? 'bg-rose-600 text-white font-semibold'
                  : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-800 border border-neutral-800'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Sorting & Filter Summary */}
      <div className="flex items-center justify-between text-xs text-neutral-400 pt-1 border-t border-neutral-800/60">
        <span>Showing {filteredFamilies.length} items</span>
        <div className="flex items-center space-x-1">
          <SlidersHorizontal className="w-3.5 h-3.5 text-neutral-400" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-transparent text-xs text-neutral-300 font-medium focus:outline-none cursor-pointer"
          >
            <option value="featured" className="bg-neutral-900">Sort: Featured</option>
            <option value="price-low" className="bg-neutral-900">Price: Low to High</option>
            <option value="price-high" className="bg-neutral-900">Price: High to Low</option>
          </select>
        </div>
      </div>

      {/* API States & Grid */}
      {loading && <LoadingState />}

      {error && <ErrorState message={error} onRetry={onRetry} />}

      {!loading && !error && filteredFamilies.length === 0 && (
        <div className="text-center py-16 bg-neutral-900 rounded-xl border border-dashed border-neutral-800 p-6">
          <Package className="w-8 h-8 mx-auto text-neutral-500 mb-2" />
          <p className="text-xs font-semibold text-neutral-300">No Divoom products match your search</p>
          <p className="text-[11px] text-neutral-500 mt-1">Try selecting another category or clear your search term.</p>
          <button 
            onClick={() => { onCategoryChange('All'); setSearchQuery(''); }}
            className="mt-4 px-4 py-2 bg-rose-600 text-white text-xs rounded-lg font-medium"
          >
            Reset Filters
          </button>
        </div>
      )}

      {!loading && !error && filteredFamilies.length > 0 && (
        <div className="grid grid-cols-2 gap-3.5 pt-1">
          {filteredFamilies.map((fam) => (
            <ProductFamilyCard 
              key={fam.groupId} 
              family={fam} 
              onSelect={() => onSelectProductGroup(fam.groupId)}
              isWishlisted={wishlist.includes(fam.groupId)}
              onToggleWishlist={() => onToggleWishlist(fam.groupId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// --- 3. PRODUCT DETAIL PAGE ---
function ProductDetailPage({ family, loading, onAddToCart, onBack, wishlist, onToggleWishlist, selectedVariantId, onSelectVariant }) {
  const variants = family?.variants || [];
  const groupId = family?.groupId;
  const [selectedImageIdx, setSelectedImageIdx] = useState(0);
  const currentVariant = variants.find(v => String(v.id) === String(selectedVariantId)) || variants[0] || null;
  const isWishlisted = wishlist.includes(groupId);

  // Derive gallery images before any conditional return to keep Hooks order stable.
  const images = useMemo(() => {
    const list = [];
    if (currentVariant?.image_link) list.push(currentVariant.image_link);
    if (Array.isArray(currentVariant?.additional_image_link)) {
      list.push(...currentVariant.additional_image_link.filter(Boolean));
    }
    return list.length > 0 ? list : ['https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&q=80&w=800'];
  }, [currentVariant]);

  if (loading || !family || !currentVariant) {
    return <div className="p-6 text-center text-xs text-neutral-400">Loading product details...</div>;
  }

  const activePrice = (typeof currentVariant?.sale_price === 'number' && currentVariant.sale_price > 0)
    ? currentVariant.sale_price
    : currentVariant?.price;
  const originalPrice = (typeof currentVariant?.sale_price === 'number' && currentVariant.sale_price > 0)
    ? currentVariant?.price
    : null;

  const isInStock = currentVariant?.availability?.toLowerCase() === 'in stock';

  return (
    <div className="pb-24 bg-neutral-950 min-h-full">
      {/* Gallery Image Display */}
      <div className="relative bg-neutral-900 aspect-square overflow-hidden border-b border-neutral-800">
        <img 
          src={images[selectedImageIdx] || images[0]} 
          alt={currentVariant.title}
          className="w-full h-full object-cover transition-opacity duration-300"
          onError={(e) => {
            e.currentTarget.src = 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&q=80&w=800';
          }}
        />

        {/* Action Overlay */}
        <div className="absolute top-4 right-4 flex flex-col space-y-2 z-10">
          <button 
            onClick={() => onToggleWishlist(groupId)}
            className="p-2.5 bg-neutral-900/80 backdrop-blur-md rounded-full text-neutral-300 hover:text-rose-500 shadow-lg border border-neutral-700"
            aria-label="Wishlist"
          >
            <Heart className={`w-4 h-4 ${isWishlisted ? 'fill-rose-500 text-rose-500' : ''}`} />
          </button>
        </div>

        {/* Gallery Image Dots */}
        {images.length > 1 && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex space-x-1.5 bg-neutral-900/60 backdrop-blur-md px-2.5 py-1.5 rounded-full border border-neutral-800">
            {images.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setSelectedImageIdx(idx)}
                className={`h-1.5 rounded-full transition-all ${
                  selectedImageIdx === idx ? 'w-5 bg-rose-500' : 'w-1.5 bg-neutral-500'
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Product Details Header */}
      <div className="p-4 space-y-5">
        <div>
          <div className="flex items-center justify-between text-[11px] text-neutral-400 uppercase tracking-widest mb-1">
            <span>{currentVariant.brand || 'Divoom'} • {currentVariant.product_type || 'Display & Audio'}</span>
            <span className={`font-semibold ${isInStock ? 'text-emerald-400' : 'text-rose-400'}`}>
              {isInStock ? 'In Stock' : 'Out of Stock'}
            </span>
          </div>

          <h2 className="text-xl font-bold text-white leading-tight">{currentVariant.title}</h2>
          
          <div className="mt-2 flex items-baseline space-x-3">
            <span className="text-xl font-bold text-rose-400">{formatIDR(activePrice)}</span>
            {originalPrice && (
              <span className="text-xs text-neutral-500 line-through">{formatIDR(originalPrice)}</span>
            )}
          </div>
        </div>

        {/* Variant Selector (Color / Model Options) */}
        {variants.length > 1 && (
          <div className="space-y-2 border-t border-neutral-900 pt-3">
            <label className="text-xs font-semibold uppercase tracking-wider text-neutral-300 block">
              Select Variant ({variants.length} available)
            </label>
            <div className="grid grid-cols-2 gap-2">
              {variants.map((v) => {
                const isSelected = v.id === selectedVariantId;
                return (
                  <button
                    key={v.id}
                    onClick={() => {
                      onSelectVariant(v.id);
                      setSelectedImageIdx(0);
                    }}
                    className={`p-2.5 text-left rounded-lg border text-xs transition-all flex flex-col justify-between ${
                      isSelected
                        ? 'border-rose-500 bg-rose-950/20 text-white font-semibold shadow-sm'
                        : 'border-neutral-800 bg-neutral-900 text-neutral-400 hover:border-neutral-700'
                    }`}
                  >
                    <span className="truncate">{v.color || v.title}</span>
                    <span className="text-[10px] text-rose-400 font-mono mt-1">
                      {formatIDR((typeof v.sale_price === 'number' && v.sale_price > 0) ? v.sale_price : v.price)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Specifications List */}
        <div className="border-t border-neutral-900 pt-4 space-y-2 text-xs">
          <h4 className="font-semibold uppercase tracking-wider text-neutral-300">Product Info</h4>
          <div className="grid grid-cols-2 gap-2 bg-neutral-900 p-3 rounded-lg border border-neutral-800 text-[11px] text-neutral-400">
            <div>Condition: <span className="text-neutral-200 capitalize">{currentVariant.condition || 'New'}</span></div>
            <div>Color: <span className="text-neutral-200">{currentVariant.color || 'Standard'}</span></div>
            {currentVariant.size && <div>Size: <span className="text-neutral-200">{currentVariant.size}</span></div>}
            {currentVariant.material && <div>Material: <span className="text-neutral-200">{currentVariant.material}</span></div>}
          </div>
        </div>

        {/* Rich Text Description Section */}
        <div className="border-t border-neutral-900 pt-4 space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-300">Description</h4>
          <p className="text-xs text-neutral-300 leading-relaxed font-light whitespace-pre-line border-l-2 border-rose-500 pl-3 py-1">
            {currentVariant.rich_text_description || currentVariant.description || 'Authentic Divoom product engineered for high performance audio, programmable pixel graphics, and unique desk aesthetic.'}
          </p>
        </div>
      </div>
    </div>
  );
}

// --- PRODUCT BOTTOM ACTION BAR ---
function ProductBottomActionBar({ family, selectedVariant, onAddToCart }) {
  const product = selectedVariant || family?.primary;
  const isInStock = product?.availability?.toLowerCase() === 'in stock' && getActivePrice(product) !== null;
  const activePrice = getActivePrice(product);

  return (
    <div className="shrink-0 bg-neutral-900 border-t border-neutral-800/80 px-4 py-3 flex items-center justify-between z-30 shadow-lg">
      <div className="flex flex-col">
        <span className="text-[10px] uppercase tracking-wider text-neutral-400">Total Price</span>
        <span className="text-sm font-bold text-rose-400">{formatIDR(activePrice ?? 0)}</span>
      </div>
      <button
        onClick={() => onAddToCart(product, 1)}
        disabled={!isInStock}
        className={`font-semibold text-xs tracking-widest uppercase py-3 px-6 rounded-lg shadow-lg flex items-center justify-center space-x-2 transition-all ${
          isInStock
            ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-950 active:scale-[0.99]'
            : 'bg-neutral-800 text-neutral-500 cursor-not-allowed border border-neutral-800'
        }`}
      >
        <ShoppingBag className="w-4 h-4" />
        <span>{isInStock ? 'Add to Bag' : 'Out of Stock'}</span>
      </button>
    </div>
  );
}

// --- CART BOTTOM ACTION BAR ---
function CartBottomActionBar({ subtotal, cartLength }) {
  const [checkoutNotice, setCheckoutNotice] = useState(false);

  return (
    <div className="shrink-0 bg-neutral-900 border-t border-neutral-800/80 px-4 py-3 flex flex-col space-y-2 z-30 shadow-lg">
      {checkoutNotice && (
        <div className="p-2 bg-amber-950/40 border border-amber-800/60 rounded-lg text-[10px] text-amber-300 flex items-center space-x-1.5">
          <Info className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>Checkout is disabled in this frontend demonstration environment.</span>
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-wider text-neutral-400">Subtotal ({cartLength} items)</span>
          <span className="text-sm font-bold text-rose-400">{formatIDR(subtotal)}</span>
        </div>
        <button
          onClick={() => setCheckoutNotice(true)}
          disabled={cartLength === 0}
          className={`font-semibold text-xs tracking-widest uppercase py-3 px-6 rounded-lg shadow-lg flex items-center space-x-2 transition-all ${
            cartLength > 0
              ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-950 active:scale-[0.99]'
              : 'bg-neutral-800 text-neutral-500 cursor-not-allowed border border-neutral-800'
          }`}
        >
          <span>Checkout</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// --- 4. CART PAGE ---
function CartPage({ cart, onUpdateQuantity, onRemoveItem, subtotal, onExplore }) {
  return (
    <div className="p-4 min-h-full flex flex-col justify-between pb-6">
      <div className="space-y-4">
        <h2 className="text-sm font-bold text-white tracking-wider uppercase border-b border-neutral-800 pb-3 flex items-center justify-between">
          <span>Shopping Bag ({cart.length})</span>
          <span className="text-xs text-rose-400 font-mono font-normal">Divoom Direct</span>
        </h2>

        {cart.length === 0 ? (
          <div className="text-center py-16 space-y-4">
            <ShoppingBag className="w-12 h-12 mx-auto text-neutral-600 stroke-[1.2]" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-neutral-300">Your shopping bag is empty</p>
              <p className="text-xs text-neutral-500">Explore Divoom speaker catalog and pixel gadgets.</p>
            </div>
            <button
              onClick={onExplore}
              className="mt-2 px-6 py-3 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold uppercase tracking-widest rounded-lg shadow-md"
            >
              Browse Catalog
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {cart.map((item, index) => {
              const activePrice = (typeof item.product.sale_price === 'number' && item.product.sale_price > 0)
                ? item.product.sale_price
                : item.product.price;

              return (
                <div 
                  key={`${item.product.id}-${index}`}
                  className="flex space-x-3 bg-neutral-900 p-3 rounded-xl border border-neutral-800 shadow-sm"
                >
                  <img 
                    src={item.product.image_link} 
                    alt={item.product.title}
                    className="w-20 h-20 object-cover rounded-lg bg-neutral-950 shrink-0 border border-neutral-800" 
                    onError={(e) => {
                      e.currentTarget.src = 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&q=80&w=800';
                    }}
                  />
                  <div className="flex-1 flex flex-col justify-between min-w-0">
                    <div>
                      <div className="flex justify-between items-start">
                        <h4 className="text-xs font-semibold text-white truncate pr-2">{item.product.title}</h4>
                        <button 
                          onClick={() => onRemoveItem(index)}
                          className="text-neutral-500 hover:text-rose-400 p-0.5"
                          aria-label="Remove item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <p className="text-[10px] text-neutral-400 mt-0.5">
                        Color: {item.product.color || 'Standard'} | ID: {item.product.id}
                      </p>
                    </div>

                    <div className="flex justify-between items-center pt-2">
                      <span className="text-xs font-bold text-rose-400">
                        {formatIDR(activePrice * item.quantity)}
                      </span>
                      <div className="flex items-center border border-neutral-800 rounded-md bg-neutral-950">
                        <button 
                          onClick={() => onUpdateQuantity(index, -1)}
                          disabled={item.quantity <= 1}
                          className="p-1 text-neutral-400 hover:text-white disabled:opacity-30"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="text-xs font-semibold px-2 text-white">{item.quantity}</span>
                        <button 
                          onClick={() => onUpdateQuantity(index, 1)}
                          className="p-1 text-neutral-400 hover:text-white"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {cart.length > 0 && (
        <div className="border-t border-neutral-800 pt-4 mt-6 space-y-3">
          <div className="space-y-1.5 text-xs text-neutral-400 bg-neutral-900 p-3 rounded-xl border border-neutral-800">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span className="font-semibold text-neutral-200">{formatIDR(subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span>Estimated Shipping</span>
              <span className="font-semibold text-emerald-400">Calculated at Checkout</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- 5. PROFILE PAGE ---
function ProfilePage({ wishlistCount, cartCount, onNavigate }) {
  const profileMenu = [
    { icon: Package, label: 'Order History', badge: 'Guest Session' },
    { icon: Heart, label: 'Saved Wishlist', badge: `${wishlistCount} Saved` },
    { icon: MapPin, label: 'Shipping Addresses', badge: 'Not Set' },
    { icon: CreditCard, label: 'Saved Payment Methods' },
    { icon: Settings, label: 'App Settings & Preferences' },
    { icon: HelpCircle, label: 'Divoom Customer Support' }
  ];

  return (
    <div className="p-4 space-y-5">
      {/* User Info Presentation */}
      <div className="flex items-center space-x-3.5 bg-neutral-900 p-4 rounded-xl border border-neutral-800 shadow-sm">
        <div className="w-12 h-12 rounded-full bg-rose-600 text-white font-bold text-lg flex items-center justify-center border-2 border-rose-400">
          G
        </div>
        <div>
          <h3 className="font-bold text-white text-sm">Divoom Store Guest</h3>
          <p className="text-xs text-neutral-400">Browsing Official Divoom Catalog</p>
          <span className="inline-block mt-1 px-2 py-0.5 bg-neutral-800 text-neutral-300 text-[10px] font-mono rounded">
            Frontend Client Session
          </span>
        </div>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-2 gap-3 text-center">
        <div 
          onClick={() => onNavigate('cart')}
          className="bg-neutral-900 p-3 rounded-xl border border-neutral-800 cursor-pointer hover:border-neutral-700"
        >
          <span className="block text-lg font-bold text-white">{cartCount}</span>
          <span className="text-[10px] text-neutral-400 uppercase font-medium">Items In Bag</span>
        </div>
        <div className="bg-neutral-900 p-3 rounded-xl border border-neutral-800">
          <span className="block text-lg font-bold text-white">{wishlistCount}</span>
          <span className="text-[10px] text-neutral-400 uppercase font-medium">Wishlist Saved</span>
        </div>
      </div>

      {/* Menu Options */}
      <div className="bg-neutral-900 rounded-xl border border-neutral-800 divide-y divide-neutral-800 overflow-hidden">
        {profileMenu.map((item, index) => {
          const Icon = item.icon;
          return (
            <button
              key={index}
              className="w-full px-4 py-3.5 flex items-center justify-between text-xs text-neutral-300 hover:bg-neutral-850 transition-colors"
            >
              <div className="flex items-center space-x-3">
                <Icon className="w-4 h-4 text-neutral-400" />
                <span className="font-medium text-neutral-200">{item.label}</span>
              </div>
              <div className="flex items-center space-x-2">
                {item.badge && (
                  <span className="text-[10px] bg-neutral-800 text-neutral-400 px-2 py-0.5 rounded font-mono">
                    {item.badge}
                  </span>
                )}
                <ChevronRight className="w-4 h-4 text-neutral-500" />
              </div>
            </button>
          );
        })}
      </div>

      {/* Guest Note */}
      <div className="p-3 bg-neutral-900 border border-neutral-800 rounded-lg text-center text-[11px] text-neutral-500">
        Authentication & user account backend flows are unattached in this customer storefront demo.
      </div>
    </div>
  );
}

// --- 6. LIVECHAT PAGE ---
function LivechatPage({ messages, onSendMessage }) {
  const [inputText, setInputText] = useState('');

  const handleSend = (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText);
    setInputText('');
  };

  return (
    <div className="flex flex-col h-full bg-neutral-950">
      {/* Livechat Header Info */}
      <div className="bg-neutral-900 px-4 py-3 border-b border-neutral-800 flex items-center space-x-3 shrink-0">
        <div className="relative">
          <div className="w-8 h-8 rounded-full bg-rose-600 text-white font-bold flex items-center justify-center text-xs">
            DS
          </div>
          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-neutral-900 rounded-full"></span>
        </div>
        <div>
          <h4 className="text-xs font-bold text-white">Divoom Product Specialist</h4>
          <p className="text-[10px] text-neutral-400">Local Frontend Chat Demonstration</p>
        </div>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 p-4 overflow-y-auto space-y-3">
        {messages.map((msg) => {
          const isUser = msg.sender === 'user';
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[85%] p-3 rounded-2xl text-xs leading-relaxed ${
                  isUser
                    ? 'bg-rose-600 text-white rounded-br-none shadow-sm'
                    : 'bg-neutral-900 text-neutral-200 border border-neutral-800 rounded-bl-none'
                }`}
              >
                {msg.text}
              </div>
              <span className="text-[9px] text-neutral-500 mt-1 px-1 font-mono">{msg.time}</span>
            </div>
          );
        })}
      </div>

      {/* Chat Input Bar */}
      <form onSubmit={handleSend} className="p-3 bg-neutral-900 border-t border-neutral-800 flex items-center space-x-2 shrink-0">
        <input
          type="text"
          placeholder="Ask about Divoom speakers, LED app setup..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          className="flex-1 bg-neutral-950 border border-neutral-800 rounded-full px-4 py-2.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-rose-500"
        />
        <button
          type="submit"
          disabled={!inputText.trim()}
          className="p-2.5 bg-rose-600 text-white rounded-full hover:bg-rose-500 disabled:opacity-40 transition-colors shadow-md"
          aria-label="Send message"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}

// --- HELPER UI COMPONENTS ---

function ProductFamilyCard({ family, onSelect, isWishlisted, onToggleWishlist }) {
  const primary = family.primary;
  const activePrice = (typeof primary.sale_price === 'number' && primary.sale_price > 0)
    ? primary.sale_price
    : primary.price;
  const hasDiscount = typeof primary.sale_price === 'number' && primary.sale_price > 0;
  const isInStock = family.hasInStock;

  return (
    <div className="bg-neutral-900 rounded-xl border border-neutral-800 overflow-hidden shadow-sm flex flex-col justify-between group hover:border-neutral-700 transition-all">
      <div className="relative aspect-square bg-neutral-950 overflow-hidden cursor-pointer" onClick={onSelect}>
        <img 
          src={primary.image_link} 
          alt={primary.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          onError={(e) => {
            e.currentTarget.src = 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&q=80&w=800';
          }}
        />
        
        {/* Wishlist Button Overlay */}
        <button 
          onClick={(e) => {
            e.stopPropagation();
            onToggleWishlist();
          }}
          className="absolute top-2 right-2 p-1.5 bg-neutral-900/80 backdrop-blur-md rounded-full text-neutral-400 hover:text-rose-500 transition-colors"
          aria-label="Wishlist"
        >
          <Heart className={`w-3.5 h-3.5 ${isWishlisted ? 'fill-rose-500 text-rose-500' : ''}`} />
        </button>

        {hasDiscount && (
          <span className="absolute top-2 left-2 bg-rose-600 text-white text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded">
            Sale
          </span>
        )}

        {family.variants.length > 1 && (
          <span className="absolute bottom-2 left-2 bg-neutral-900/90 text-neutral-300 text-[9px] font-mono px-2 py-0.5 rounded border border-neutral-800">
            {family.variants.length} Colors
          </span>
        )}
      </div>

      <div className="p-3 flex flex-col justify-between flex-1">
        <div className="cursor-pointer" onClick={onSelect}>
          <p className="text-[9px] text-neutral-400 uppercase tracking-widest font-mono mb-0.5 truncate">
            {primary.product_type || 'Display'}
          </p>
          <h4 className="text-xs font-semibold text-white line-clamp-1 leading-snug">{primary.title}</h4>
        </div>

        <div className="mt-2.5 flex items-center justify-between pt-2 border-t border-neutral-800">
          <div>
            <span className="text-xs font-bold text-rose-400 block">{formatIDR(activePrice)}</span>
            {!isInStock && <span className="text-[9px] text-rose-500 font-semibold block">Out of stock</span>}
          </div>
          <button 
            onClick={onSelect}
            className="text-[10px] uppercase font-bold text-neutral-300 group-hover:text-rose-400"
          >
            Details
          </button>
        </div>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="py-12 flex flex-col items-center justify-center space-y-3 text-neutral-400">
      <RefreshCw className="w-6 h-6 animate-spin text-rose-500" />
      <span className="text-xs font-mono">Fetching Divoom catalog...</span>
    </div>
  );
}

function ErrorState({ message, onRetry }) {
  return (
    <div className="p-6 bg-neutral-900 rounded-xl border border-rose-900/60 text-center space-y-3 my-4">
      <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
      <div className="space-y-1">
        <h4 className="text-xs font-bold text-white uppercase tracking-wider">Failed to Load API Data</h4>
        <p className="text-[11px] text-neutral-400">{message}</p>
      </div>
      <button 
        onClick={onRetry}
        className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs rounded-lg font-semibold flex items-center space-x-1.5 mx-auto"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        <span>Retry Connection</span>
      </button>
    </div>
  );
}

function EmptyCatalogState() {
  return (
    <div className="p-8 text-center bg-neutral-900 rounded-xl border border-neutral-800">
      <Package className="w-8 h-8 text-neutral-500 mx-auto mb-2" />
      <p className="text-xs text-neutral-300 font-semibold">No products currently available in API.</p>
    </div>
  );
}
