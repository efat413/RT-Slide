import React, { useState } from 'react';
import { StoreProvider, useStore } from './context/StoreContext';
import { Header } from './components/Header';
import { HeroCarousel } from './components/HeroCarousel';
import { ProductCard } from './components/ProductCard';
import { CartDrawer } from './components/CartDrawer';
import { WishlistDrawer } from './components/WishlistDrawer';
import { QuickViewModal } from './components/QuickViewModal';
import { ProductVideoModal } from './components/ProductVideoModal';
import { OrderSuccessModal } from './components/OrderSuccessModal';
import { AuthModal } from './components/AuthModal';
import { UserAccountModal } from './components/UserAccountModal';
import { ToastNotification } from './components/ToastNotification';
import { Footer } from './components/Footer';
import { CategoryProductCarousel } from './components/CategoryProductCarousel';
import { CategoryListingView } from './components/CategoryListingView';

// Code-splitting: Lazy-load admin application and reset-password page
// Storefront visitors do NOT download heavy admin chunks during normal browsing
const AdminPanel = React.lazy(() =>
  import('./components/AdminPanel').then((m) => ({ default: m.AdminPanel }))
);
const ResetPasswordPage = React.lazy(() =>
  import('./components/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage }))
);

const AdminLoadingFallback: React.FC = () => (
  <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-4 selection:bg-rose-500 selection:text-white">
    <div className="text-center space-y-4">
      <div className="w-12 h-12 border-3 border-rose-500/20 border-t-rose-500 rounded-full animate-spin mx-auto" />
      <div className="text-sm font-semibold tracking-wide text-slate-300">Loading Admin Dashboard...</div>
      <div className="text-xs text-slate-500">Securing workspace session & permissions</div>
    </div>
  </div>
);

const PageLoadingFallback: React.FC = () => (
  <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
    <div className="w-10 h-10 border-3 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" />
  </div>
);
import { formatWhatsAppLink } from './utils/phone';
import { DEFAULT_SITE_NAME } from './utils/seo';
import {
  Sparkles,
  SlidersHorizontal,
  Phone,
  MessageCircle,
  Package,
  Tag,
  ChevronDown,
  ShoppingCart,
  Share2,
  RefreshCw,
} from 'lucide-react';

const StoreContent: React.FC = () => {
  const {
    products,
    categories,
    selectedCategory,
    setSelectedCategory,
    searchQuery,
    setSearchQuery,
    currentView,
    quickViewProduct,
    setQuickViewProduct,
    videoModalProduct,
    setVideoModalProduct,
    videoModalMode,
    recentSuccessOrder,
    setRecentSuccessOrder,
    settings,
    currentUser,
    isAdminLoggedIn,
    cartCount,
    cartSubtotal,
    setIsCartOpen,
    isUserAccountModalOpen,
    setIsUserAccountModalOpen,
    copyCategoryLink,
    isStoreInitializing,
    isStoreError,
    retryStoreInit,
    homepageCategoryProducts,
    categoryListingProducts,
    categoryPage,
    setCategoryPage,
    categoryTotalPages,
    categoryTotalProducts,
    isCategoryLoading,
    categorySortBy,
    setCategorySortBy,
  } = useStore();

  const [invalidNotice, setInvalidNotice] = useState<string | null>(null);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isStoreInitializing) return; // Wait until D1 store data is loaded
    const params = new URLSearchParams(window.location.search);
    let prod = params.get('product') || params.get('p');
    let cat = params.get('category') || params.get('cat');

    if (!prod && window.location.pathname.startsWith('/product/')) {
      prod = decodeURIComponent(window.location.pathname.replace(/^\/product\//, '').replace(/\/$/, '')).trim();
    }
    if (!cat && window.location.pathname.startsWith('/category/')) {
      cat = decodeURIComponent(window.location.pathname.replace(/^\/category\//, '').replace(/\/$/, '')).trim();
    }

    if (prod && products.length > 0) {
      const found = products.some(
        (p) => p.id === prod || p.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') === prod
      );
      if (!found) {
        setInvalidNotice(`The product "${prod}" was not found or has been removed.`);
        return;
      }
    }

    if (cat && categories.length > 0) {
      const found = categories.some((c) => c.slug.toLowerCase() === cat.toLowerCase() || c.id === cat);
      if (!found) {
        setInvalidNotice(`The category "${cat}" was not found.`);
        return;
      }
    }

    setInvalidNotice(null);
  }, [products, categories, isStoreInitializing]);

  if (currentView === 'reset-password' || (typeof window !== 'undefined' && window.location.pathname === '/reset-password')) {
    return (
      <>
        <React.Suspense fallback={<PageLoadingFallback />}>
          <ResetPasswordPage />
        </React.Suspense>
        <CartDrawer />
        <WishlistDrawer />
        <UserAccountModal
          isOpen={isUserAccountModalOpen}
          onClose={() => setIsUserAccountModalOpen(false)}
        />
        <AuthModal />
        <ToastNotification />
      </>
    );
  }

  if (currentView === 'admin') {
    return (
      <>
        <React.Suspense fallback={<AdminLoadingFallback />}>
          <AdminPanel />
        </React.Suspense>
        <UserAccountModal
          isOpen={isUserAccountModalOpen}
          onClose={() => setIsUserAccountModalOpen(false)}
        />
        <AuthModal />
        <ToastNotification />
      </>
    );
  }

  // 1. Clean Production Skeleton State: NEVER render demo products or preview content while loading D1
  if (isStoreInitializing) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-between selection:bg-rose-500 selection:text-white">
        <div>
          <Header />

          <main className="max-w-7xl mx-auto px-4 sm:px-6">
            {/* Hero Banner Skeleton */}
            <div
              className="relative w-full overflow-hidden rounded-2xl sm:rounded-3xl bg-slate-200 animate-pulse shadow-xs mt-4"
              style={{ aspectRatio: settings?.sliderAspectRatio || '1200 / 480', minHeight: '160px' }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 animate-pulse" />
              <div className="absolute bottom-6 left-6 sm:bottom-10 sm:left-10 space-y-3 z-10">
                <div className="h-4 sm:h-5 w-28 sm:w-36 rounded-full bg-slate-300 animate-pulse" />
                <div className="h-6 sm:h-9 w-48 sm:w-80 rounded-xl bg-slate-300 animate-pulse" />
                <div className="h-3.5 sm:h-4 w-36 sm:w-60 rounded-md bg-slate-300/70 animate-pulse" />
              </div>
            </div>

            {/* Product Feed Section Skeleton */}
            <section id="products-feed-section" className="pt-6 pb-12">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200/80 mb-6">
                <div className="space-y-2">
                  <div className="h-7 w-48 rounded-xl bg-slate-200 animate-pulse" />
                  <div className="h-3.5 w-64 rounded-md bg-slate-200/70 animate-pulse" />
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-8 w-32 rounded-xl bg-slate-200 animate-pulse" />
                  <div className="h-8 w-28 rounded-xl bg-slate-200 animate-pulse" />
                </div>
              </div>

              {/* Grid Skeletons */}
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
                {Array.from({ length: 8 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="bg-white rounded-2xl border border-slate-200/80 p-3 sm:p-4 space-y-3 shadow-xs overflow-hidden"
                  >
                    <div className="w-full aspect-square rounded-xl bg-slate-100 animate-pulse" />
                    <div className="h-3 w-16 rounded-full bg-slate-100 animate-pulse" />
                    <div className="h-4 w-4/5 rounded bg-slate-100 animate-pulse" />
                    <div className="h-4 w-24 rounded bg-slate-100 animate-pulse" />
                    <div className="h-8 w-full rounded-xl bg-slate-100 animate-pulse" />
                  </div>
                ))}
              </div>
            </section>
          </main>
        </div>

        <Footer />
        <CartDrawer />
        <WishlistDrawer />
        <AuthModal />
        <ToastNotification />
      </div>
    );
  }

  // 2. Production Database Error / Offline State: NEVER fallback to seed products
  if (isStoreError && products.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-between selection:bg-rose-500 selection:text-white">
        <div>
          <Header />

          <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-10 pb-16">
            <div className="max-w-md mx-auto py-16 px-6 text-center space-y-4 bg-white rounded-3xl border border-slate-200 shadow-sm">
              <div className="w-16 h-16 rounded-full bg-rose-50 flex items-center justify-center mx-auto text-rose-500">
                <Package className="w-8 h-8" />
              </div>
              <h2 className="font-display font-extrabold text-xl text-slate-800">Connection Error</h2>
              <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                We're currently having trouble loading the live product catalog. Please verify your internet connection and try again.
              </p>
              <button
                type="button"
                onClick={retryStoreInit}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md active:scale-95 transition-all cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Retry Loading Store</span>
              </button>
            </div>
          </main>
        </div>

        <Footer />
        <CartDrawer />
        <WishlistDrawer />
        <AuthModal />
        <ToastNotification />
      </div>
    );
  }

  const activeCategoryObj = categories.find((c) => c.id === selectedCategory);
  const supportWhatsAppNumber = settings.footer?.supportWhatsApp || settings.phone || '';
  const floatingWhatsAppHref = formatWhatsAppLink(
    supportWhatsAppNumber,
    `Hello ${settings.siteName || 'Rongdhonu Trade'}! I have an inquiry regarding your products.`
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between selection:bg-rose-500 selection:text-white">
      <div>
        <Header />

        <main className="max-w-7xl mx-auto px-4 sm:px-6">
          {/* Top Hero Banner Carousel (shown only on homepage when no search or category is active) */}
          {!searchQuery && !selectedCategory && <HeroCarousel />}

          {/* 404 Not Found Notification Banner */}
          {invalidNotice && (
            <div className="mt-4 mb-6 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-amber-100 text-amber-700 shrink-0">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-bold text-sm">404 - Item Not Found</p>
                  <p className="text-xs text-amber-700">{invalidNotice} Browse our active products below.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setInvalidNotice(null);
                  window.history.replaceState({}, '', '/');
                }}
                className="self-start sm:self-auto text-xs font-bold text-amber-850 hover:text-amber-950 px-3 py-1.5 rounded-xl bg-amber-200 hover:bg-amber-300 transition-colors cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* If viewing a specific category or searching, show separate CategoryListingView with server-side pagination */}
          {selectedCategory || searchQuery.trim() ? (
            <section id="products-feed-section">
              <CategoryListingView
                category={activeCategoryObj || null}
                categories={categories}
                searchQuery={searchQuery}
                products={categoryListingProducts}
                isLoading={isCategoryLoading}
                totalProducts={categoryTotalProducts}
                currentPage={categoryPage}
                totalPages={categoryTotalPages}
                limit={24}
                sortBy={categorySortBy}
                onPageChange={(page) => setCategoryPage(page)}
                onSortChange={(sort) => setCategorySortBy(sort)}
                onCategoryChange={(catId) => setSelectedCategory(catId)}
                onBackToHome={() => {
                  setSelectedCategory(null);
                  setSearchQuery('');
                  if (window.location.pathname !== '/' || window.location.search) {
                    window.history.pushState({}, '', '/');
                  }
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                onShareCategory={copyCategoryLink}
                siteName={settings?.siteName}
              />
            </section>
          ) : (
            /* Homepage: Lightweight category sections with recycling carousels */
            <section id="products-feed-section" className="pt-2 pb-12">
              <div className="space-y-2 sm:space-y-4">
                {categories.map((cat, idx) => {
                  const catProducts =
                    homepageCategoryProducts[cat.id] && homepageCategoryProducts[cat.id].length > 0
                      ? homepageCategoryProducts[cat.id]
                      : products.filter((p) => p.categoryId === cat.id).slice(0, 6);

                  if (!catProducts || catProducts.length === 0) return null;

                  return (
                    <CategoryProductCarousel
                      key={cat.id}
                      category={cat}
                      products={catProducts}
                      onViewAll={(category) => {
                        setSelectedCategory(category.id);
                        const categoryUrl = `/category/${category.slug || category.id}`;
                        window.history.pushState({}, '', categoryUrl);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      priorityFirst={idx === 0}
                    />
                  );
                })}
              </div>
            </section>
          )}
        </main>
      </div>

      {/* Floating Mobile Cart Option (accessible while browsing on mobile) */}
      {cartCount > 0 && (
        <button
          id="floating-mobile-cart-btn"
          onClick={() => setIsCartOpen(true)}
          className="sm:hidden fixed bottom-20 right-5 z-30 px-3.5 py-2.5 rounded-full bg-slate-900 hover:bg-black text-white shadow-2xl active:scale-95 transition-all flex items-center gap-2 border border-slate-700/80 font-bold text-xs animate-in slide-in-from-bottom-3 duration-200"
          aria-label={`Cart ৳ ${cartSubtotal.toLocaleString()}`}
        >
          <div className="relative" aria-hidden="true">
            <ShoppingCart className="w-4 h-4 text-rose-400" />
            <span className="absolute -top-1.5 -right-2 min-w-4 h-4 px-1 rounded-full bg-rose-600 text-white font-mono text-[9px] font-extrabold flex items-center justify-center shadow-xs">
              {cartCount}
            </span>
          </div>
          <span className="font-mono">Cart ৳ {cartSubtotal.toLocaleString()}</span>
        </button>
      )}

      {/* Floating WhatsApp Action Button */}
      {supportWhatsAppNumber && (
        <a
          id="floating-whatsapp-btn"
          href={floatingWhatsAppHref}
          target="_blank"
          rel="noopener noreferrer"
          className="fixed bottom-6 right-5 sm:right-6 z-30 p-3.5 rounded-full bg-emerald-500 text-white shadow-xl hover:bg-emerald-600 active:scale-95 transition-all duration-200 flex items-center justify-center group hover:pr-5 gap-2"
          aria-label="Chat on WhatsApp"
        >
          <MessageCircle className="w-6 h-6" aria-hidden="true" />
          <span className="max-w-0 overflow-hidden whitespace-nowrap group-hover:max-w-xs transition-all duration-300 text-xs font-bold">
            Chat on WhatsApp
          </span>
        </a>
      )}

      {/* Footer */}
      <Footer />

      {/* Interactive Global Modals & Drawers */}
      <CartDrawer />
      <WishlistDrawer />
      <UserAccountModal
        isOpen={isUserAccountModalOpen}
        onClose={() => setIsUserAccountModalOpen(false)}
      />
      <QuickViewModal
        product={quickViewProduct}
        onClose={() => setQuickViewProduct(null)}
      />
      <ProductVideoModal
        isOpen={Boolean(videoModalProduct)}
        onClose={() => setVideoModalProduct(null)}
        product={
          (videoModalProduct && products.find((p) => p.id === videoModalProduct.id)) ||
          videoModalProduct
        }
        initialMode={videoModalMode}
        onEnterFloatingMode={() => setQuickViewProduct(null)}
      />
      <OrderSuccessModal
        order={recentSuccessOrder}
        onClose={() => setRecentSuccessOrder(null)}
      />
      <AuthModal />
      <ToastNotification />
    </div>
  );
};

export default function App() {
  return (
    <StoreProvider>
      <StoreContent />
    </StoreProvider>
  );
}
