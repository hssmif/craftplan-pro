(function () {
  'use strict';

  var esc = (globalThis.EtsyUtils || {}).escapeCSV || function (v) {
    if (v == null) return '';
    var s = String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };

  /**
   * Convert listings object to CSV string
   */
  function listingsToCSV(listingsObj) {
    var headers = [
      'Listing ID', 'Title', 'Price', 'Reviews', 'Rating',
      'Shop', 'Bestseller', "Etsy's Pick", 'Classification',
      'Daily Views', 'Daily Sales', 'Weekly Sales',
      'Monthly Sales', 'Revenue', 'Demand Score', 'Opportunity Score',
      'Velocity Score', 'Outlier Class', 'Top Producer', 'Badges',
      'Favorites', 'Total Revenue', 'Conversion Rate', 'Listing Age (days)',
      'Monthly Trend', 'Date Published',
      'Views 24h', 'Views Source', 'Search Position', 'Confidence', 'Age Source',
      'Category', 'Tags', 'URL', 'First Seen', 'Last Seen'
    ];

    var rows = [headers.join(',')];
    var listings = typeof listingsObj === 'object' ? Object.values(listingsObj) : listingsObj;

    for (var i = 0; i < listings.length; i++) {
      var l = listings[i];
      var tags = l.tags;
      if (Array.isArray(tags)) tags = tags.join('; ');
      else if (typeof tags === 'string') {
        try { tags = JSON.parse(tags).join('; '); } catch (e) { /* keep */ }
      }

      var badges = Array.isArray(l.badges) ? l.badges.join('; ') : '';

      rows.push([
        esc(l.listing_id),
        esc(l.title),
        l.price || 0,
        l.reviews || 0,
        l.rating || '',
        esc(l.shop_name || ''),
        l.is_bestseller ? 'Yes' : 'No',
        l.is_etsy_pick ? 'Yes' : 'No',
        esc(l.classification || ''),
        l.daily_views || 0,
        l.daily_sales || 0,
        l.weekly_sales || 0,
        l.monthly_sales || 0,
        l.revenue_estimate || 0,
        l.demand_score || 0,
        l.opportunity_score || 0,
        l.velocity_score || 0,
        esc(l.outlier_class || ''),
        l.is_top_producer ? 'Yes' : 'No',
        esc(badges),
        l.favorites || 0,
        l.total_revenue || 0,
        l.conversion_rate != null ? l.conversion_rate : '',
        l.listing_age_days != null ? l.listing_age_days : '',
        esc(l.monthly_trend || ''),
        esc(l.date_published || ''),
        l.views_24h != null ? l.views_24h : '',
        esc(l.views_source || ''),
        l.search_position || '',
        esc(l.confidence || ''),
        esc(l.listing_age_source || ''),
        esc(l.category || ''),
        esc(tags || ''),
        esc(l.url || ''),
        esc(l.first_seen || ''),
        esc(l.last_seen || ''),
      ].join(','));
    }

    return rows.join('\n');
  }

  /**
   * Convert keywords object to CSV string
   */
  function keywordsToCSV(keywordsObj) {
    var headers = [
      'Keyword', 'Frequency', 'Avg Price', 'Demand Score',
      'Competition', 'Listings Count', 'Classification', 'Last Updated'
    ];

    var rows = [headers.join(',')];
    var keywords = typeof keywordsObj === 'object' ? Object.values(keywordsObj) : keywordsObj;

    for (var i = 0; i < keywords.length; i++) {
      var k = keywords[i];
      rows.push([
        esc(k.keyword),
        k.frequency || 0,
        k.avg_price || 0,
        k.demand_score || 0,
        esc(k.competition_level || ''),
        k.listings_count || 0,
        esc(k.classification || ''),
        esc(k.last_updated || ''),
      ].join(','));
    }

    return rows.join('\n');
  }

  globalThis.EtsyCSV = {
    listingsToCSV: listingsToCSV,
    keywordsToCSV: keywordsToCSV,
  };
})();
