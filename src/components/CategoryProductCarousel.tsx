import React, { useState, useEffect, useRef, useTransition } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { Category, Product } from '../types';
import { ProductCard } from './ProductCard';

interface CategoryProductCarouselProps {
  category: Category;
  products: Product[];
  onViewAll: (category: Category) => void;
  priorityFirst?: boolean;
}

const CategoryProductCarouselComponent: React.FC<CategoryProductCarouselProps> = ({
  category,
  products,
  onViewAll,
  priorityFirst = false,
}) => {
  const [startIndex, setStartIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true
  );

  // Mobile touch swipe handling
  const touchStartXRef = useRef<number | null>(null);
  const touchEndXRef = useRef<number | null>(null);

  // Responsive desktop detection (desktop shows 3, mobile shows 2)
  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const visibleCount = isDesktop ? 3 : 2;
  const totalItems = products.length;

  // Auto-slide every 4.5 seconds (cycles through already-loaded products, NO API requests)
  useEffect(() => {
    if (isPaused || totalItems <= visibleCount) return;

    const interval = setInterval(() => {
      setStartIndex((prev) => (prev + 1) % totalItems);
    }, 4500);

    return () => clearInterval(interval);
  }, [isPaused, totalItems, visibleCount]);

  if (!products || products.length === 0) {
    return null;
  }

  const handlePrev = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setStartIndex((prev) => (prev - 1 + totalItems) % totalItems);
  };

  const handleNext = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setStartIndex((prev) => (prev + 1) % totalItems);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setIsPaused(true);
    touchStartXRef.current = e.touches[0].clientX;
    touchEndXRef.current = null;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndXRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    setIsPaused(false);
    if (touchStartXRef.current !== null && touchEndXRef.current !== null) {
      const distance = touchStartXRef.current - touchEndXRef.current;
      if (distance > 45) {
        // Swiped left -> next
        handleNext();
      } else if (distance < -45) {
        // Swiped right -> prev
        handlePrev();
      }
    }
    touchStartXRef.current = null;
    touchEndXRef.current = null;
  };

  // Sliding window of visible products recycled from the limited dataset
  // For visibleCount items (e.g., 3 on desktop, 2 on mobile):
  const visibleProducts: Product[] = [];
  const countToDisplay = Math.min(visibleCount, totalItems);
  for (let i = 0; i < countToDisplay; i++) {
    const itemIndex = (startIndex + i) % totalItems;
    visibleProducts.push(products[itemIndex]);
  }

  const categoryUrl = `/category/${category.slug || category.id}`;

  return (
    <section
      className="py-6 sm:py-8 border-b border-slate-200/80 last:border-b-0"
      aria-label={`${category.name} collection carousel`}
    >
      {/* Category Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-4 sm:mb-5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display font-extrabold text-xl sm:text-2xl text-slate-900 tracking-tight flex items-center gap-2">
              <span>{category.name}</span>
            </h2>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
              {totalItems} items
            </span>
          </div>
          {category.description && (
            <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-xl line-clamp-1 sm:line-clamp-none">
              {category.description}
            </p>
          )}
        </div>

        {/* Action Controls: Previous / Next Chevrons + "View All →" Link */}
        <div className="flex items-center justify-between sm:justify-end gap-2.5 shrink-0">
          {/* Subtle manual carousel navigation arrows */}
          {totalItems > visibleCount && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handlePrev}
                aria-label={`Previous ${category.name} products`}
                className="p-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 transition-colors shadow-2xs active:scale-95 cursor-pointer"
                title="Previous products"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleNext}
                aria-label={`Next ${category.name} products`}
                className="p-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 transition-colors shadow-2xs active:scale-95 cursor-pointer"
                title="Next products"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Crawlable "View All →" Button Navigating to Separate Category Page */}
          <a
            href={categoryUrl}
            onClick={(e) => {
              if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
              e.preventDefault();
              onViewAll(category);
            }}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-3.5 py-1.5 rounded-xl border border-rose-200/80 transition-all cursor-pointer hover:shadow-2xs active:scale-95 group"
            title={`Browse full ${category.name} catalog with server-side pagination`}
          >
            <span>View All</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </a>
        </div>
      </div>

      {/* Carousel Container */}
      <div
        className="relative"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Products Grid: 3 on desktop, 2 on mobile */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 md:gap-5">
          {visibleProducts.map((product, idx) => (
            <div
              key={`${category.id}-${product.id}-${idx}`}
              className="transition-all duration-300 transform"
            >
              <ProductCard product={product} priority={priorityFirst && idx === 0} />
            </div>
          ))}
        </div>

        {/* Carousel Position Indicators (Dots) */}
        {totalItems > visibleCount && (
          <div className="flex items-center justify-center gap-1.5 mt-3 pt-1">
            {Array.from({ length: totalItems }).map((_, dotIdx) => (
              <button
                key={dotIdx}
                type="button"
                onClick={() => setStartIndex(dotIdx)}
                aria-label={`Go to slide ${dotIdx + 1} of ${category.name}`}
                className={`transition-all duration-200 rounded-full cursor-pointer ${
                  startIndex === dotIdx
                    ? 'w-5 h-1.5 bg-rose-500'
                    : 'w-1.5 h-1.5 bg-slate-300 hover:bg-slate-400'
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export const CategoryProductCarousel = React.memo(CategoryProductCarouselComponent);
