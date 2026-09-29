import React from 'react';
import {
  X,
  Heart,
  ShoppingCart,
  Trash2,
  ArrowRight,
  Check,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';

export const WishlistDrawer: React.FC = () => {
  const {
    wishlist,
    products,
    categories,
    isWishlistOpen,
    setIsWishlistOpen,
    toggleWishlist,
    clearWishlist,
    addToCart,
    setQuickViewProduct,
  } = useStore();

  if (!isWishlistOpen) return null;

  const wishlistProducts = products.filter((p) => wishlist.includes(p.id));

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity duration-300"
        onClick={() => setIsWishlistOpen(false)}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white shadow-2xl flex flex-col">
          {/* Header */}
          <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-rose-100 flex items-center justify-center text-rose-600">
                <Heart className="w-4 h-4 fill-rose-500" />
              </div>
              <div>
                <h2 className="font-display font-bold text-base text-slate-800">
                  Saved Wishlist
                </h2>
                <p className="text-[11px] text-slate-500">
                  {wishlistProducts.length} {wishlistProducts.length === 1 ? 'item' : 'items'} saved for later
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {wishlistProducts.length > 0 && (
                <button
                  onClick={clearWishlist}
                  className="text-[11px] font-semibold text-slate-500 hover:text-rose-600 px-2 py-1 rounded hover:bg-slate-200 transition-colors"
                  title="Clear all saved items"
                >
                  Clear All
                </button>
              )}
              <button
                id="close-wishlist-drawer-btn"
                onClick={() => setIsWishlistOpen(false)}
                className="p-1.5 rounded-full hover:bg-slate-200 text-slate-500 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* List Content */}
          <div className="flex-1 overflow-y-auto p-5">
            {wishlistProducts.length === 0 ? (
              <div className="py-20 text-center space-y-4">
                <div className="w-20 h-20 rounded-full bg-rose-50 flex items-center justify-center mx-auto text-rose-300">
                  <Heart className="w-10 h-10" />
                </div>
                <h3 className="font-bold text-slate-800 text-base">Your Wishlist is Empty</h3>
                <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
                  Tap the heart icon on any product to save items you love and buy them whenever you're ready.
                </p>
                <button
                  onClick={() => setIsWishlistOpen(false)}
                  className="px-6 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-black transition-colors"
                >
                  Explore Collection
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {wishlistProducts.map((product) => {
                  const isOutOfStock = product.stock <= 0;
                  const cat = categories.find((c) => c.id === product.categoryId);
                  return (
                    <div key={product.id} className="py-4 flex gap-4 items-center group">
                      <div
                        onClick={() => {
                          setQuickViewProduct(product);
                          setIsWishlistOpen(false);
                        }}
                        className="w-18 h-18 rounded-xl bg-slate-100 overflow-hidden shrink-0 border border-slate-200 cursor-pointer"
                      >
                        <img
                          src={product.imageUrl}
                          alt={product.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      </div>

                      <div className="flex-1 min-w-0 space-y-1">
                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                          {cat ? cat.name : 'Product'}
                        </span>
                        <h4
                          onClick={() => {
                            setQuickViewProduct(product);
                            setIsWishlistOpen(false);
                          }}
                          className="font-bold text-slate-800 text-xs truncate cursor-pointer hover:text-rose-600 transition-colors"
                        >
                          {product.title}
                        </h4>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 text-xs">
                            ৳ {product.price.toLocaleString()} BDT
                          </span>
                          {product.originalPrice && product.originalPrice > product.price && (
                            <span className="text-[11px] text-slate-400 line-through">
                              ৳ {product.originalPrice.toLocaleString()}
                            </span>
                          )}
                        </div>

                        <div>
                          {isOutOfStock ? (
                            <span className="inline-block text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded">
                              Out of Stock
                            </span>
                          ) : (
                            <span className="inline-block text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                              In Stock ({product.stock} available)
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <button
                          onClick={() => toggleWishlist(product.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100 transition-colors"
                          title="Remove from wishlist"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>

                        <button
                          disabled={isOutOfStock}
                          onClick={() => {
                            addToCart(product, 1);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-black disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white text-[11px] font-bold flex items-center gap-1.5 shadow-xs transition-all active:scale-95"
                          title="Add to shopping cart"
                        >
                          <ShoppingCart className="w-3.5 h-3.5" />
                          <span>Add to Cart</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          {wishlistProducts.length > 0 && (
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <span className="text-xs text-slate-600">
                Total saved items: <strong className="text-slate-900">{wishlistProducts.length}</strong>
              </span>
              <button
                onClick={() => {
                  wishlistProducts.forEach((p) => {
                    if (p.stock > 0) addToCart(p, 1);
                  });
                }}
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
              >
                <span>Add All to Cart</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
