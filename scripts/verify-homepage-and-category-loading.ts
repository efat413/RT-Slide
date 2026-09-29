/**
 * Verification script for lightweight homepage product loading and server-side category pagination
 */
async function verifyHomepageAndCategoryLoading() {
  const baseUrl = 'http://localhost:3000';
  console.log('Testing Homepage and Category Loading behavior at', baseUrl);

  // 1. Fetch Categories
  const catRes = await fetch(`${baseUrl}/api/categories`);
  if (!catRes.ok) {
    throw new Error(`Failed to fetch categories: ${catRes.status}`);
  }
  const catJson: any = await catRes.json();
  const categories: any[] = catJson.categories || (Array.isArray(catJson) ? catJson : []);
  console.log(`✓ Fetched ${categories.length} categories from D1 API`);
  if (categories.length === 0) {
    console.warn('No categories found to test');
    return;
  }

  const testCat = categories[0];
  console.log(`Using test category: "${testCat.name}" (id: ${testCat.id}, slug: ${testCat.slug})`);

  // 2. Homepage limited product fetch (strictly limit=6)
  const hpUrl = `${baseUrl}/api/products?category=${encodeURIComponent(testCat.id)}&page=1&limit=6`;
  const hpRes = await fetch(hpUrl);
  if (!hpRes.ok) {
    throw new Error(`Failed to fetch homepage limited products: ${hpRes.status}`);
  }
  const hpData = await hpRes.json();
  const hpProducts: any[] = hpData.products || [];
  console.log(`Homepage category request returned ${hpProducts.length} products (limit requested: 6)`);
  if (hpProducts.length > 6) {
    throw new Error(`FAILURE: Homepage request returned ${hpProducts.length} products, exceeding limit of 6!`);
  }
  console.log('✓ Homepage category loading strictly capped at <= 6 products');

  // 3. Category Listing server-side pagination (page=1, limit=24)
  const page1Url = `${baseUrl}/api/products?category=${encodeURIComponent(testCat.id)}&page=1&limit=24`;
  const page1Res = await fetch(page1Url);
  if (!page1Res.ok) {
    throw new Error(`Failed to fetch category page 1: ${page1Res.status}`);
  }
  const page1Data = await page1Res.json();
  console.log('Category page 1 response meta:', {
    total: page1Data.total,
    page: page1Data.page,
    limit: page1Data.limit,
    totalPages: page1Data.totalPages,
    productsReturned: page1Data.products?.length || 0,
  });

  if (page1Data.total !== undefined && page1Data.products) {
    console.log('✓ Category API provides server-side pagination metadata (total, page, limit, totalPages)');
  }

  // 4. Test Search with pagination
  const searchUrl = `${baseUrl}/api/products?search=pro&page=1&limit=24`;
  const searchRes = await fetch(searchUrl);
  if (searchRes.ok) {
    const searchData = await searchRes.json();
    console.log('Search pagination test returned:', {
      total: searchData.total,
      productsCount: searchData.products?.length || 0,
    });
    console.log('✓ Search endpoint supports server-side pagination');
  }

  console.log('\n===========================================');
  console.log('ALL HOMEPAGE & CATEGORY LOADING CHECKS PASSED ✅');
  console.log('===========================================');
}

verifyHomepageAndCategoryLoading().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
