(function () {
  'use strict';

  var CLS = (globalThis.EtsyConstants || {}).CLASSIFICATION || {};
  var OUTLIER = (globalThis.EtsyConstants || {}).OUTLIER_THRESHOLDS || { low: -1, mid_high: 1, high: 2 };
  var TOP_MIN = (globalThis.EtsyConstants || {}).TOP_PRODUCER_MIN || 3;
  var DAY_MS = 24 * 60 * 60 * 1000;

  // ===================== Per-listing metrics =====================

  /**
   * Demand score 0-100 for a single listing.
   * reviews * 0.4  +  bestseller bonus (20)  +  tier bonus (from price bracket)
   */
  function computeListingDemand(listing) {
    var base = Math.min((listing.reviews || 0) * 0.4, 60);
    var bsBonus = listing.is_bestseller ? 20 : 0;
    var price = listing.price || 0;
    var tierBonus = 0;
    if (price >= 50) tierBonus = 10;
    else if (price >= 20) tierBonus = 5;
    return Math.round(Math.min(base + bsBonus + tierBonus, 100));
  }

  /**
   * Step 1: Estimate daily views for a listing.
   * Uses views_24h if scraped, otherwise infers from multiple signals.
   */
  function estimateDailyViews(listing) {
    // If we have actual views data from the page, use it directly
    if (listing.views_24h != null && listing.views_24h > 0) {
      return listing.views_24h;
    }

    // Infer from signals
    var reviews = listing.reviews || 0;
    var base = reviews * 3; // avg listing gets ~3 views per review historically

    // Apply multipliers for engagement signals
    if (listing.is_bestseller) base *= 2.5;
    if ((listing.favorites || 0) > 100) base *= 1.5;
    if ((listing.search_position || 0) > 0 && listing.search_position <= 10) base *= 1.3;

    // Adjust for listing age to get a recent daily estimate
    var age = computeListingAge(listing);
    var ageMonths = Math.max(1, (age.days || 30) / 30);
    var dailyEstimate = base / ageMonths;

    // Floor: 5 views/day minimum for any active listing
    return Math.max(5, Math.round(dailyEstimate * 10) / 10);
  }

  /**
   * Step 2: Estimate conversion rate using tiered engagement bands.
   * Returns a PERCENTAGE (e.g. 2.5 for 2.5%), matching old function format.
   */
  function estimateConversionRate(listing) {
    var reviews = listing.reviews || 0;
    var favorites = listing.favorites || 0;
    var rating = listing.rating || 0;
    var dailyViews = listing.daily_views || estimateDailyViews(listing);
    var isBestseller = listing.is_bestseller;

    // Determine tier band [min, max] as percentages
    var bandMin, bandMax;

    var isViral = isBestseller && dailyViews >= 20 && favorites > 100;
    var isHighTrust = reviews > 50 || isBestseller;

    if (isViral) {
      bandMin = 3.5; bandMax = 6.0;
    } else if (isHighTrust) {
      bandMin = 1.8; bandMax = 3.5;
    } else if (reviews >= 5) {
      bandMin = 0.8; bandMax = 1.8;
    } else {
      bandMin = 0.3; bandMax = 0.8;
    }

    // Fine-tune position within band (0 = min, 1 = max)
    var bandRange = bandMax - bandMin;
    var position = 0.5; // start at midpoint

    if (reviews > 100) position = Math.min(1, position + 0.25);
    else if (reviews > 30) position = Math.min(1, position + 0.15);

    if (favorites > 200) position = Math.min(1, position + 0.1);

    var rate = bandMin + (bandRange * position);

    // Additive bonuses (outside band)
    if (rating >= 4.8) rate += 0.3;
    if (favorites > 200) rate += 0.2;

    // Clamp to reasonable bounds
    return Math.max(0.2, Math.min(8.0, Math.round(rate * 100) / 100));
  }

  /**
   * Step 3: Compute daily sales = daily_views * (conversion_rate / 100).
   * Minimum 0.1 for any active listing.
   */
  function estimateDailySales(listing) {
    var dailyViews = listing.daily_views || estimateDailyViews(listing);
    var convRate = listing.conversion_rate || estimateConversionRate(listing);
    // convRate is a percentage, so divide by 100
    var dailySales = dailyViews * (convRate / 100);
    return Math.max(0.1, Math.round(dailySales * 100) / 100);
  }

  /**
   * Step 4: Monthly sales from daily sales.
   * Apply new-listing smoothing if age < 30 days.
   */
  function estimateMonthlySales(listing) {
    var dailySales = listing.daily_sales || estimateDailySales(listing);
    var monthlySales = dailySales * 30;

    // Smoothing: if listing is < 30 days old, scale proportionally
    var age = computeListingAge(listing);
    if (age.days != null && age.days > 0 && age.days < 30) {
      monthlySales *= (age.days / 30);
    }

    return Math.round(monthlySales * 10) / 10;
  }

  /**
   * Step 4b: Weekly sales from daily sales.
   */
  function estimateWeeklySales(listing) {
    var dailySales = listing.daily_sales || estimateDailySales(listing);
    var weeklySales = dailySales * 7;

    var age = computeListingAge(listing);
    if (age.days != null && age.days > 0 && age.days < 7) {
      weeklySales *= (age.days / 7);
    }

    return Math.round(weeklySales * 10) / 10;
  }

  /**
   * Step 5a: Monthly revenue = monthly_sales * price.
   */
  function estimateRevenue(listing) {
    var monthlySales = listing.monthly_sales || estimateMonthlySales(listing);
    return Math.round(monthlySales * (listing.price || 0) * 100) / 100;
  }

  /**
   * Step 5b: Total (lifetime) revenue with aging decay.
   * Cap months_active at 24. Apply 0.8x for listings > 12 months old.
   */
  function estimateTotalRevenue(listing) {
    var monthlyRevenue = listing.revenue_estimate || estimateRevenue(listing);
    var age = computeListingAge(listing);
    var monthsActive = age.days != null ? Math.min(24, age.days / 30) : 6;
    monthsActive = Math.max(1, monthsActive);

    var agingFactor = 1.0;
    if (age.days != null && age.days > 365) agingFactor = 0.8;

    return Math.round(monthlyRevenue * monthsActive * agingFactor * 100) / 100;
  }

  /**
   * Compute listing age from date_published ONLY (never first_seen).
   * Returns { days, label, source } e.g. { days: 90, label: '3mo', source: 'json-ld' }.
   * source: 'json-ld' | 'internal-state' | 'page-text' | 'review-approx' | null
   * If date_published is null, returns N/A — do NOT guess from first_seen.
   */
  function computeListingAge(listing) {
    var dateStr = listing.date_published;
    var source = listing.listing_age_source || null;
    if (!dateStr) return { days: null, label: 'N/A', source: null };
    var created = new Date(dateStr).getTime();
    if (isNaN(created)) return { days: null, label: 'N/A', source: null };
    var days = Math.max(0, Math.round((Date.now() - created) / DAY_MS));
    var label;
    if (days < 30) label = days + 'd';
    else if (days < 365) label = Math.round(days / 30) + 'mo';
    else label = (days / 365).toFixed(1) + 'y';
    return { days: days, label: label, source: source };
  }

  /**
   * Step 6: Confidence score using views availability, age, and engagement signals.
   * High: views_24h present + known age + 2+ strong signals
   * Med: 2+ of (reviews>10, favorites>20, bestseller, views known, age known)
   * Low: missing age OR only 1 weak signal
   */
  function computeConfidence(listing) {
    var hasViews = listing.views_24h != null && listing.views_24h > 0;
    var hasAge = !!listing.date_published;
    var strongSignals = 0;

    // Views data is the strongest signal
    if (hasViews) strongSignals++;

    // Bestseller or high reviews
    if (listing.is_bestseller) strongSignals++;
    if ((listing.reviews || 0) > 50) strongSignals++;

    // Favorites
    if ((listing.favorites || 0) > 50) strongSignals++;

    // Known listing age from reliable source
    if (hasAge) strongSignals++;

    // If age is unknown, cap at medium confidence (we can't estimate accurately)
    if (!hasAge) {
      // Can still be medium if we have other strong signals
      var medCount = 0;
      if ((listing.reviews || 0) > 10) medCount++;
      if ((listing.favorites || 0) > 20) medCount++;
      if (listing.is_bestseller) medCount++;
      if (hasViews) medCount++;
      if (medCount >= 3) return 'med';
      return 'low';
    }

    // High confidence: views present + age known + 2+ more strong signals (total 4+)
    if (hasViews && hasAge && strongSignals >= 4) return 'high';

    // Medium: 2+ of (reviews > 10, favorites > 20, bestseller, views known, age known)
    var medCount2 = 0;
    if ((listing.reviews || 0) > 10) medCount2++;
    if ((listing.favorites || 0) > 20) medCount2++;
    if (listing.is_bestseller) medCount2++;
    if (hasViews) medCount2++;
    if (hasAge) medCount2++;
    if (medCount2 >= 2) return 'med';

    return 'low';
  }

  /**
   * Compute monthly trend from velocity score.
   * >5 → 'up', 1-5 → 'flat', <1 → 'down'.
   */
  function computeMonthlyTrend(listing) {
    var vel = listing.velocity_score || computeVelocityScore(listing);
    if (vel > 5) return 'up';
    if (vel >= 1) return 'flat';
    return 'down';
  }

  /**
   * Opportunity score: demand / log10(competition) * 10.
   */
  function computeOpportunityScore(demand, competition) {
    if (!competition || competition <= 1) return demand;
    return Math.round(demand / Math.log10(competition) * 10) / 10;
  }

  /**
   * Velocity score: how quickly a listing gains traction.
   * Higher for newer listings with higher reviews.
   */
  function computeVelocityScore(listing) {
    var firstSeen = listing.first_seen ? new Date(listing.first_seen).getTime() : Date.now();
    var ageDays = Math.max(1, (Date.now() - firstSeen) / DAY_MS);
    var reviewsPerDay = (listing.reviews || 0) / ageDays;
    return Math.round(Math.min(reviewsPerDay * 100, 100) * 10) / 10;
  }

  // ===================== Price outlier detection =====================

  function mean(arr) {
    if (!arr.length) return 0;
    var s = 0;
    for (var i = 0; i < arr.length; i++) s += arr[i];
    return s / arr.length;
  }

  function stddev(arr, avg) {
    if (arr.length < 2) return 0;
    var s = 0;
    for (var i = 0; i < arr.length; i++) s += (arr[i] - avg) * (arr[i] - avg);
    return Math.sqrt(s / (arr.length - 1));
  }

  /**
   * Classify a price as outlier_low / outlier_mid / outlier_high / outlier_extreme / null.
   */
  function computeOutlierClass(price, allPrices) {
    if (!allPrices || allPrices.length < 3) return null;
    var avg = mean(allPrices);
    var sd = stddev(allPrices, avg);
    if (sd === 0) return null;
    var z = (price - avg) / sd;
    if (z < OUTLIER.low) return 'outlier_low';
    if (z > OUTLIER.high) return 'outlier_extreme';
    if (z > OUTLIER.mid_high) return 'outlier_high';
    return null;
  }

  // ===================== Top producers =====================

  /**
   * Returns a Set of shop names that appear in 3+ listings.
   */
  function computeTopProducers(listings) {
    var counts = {};
    for (var i = 0; i < listings.length; i++) {
      var shop = (listings[i].shop_name || '').trim();
      if (shop) counts[shop] = (counts[shop] || 0) + 1;
    }
    var topSet = {};
    var keys = Object.keys(counts);
    for (var j = 0; j < keys.length; j++) {
      if (counts[keys[j]] >= TOP_MIN) topSet[keys[j]] = true;
    }
    return topSet;
  }

  // ===================== Classification (history-based) =====================

  /**
   * Classify a listing: 'evergreen', 'trending', or 'new'.
   */
  function classifyListing(listing, scans, timeWindow) {
    var windowDays = ((CLS.timeWindows || {})[timeWindow]) || 30;
    var nowMs = Date.now();
    var cutoff = nowMs - windowDays * DAY_MS;
    var longAgoCutoff = nowMs - (CLS.evergreenMinAgeDays || 30) * DAY_MS;

    var totalAppearances = 0;
    var recentAppearances = 0;
    var olderAppearances = 0;

    for (var i = 0; i < scans.length; i++) {
      var scan = scans[i];
      if (!scan.listing_ids) continue;
      var scanTime = new Date(scan.timestamp).getTime();
      if (scan.listing_ids.indexOf(listing.listing_id) !== -1) {
        totalAppearances++;
        if (scanTime >= cutoff) recentAppearances++;
        else olderAppearances++;
      }
    }

    var firstSeenTime = listing.first_seen ? new Date(listing.first_seen).getTime() : nowMs;

    // NEW: first appearance, less than newMaxAgeDays old
    if (totalAppearances <= 1 && (nowMs - firstSeenTime) < (CLS.newMaxAgeDays || 60) * DAY_MS) {
      return 'new';
    }

    // EVERGREEN: appeared in >= N scans OR first_seen > 30 days ago and still active
    if (totalAppearances >= (CLS.evergreenMinScans || 3)) return 'evergreen';
    if (firstSeenTime <= longAgoCutoff && recentAppearances > 0) return 'evergreen';

    // TRENDING: frequency spike or recently discovered
    if (olderAppearances > 0 && recentAppearances > 0) {
      var pct = ((recentAppearances - olderAppearances) / olderAppearances) * 100;
      if (pct >= (CLS.trendingFrequencyIncreasePercent || 50)) return 'trending';
    }
    if ((nowMs - firstSeenTime) <= (CLS.trendingRecentDays || 7) * DAY_MS && totalAppearances >= 2) {
      return 'trending';
    }

    return 'new';
  }

  /**
   * Classify a keyword: 'evergreen', 'trending', or 'new'.
   */
  function classifyKeyword(keyword, scans, timeWindow) {
    var windowDays = ((CLS.timeWindows || {})[timeWindow]) || 30;
    var nowMs = Date.now();
    var cutoff = nowMs - windowDays * DAY_MS;
    var longAgoCutoff = nowMs - (CLS.evergreenMinAgeDays || 30) * DAY_MS;
    var kwText = keyword.keyword;

    var totalAppearances = 0;
    var recentAppearances = 0;
    var olderAppearances = 0;

    for (var i = 0; i < scans.length; i++) {
      var scan = scans[i];
      if (!scan.keyword_strings) continue;
      var scanTime = new Date(scan.timestamp).getTime();
      if (scan.keyword_strings.indexOf(kwText) !== -1) {
        totalAppearances++;
        if (scanTime >= cutoff) recentAppearances++;
        else olderAppearances++;
      }
    }

    var firstSeenTime = keyword.first_seen ? new Date(keyword.first_seen).getTime() : nowMs;

    if (totalAppearances <= 1 && (nowMs - firstSeenTime) < (CLS.newMaxAgeDays || 60) * DAY_MS) return 'new';
    if (totalAppearances >= (CLS.evergreenMinScans || 3) ||
        (firstSeenTime <= longAgoCutoff && recentAppearances > 0)) return 'evergreen';
    if (olderAppearances > 0 && recentAppearances > 0) {
      var pct = ((recentAppearances - olderAppearances) / olderAppearances) * 100;
      if (pct >= (CLS.trendingFrequencyIncreasePercent || 50)) return 'trending';
    }
    if ((nowMs - firstSeenTime) <= (CLS.trendingRecentDays || 7) * DAY_MS && totalAppearances >= 2) {
      return 'trending';
    }
    return 'new';
  }

  /**
   * Count classifications from an array of items with .classification
   */
  function computeClassificationCounts(items) {
    var counts = { evergreen: 0, trending: 0, new: 0 };
    for (var i = 0; i < items.length; i++) {
      var cls = items[i].classification || 'new';
      if (counts[cls] != null) counts[cls]++;
    }
    return counts;
  }

  // ===================== Master enrichment =====================

  /**
   * Enrich a single listing with computed fields (lightweight, no history needed).
   */
  function enrichListing(listing) {
    listing.demand_score = computeListingDemand(listing);

    // New estimation pipeline (order matters — each step uses prior results)
    listing.daily_views = estimateDailyViews(listing);
    listing.views_source = (listing.views_24h != null && listing.views_24h > 0) ? 'actual' : 'estimated';
    listing.conversion_rate = estimateConversionRate(listing);
    listing.daily_sales = estimateDailySales(listing);
    listing.weekly_sales = estimateWeeklySales(listing);
    listing.monthly_sales = estimateMonthlySales(listing);
    listing.revenue_estimate = estimateRevenue(listing);
    listing.total_revenue = estimateTotalRevenue(listing);

    listing.velocity_score = computeVelocityScore(listing);
    var age = computeListingAge(listing);
    listing.listing_age_days = age.days;
    listing.listing_age_label = age.label;
    listing.listing_age_source = age.source;
    listing.monthly_trend = computeMonthlyTrend(listing);
    listing.confidence = computeConfidence(listing);
    listing.winner_score = computeWinnerScore(listing);
    listing.winner_tier = classifyWinner(listing);
    return listing;
  }

  /**
   * Master enrichment: classify + outlier + top-producer + all metrics.
   * Call after scraping, with scan history.
   */
  function enrichAllListings(listings, scans, timeWindow) {
    if (!listings || !listings.length) return listings;
    scans = scans || [];

    // Collect prices for outlier detection
    var prices = [];
    for (var p = 0; p < listings.length; p++) {
      if (listings[p].price > 0) prices.push(listings[p].price);
    }

    // Top producers
    var topProducers = computeTopProducers(listings);
    var competition = listings.length;

    for (var i = 0; i < listings.length; i++) {
      var l = listings[i];

      // New estimation pipeline (order matters)
      l.demand_score = computeListingDemand(l);
      l.daily_views = estimateDailyViews(l);
      l.views_source = (l.views_24h != null && l.views_24h > 0) ? 'actual' : 'estimated';
      l.conversion_rate = estimateConversionRate(l);
      l.daily_sales = estimateDailySales(l);
      l.weekly_sales = estimateWeeklySales(l);
      l.monthly_sales = estimateMonthlySales(l);
      l.revenue_estimate = estimateRevenue(l);
      l.total_revenue = estimateTotalRevenue(l);

      l.velocity_score = computeVelocityScore(l);
      l.opportunity_score = computeOpportunityScore(l.demand_score, competition);
      var age = computeListingAge(l);
      l.listing_age_days = age.days;
      l.listing_age_label = age.label;
      l.listing_age_source = age.source;
      l.monthly_trend = computeMonthlyTrend(l);
      l.confidence = computeConfidence(l);
      l.winner_score = computeWinnerScore(l);
      l.winner_tier = classifyWinner(l);

      // Classification from scan history
      l.classification = classifyListing(l, scans, timeWindow);

      // Outlier
      l.outlier_class = computeOutlierClass(l.price, prices);

      // Top producer
      l.is_top_producer = !!topProducers[(l.shop_name || '').trim()];

      // Build badges array
      l.badges = [];
      if (l.classification) l.badges.push(l.classification);
      if (l.is_bestseller) l.badges.push('bestseller');
      if (l.is_etsy_pick) l.badges.push('etsy_pick');
      if (l.is_top_producer) l.badges.push('top_producer');
      if (l.outlier_class) l.badges.push(l.outlier_class);
    }

    return listings;
  }

  // ===================== Aggregate stats =====================

  /**
   * Compute aggregate statistics for a set of enriched listings.
   */
  function computeAggregateStats(listings) {
    var stats = {
      total: listings.length,
      trending: 0,
      evergreen: 0,
      new_count: 0,
      bestseller: 0,
      etsy_pick: 0,
      top_producer: 0,
      outlier_low: 0,
      outlier_high: 0,
      outlier_extreme: 0,
      avg_price: 0,
      total_revenue: 0,
      avg_demand: 0,
      total_monthly_sales: 0,
      avg_conversion: null,
      total_lifetime_revenue: 0,
      avg_listing_age_days: null,
      total_favorites: 0,
      total_daily_sales: 0,
      total_weekly_sales: 0,
      total_daily_views: 0,
      views_known_count: 0,
    };

    if (!listings.length) return stats;

    var priceSum = 0, demandSum = 0, priceCount = 0;
    var convSum = 0, convCount = 0, ageSum = 0, ageCount = 0;

    for (var i = 0; i < listings.length; i++) {
      var l = listings[i];
      if (l.classification === 'trending') stats.trending++;
      else if (l.classification === 'evergreen') stats.evergreen++;
      else stats.new_count++;

      if (l.is_bestseller) stats.bestseller++;
      if (l.is_etsy_pick) stats.etsy_pick++;
      if (l.is_top_producer) stats.top_producer++;
      if (l.outlier_class === 'outlier_low') stats.outlier_low++;
      if (l.outlier_class === 'outlier_high') stats.outlier_high++;
      if (l.outlier_class === 'outlier_extreme') stats.outlier_extreme++;

      if (l.price > 0) { priceSum += l.price; priceCount++; }
      demandSum += l.demand_score || 0;
      stats.total_revenue += l.revenue_estimate || 0;
      stats.total_monthly_sales += l.monthly_sales || 0;
      stats.total_lifetime_revenue += l.total_revenue || 0;
      stats.total_favorites += l.favorites || 0;
      stats.total_daily_sales += l.daily_sales || 0;
      stats.total_weekly_sales += l.weekly_sales || 0;
      stats.total_daily_views += l.daily_views || 0;
      if (l.views_24h != null && l.views_24h > 0) stats.views_known_count++;
      if (l.conversion_rate != null) { convSum += l.conversion_rate; convCount++; }
      if (l.listing_age_days != null) { ageSum += l.listing_age_days; ageCount++; }
    }

    stats.avg_price = priceCount > 0 ? Math.round(priceSum / priceCount * 100) / 100 : 0;
    stats.avg_demand = Math.round(demandSum / listings.length);
    stats.total_revenue = Math.round(stats.total_revenue * 100) / 100;
    stats.total_lifetime_revenue = Math.round(stats.total_lifetime_revenue * 100) / 100;
    stats.avg_conversion = convCount > 0 ? Math.round(convSum / convCount * 100) / 100 : null;
    stats.avg_listing_age_days = ageCount > 0 ? Math.round(ageSum / ageCount) : null;
    stats.total_daily_sales = Math.round(stats.total_daily_sales * 10) / 10;
    stats.total_weekly_sales = Math.round(stats.total_weekly_sales * 10) / 10;
    stats.total_daily_views = Math.round(stats.total_daily_views);

    return stats;
  }

  /**
   * Compute keyword-level analytics from listings.
   */
  function computeKeywordStats(keyword, matchingListings) {
    var totalPrice = 0, totalFav = 0, count = 0;
    for (var i = 0; i < matchingListings.length; i++) {
      if (matchingListings[i].price > 0) {
        totalPrice += matchingListings[i].price;
        count++;
      }
      totalFav += matchingListings[i].favorites || 0;
    }
    return {
      keyword: keyword,
      avg_price: count > 0 ? Math.round(totalPrice / count * 100) / 100 : 0,
      avg_favorites: matchingListings.length > 0 ? Math.round(totalFav / matchingListings.length) : 0,
      demand_score: matchingListings.length > 0 ? computeListingDemand(matchingListings[0]) : 0,
      competition_level: matchingListings.length > 50 ? 'very high' : matchingListings.length > 30 ? 'high' : matchingListings.length > 10 ? 'medium' : 'low',
      listings_count: matchingListings.length,
    };
  }

  // ===================== Winner Ranking (BUY / MONITOR / SKIP) =====================

  /**
   * Composite winner score 0-100 for a single listing.
   * Weights:
   *   Revenue velocity  (30%) — reviews-per-month relative to age
   *   Revenue potential  (25%) — monthly_sales * price
   *   Trust signal       (20%) — rating, star seller, reviews count
   *   Novelty window     (15%) — sweet spot: 30-365 days old
   *   Confidence bonus   (10%) — data quality multiplier
   */
  function computeWinnerScore(listing) {
    var score = 0;
    var reviews = listing.reviews || 0;
    var price = listing.price || 0;

    // --- Social proof (35 pts) — reviews are the strongest signal ---
    var socialPts = 0;
    if (reviews >= 10000) socialPts = 35;
    else if (reviews >= 5000) socialPts = 32;
    else if (reviews >= 1000) socialPts = 28;
    else if (reviews >= 500) socialPts = 24;
    else if (reviews >= 100) socialPts = 18;
    else if (reviews >= 50) socialPts = 12;
    else if (reviews >= 20) socialPts = 8;
    else if (reviews >= 5) socialPts = 4;
    else socialPts = Math.min(3, reviews);
    score += socialPts;

    // --- Revenue signal (20 pts) — actual revenue OR estimated from reviews × price ---
    var monthlyRev = listing.revenue_estimate || 0;
    // If no revenue estimate, approximate from reviews (each review ≈ 10-20 sales)
    if (monthlyRev === 0 && reviews > 0 && price > 0) {
      var age = computeListingAge(listing);
      var ageDays = age.days != null ? Math.max(30, age.days) : 180;
      var estTotalSales = reviews * 15; // ~15 sales per review
      var estMonthlySales = (estTotalSales / ageDays) * 30;
      monthlyRev = estMonthlySales * price;
    }
    var revScore = 0;
    if (monthlyRev >= 500) revScore = 20;
    else if (monthlyRev >= 200) revScore = 16;
    else if (monthlyRev >= 100) revScore = 12;
    else if (monthlyRev >= 50) revScore = 8;
    else if (monthlyRev >= 20) revScore = 4;
    else revScore = Math.round(monthlyRev / 5);
    score += revScore;

    // --- Trust & badges (20 pts) ---
    var trustPts = 0;
    if ((listing.rating || 0) >= 4.8) trustPts += 6;
    else if ((listing.rating || 0) >= 4.5) trustPts += 4;
    else if ((listing.rating || 0) >= 4.0) trustPts += 2;
    if (listing.is_bestseller) trustPts += 6;
    if (listing.is_star_seller) trustPts += 4;
    if (listing.is_etsy_pick) trustPts += 3;
    if ((listing.favorites || 0) >= 500) trustPts += 3;
    else if ((listing.favorites || 0) >= 100) trustPts += 2;
    score += Math.min(20, trustPts);

    // --- Price viability (10 pts) — higher price = more revenue potential ---
    var pricePts = 0;
    if (price >= 30) pricePts = 10;
    else if (price >= 15) pricePts = 8;
    else if (price >= 8) pricePts = 6;
    else if (price >= 4) pricePts = 4;
    else if (price > 0) pricePts = 2;
    score += pricePts;

    // --- Novelty window (10 pts) ---
    var age2 = computeListingAge(listing);
    var noveltyPts = 0;
    if (age2.days == null) {
      noveltyPts = 5; // unknown age = neutral
    } else if (age2.days >= 30 && age2.days <= 365) {
      noveltyPts = 10; // sweet spot
    } else if (age2.days >= 14 && age2.days < 30) {
      noveltyPts = 7; // promising but early
    } else if (age2.days > 365 && age2.days <= 730) {
      noveltyPts = 6; // still viable
    } else if (age2.days > 730) {
      noveltyPts = 3; // old
    } else {
      noveltyPts = 2; // very new
    }
    score += noveltyPts;

    // --- Confidence bonus (5 pts) ---
    var confPts = 0;
    var conf = listing.confidence || 'low';
    if (conf === 'high') confPts = 5;
    else if (conf === 'med') confPts = 3;
    else confPts = 1;
    score += confPts;

    return Math.min(100, Math.max(0, score));
  }

  /**
   * Classify a listing as BUY / MONITOR / SKIP based on winner_score.
   * BUY:     score >= 55 AND (revenue >= $50/mo OR reviews >= 20)
   * MONITOR: score >= 30 OR (revenue >= $20/mo)
   * SKIP:    everything else
   */
  function classifyWinner(listing) {
    var ws = listing.winner_score || computeWinnerScore(listing);
    var rev = listing.revenue_estimate || 0;
    var reviews = listing.reviews || 0;

    // BUY: high score with social proof, OR strong review count alone
    if (ws >= 55 && reviews >= 10) return 'BUY';
    if (ws >= 45 && reviews >= 100 && listing.is_bestseller) return 'BUY';
    if (ws >= 40 && reviews >= 1000) return 'BUY';

    // MONITOR: moderate score or decent signals
    if (ws >= 25) return 'MONITOR';
    if (reviews >= 50) return 'MONITOR';
    if (rev >= 20) return 'MONITOR';

    return 'SKIP';
  }

  /**
   * Rank all listings by winner_score descending.
   * Returns sorted array with winner_rank (1-based) and winner_tier.
   */
  function rankListings(listings) {
    // Compute scores
    for (var i = 0; i < listings.length; i++) {
      listings[i].winner_score = computeWinnerScore(listings[i]);
      listings[i].winner_tier = classifyWinner(listings[i]);
    }

    // Sort by winner_score descending
    var sorted = listings.slice().sort(function (a, b) {
      return (b.winner_score || 0) - (a.winner_score || 0);
    });

    // Assign ranks
    for (var r = 0; r < sorted.length; r++) {
      sorted[r].winner_rank = r + 1;
    }

    // Write ranks back to original array
    var rankMap = {};
    for (var m = 0; m < sorted.length; m++) {
      rankMap[sorted[m].listing_id] = sorted[m].winner_rank;
    }
    for (var j = 0; j < listings.length; j++) {
      listings[j].winner_rank = rankMap[listings[j].listing_id] || 0;
    }

    return sorted;
  }

  /**
   * Get top N winners (BUY or MONITOR with high score).
   */
  function getTopWinners(listings, maxN) {
    maxN = maxN || 25;
    var ranked = rankListings(listings);
    var winners = [];
    for (var i = 0; i < ranked.length && winners.length < maxN; i++) {
      if (ranked[i].winner_tier === 'BUY' || ranked[i].winner_tier === 'MONITOR') {
        winners.push(ranked[i]);
      }
    }
    return winners;
  }

  globalThis.EtsyAnalysis = {
    computeListingDemand: computeListingDemand,
    estimateDailyViews: estimateDailyViews,
    estimateConversionRate: estimateConversionRate,
    estimateDailySales: estimateDailySales,
    estimateWeeklySales: estimateWeeklySales,
    estimateMonthlySales: estimateMonthlySales,
    estimateRevenue: estimateRevenue,
    estimateTotalRevenue: estimateTotalRevenue,
    computeListingAge: computeListingAge,
    computeMonthlyTrend: computeMonthlyTrend,
    computeConfidence: computeConfidence,
    computeOpportunityScore: computeOpportunityScore,
    computeVelocityScore: computeVelocityScore,
    computeOutlierClass: computeOutlierClass,
    computeTopProducers: computeTopProducers,
    classifyListing: classifyListing,
    classifyKeyword: classifyKeyword,
    computeClassificationCounts: computeClassificationCounts,
    enrichListing: enrichListing,
    enrichAllListings: enrichAllListings,
    computeAggregateStats: computeAggregateStats,
    computeKeywordStats: computeKeywordStats,
    computeWinnerScore: computeWinnerScore,
    classifyWinner: classifyWinner,
    rankListings: rankListings,
    getTopWinners: getTopWinners,
  };
})();
