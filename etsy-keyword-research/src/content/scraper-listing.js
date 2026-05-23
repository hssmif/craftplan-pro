(function () {
  'use strict';

  var SEL = ((globalThis.EtsyConstants || {}).SELECTORS || {}).listing || {};
  var trySelectors = (globalThis.EtsyUtils || {}).trySelectors;
  var extractPrice = (globalThis.EtsyUtils || {}).extractPrice;
  var extractNumber = (globalThis.EtsyUtils || {}).extractNumber;
  var extractListingIdFromUrl = (globalThis.EtsyUtils || {}).extractListingIdFromUrl;

  var DEBUG_AGE = false; // Set to true for development debugging

  /**
   * Scrape data from an individual Etsy listing page
   */
  function scrape() {
    var listingId = extractListingIdFromUrl(window.location.href);
    if (!listingId) return null;

    // Title
    var title = trySelectors(document, SEL.title || [], 'text');
    if (!title) {
      var h1 = document.querySelector('h1');
      if (h1) title = h1.textContent.trim();
    }
    if (!title) return null;

    // Price — try selectors, then meta tag
    var priceText = trySelectors(document, SEL.price || [], 'text');
    var price = extractPrice(priceText);
    if (price == null && SEL.priceMeta) {
      var priceMeta = document.querySelector(SEL.priceMeta);
      if (priceMeta) price = parseFloat(priceMeta.getAttribute('content'));
    }

    // Favorites — look for text near favorite button
    var favorites = 0;
    var favSelectors = SEL.favorites || [];
    for (var fi = 0; fi < favSelectors.length; fi++) {
      var favEl = document.querySelector(favSelectors[fi]);
      if (favEl) {
        favorites = extractNumber(favEl.textContent) || 0;
        if (favorites > 0) break;
      }
    }
    // Fallback: search for "X favorites" pattern in page
    if (favorites === 0) {
      var allText = document.body.innerText || '';
      var favMatch = allText.match(/([\d,]+)\s*favorite/i);
      if (favMatch) favorites = parseInt(favMatch[1].replace(/,/g, ''), 10) || 0;
    }

    // Reviews
    var reviewText = trySelectors(document, SEL.reviewCount || [], 'text') || '';
    var reviews = extractNumber(reviewText) || 0;

    // Rating
    var rating = 0;
    var ratingInput = document.querySelector('input[name="rating"]');
    if (ratingInput) rating = parseFloat(ratingInput.value) || 0;
    if (!rating) {
      // Try aria-label on review section
      var reviewSection = document.querySelector('[aria-label*="star"], [aria-label*="rating"]');
      if (reviewSection) {
        var rMatch = (reviewSection.getAttribute('aria-label') || '').match(/([\d.]+)/);
        if (rMatch) rating = parseFloat(rMatch[1]);
      }
    }

    // Category — from breadcrumbs
    var category = '';
    var breadcrumbSel = SEL.category || 'nav[aria-label*="Breadcrumb"] a';
    var breadcrumbs = document.querySelectorAll(breadcrumbSel);
    if (breadcrumbs.length > 0) {
      var parts = [];
      for (var bi = 0; bi < breadcrumbs.length; bi++) {
        var text = breadcrumbs[bi].textContent.trim();
        if (text && text !== 'Home') parts.push(text);
      }
      category = parts.join(' > ');
    }

    // Tags
    var tags = [];
    var tagSel = SEL.tags || 'a[href*="/search?q="]';
    var tagElements = document.querySelectorAll(tagSel);
    for (var ti = 0; ti < tagElements.length; ti++) {
      var tagText = tagElements[ti].textContent.trim().toLowerCase();
      if (tagText && tags.indexOf(tagText) === -1 && tagText.length < 50) {
        tags.push(tagText);
      }
    }
    // Limit to 13 (Etsy max)
    tags = tags.slice(0, 13);

    // Shop name
    var shopName = trySelectors(document, SEL.shopName || [], 'text') || '';

    // Image
    var imageUrl = trySelectors(document, SEL.image || [], 'src');
    if (!imageUrl && SEL.imageMeta) {
      var ogImage = document.querySelector(SEL.imageMeta);
      if (ogImage) imageUrl = ogImage.getAttribute('content');
    }

    // === DATE EXTRACTION ===
    // Collect ALL candidate dates from every source, then pick the EARLIEST.
    // This is critical because Etsy's "Listed on" shows the renewal date (not original creation),
    // so review dates may predate it and give a better minimum age estimate.
    // For accurate original creation date, the Etsy API is fetched by the service worker.
    var candidateDates = []; // { date: Date, source: string, iso: string }
    var ldJsonTags = [];
    var inlineScriptsScanned = 0;
    var reviewDatesFound = 0;

    function addCandidate(dateObj, source) {
      if (dateObj && !isNaN(dateObj.getTime()) && dateObj.getFullYear() >= 2005 && dateObj <= new Date()) {
        candidateDates.push({ date: dateObj, source: source, iso: dateObj.toISOString().slice(0, 10) });
      }
    }

    // Step A: JSON-LD structured data
    try {
      var ldScripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (var ldi = 0; ldi < ldScripts.length; ldi++) {
        var ldData = JSON.parse(ldScripts[ldi].textContent);
        var items = ldData['@graph'] ? ldData['@graph'] : [ldData];
        for (var ldj = 0; ldj < items.length; ldj++) {
          var item = items[ldj];
          if (item['@type'] === 'Product' || item['@type'] === 'IndividualProduct') {
            var ldDate = item.datePublished || item.dateCreated || item.uploadDate;
            if (ldDate) addCandidate(new Date(ldDate), 'json-ld');
            if (item.keywords) {
              var kw = item.keywords;
              if (typeof kw === 'string') kw = kw.split(',').map(function (s) { return s.trim().toLowerCase(); });
              if (Array.isArray(kw)) {
                for (var ldk = 0; ldk < kw.length; ldk++) {
                  var kt = String(kw[ldk]).trim().toLowerCase();
                  if (kt && ldJsonTags.indexOf(kt) === -1) ldJsonTags.push(kt);
                }
              }
            }
          }
        }
      }
    } catch (e) { /* ignore LD+JSON parse errors */ }

    // Step B: Etsy inline script data (creation timestamps)
    try {
      var inlineScripts = document.querySelectorAll('script:not([src]):not([type="application/ld+json"])');
      var tsFields = [
        'original_creation_tsz',
        'original_creation_timestamp',
        'created_timestamp',
        'creation_tsz',
      ];
      var dateFields = [
        'datePublished',
        'date_published',
        'created_date',
        'publish_date',
      ];

      for (var si = 0; si < inlineScripts.length; si++) {
        var scriptText = inlineScripts[si].textContent || '';
        if (scriptText.length < 50 || scriptText.length > 500000) continue;
        inlineScriptsScanned++;

        // Strategy 1: Unix timestamp fields
        for (var tfi = 0; tfi < tsFields.length; tfi++) {
          var tsRegex = new RegExp('"' + tsFields[tfi] + '"\\s*:\\s*(\\d{10,13})');
          var tsMatch = scriptText.match(tsRegex);
          if (tsMatch) {
            var tsVal = parseInt(tsMatch[1], 10);
            if (tsVal < 1e12) tsVal *= 1000;
            addCandidate(new Date(tsVal), 'internal-state');
          }
        }

        // Strategy 2: ISO date string fields
        for (var dfi = 0; dfi < dateFields.length; dfi++) {
          var dfRegex = new RegExp('"' + dateFields[dfi] + '"\\s*:\\s*"(\\d{4}-\\d{2}-\\d{2}[T\\s]?[^"]*)"');
          var dfMatch = scriptText.match(dfRegex);
          if (dfMatch) addCandidate(new Date(dfMatch[1]), 'internal-state');
        }
      }
    } catch (e) { /* ignore inline script errors */ }

    // Step C: "Listed on" / "Published on" text (NOTE: this is often the RENEWAL date, not original)
    try {
      var pageText = (document.body.innerText || '').slice(0, 15000);
      var datePatterns = [
        /[Ll]isted\s+on\s+([A-Z][a-z]+\s+\d{1,2},?\s+\d{4})/,
        /[Pp]ublished\s+on\s+([A-Z][a-z]+\s+\d{1,2},?\s+\d{4})/,
        /[Ll]isted\s+since\s+([A-Z][a-z]+\s+\d{1,2},?\s+\d{4})/,
        /[Oo]riginal\s+listing\s+date[:\s]+([A-Z][a-z]+\s+\d{1,2},?\s+\d{4})/,
        /[Ll]isted\s+on\s+(\d{1,2}\s+[A-Z][a-z]+\s+\d{4})/,
      ];
      for (var dpi = 0; dpi < datePatterns.length; dpi++) {
        var dpMatch = pageText.match(datePatterns[dpi]);
        if (dpMatch) {
          addCandidate(new Date(dpMatch[1]), 'page-text');
          break; // one match is enough from page text
        }
      }
    } catch (e) { /* ignore */ }

    // Step D: Review dates (ALWAYS check — reviews may predate the "Listed on" renewal date)
    try {
      var reviewDateEls = document.querySelectorAll(
        '[data-review-date], time[datetime], [class*="review"] [class*="date"], ' +
        '[data-reviews-pagination] ~ div time, ' +
        'div[id*="review"] time, div[id*="review"] span[class*="date"]'
      );
      for (var rdi = 0; rdi < reviewDateEls.length; rdi++) {
        var dtAttr = reviewDateEls[rdi].getAttribute('datetime') ||
                     reviewDateEls[rdi].getAttribute('data-review-date') ||
                     reviewDateEls[rdi].textContent.trim();
        var parsed = new Date(dtAttr);
        if (!isNaN(parsed.getTime()) && parsed.getFullYear() >= 2005 && parsed <= new Date()) {
          reviewDatesFound++;
          addCandidate(parsed, 'review-approx');
        }
      }
      // Also try regex on visible review section text
      var reviewSection = document.querySelector('#reviews, [data-region="reviews"], div[class*="reviews"]');
      if (reviewSection) {
        var revText = reviewSection.innerText || '';
        var revDates = revText.match(/([A-Z][a-z]{2,8}\s+\d{1,2},?\s+\d{4})/g) || [];
        for (var rvi = 0; rvi < revDates.length; rvi++) {
          var rvParsed = new Date(revDates[rvi]);
          if (!isNaN(rvParsed.getTime()) && rvParsed.getFullYear() >= 2005 && rvParsed <= new Date()) {
            reviewDatesFound++;
            addCandidate(rvParsed, 'review-approx');
          }
        }
      }
    } catch (e) { /* ignore review date parse errors */ }

    // Pick the EARLIEST date across all sources (oldest = most accurate minimum age)
    var datePublished = null;
    var listingAgeSource = null;
    if (candidateDates.length > 0) {
      candidateDates.sort(function (a, b) { return a.date - b.date; });
      var best = candidateDates[0];
      datePublished = best.iso;
      listingAgeSource = best.source;
      // Prefer high-confidence sources at the same date
      // Priority: json-ld > internal-state > api > page-text > review-approx
      var sourcePriority = { 'json-ld': 0, 'internal-state': 1, 'api': 2, 'wayback': 3, 'page-text': 4, 'review-approx': 5 };
      for (var ci = 1; ci < candidateDates.length; ci++) {
        // If another source has a date within 1 day of the earliest and has higher priority, prefer it
        if (Math.abs(candidateDates[ci].date - best.date) < 86400000) {
          if ((sourcePriority[candidateDates[ci].source] || 9) < (sourcePriority[listingAgeSource] || 9)) {
            listingAgeSource = candidateDates[ci].source;
          }
        }
      }
    }

    // Debug logging (enable DEBUG_AGE at top of file)
    if (DEBUG_AGE) {
      console.log('[ListingView AGE DEBUG]', {
        listingId: listingId,
        datePublished: datePublished,
        listingAgeSource: listingAgeSource,
        candidatesCount: candidateDates.length,
        candidates: candidateDates.map(function (c) { return c.iso + ' (' + c.source + ')'; }),
        inlineScriptsScanned: inlineScriptsScanned,
        reviewDatesFound: reviewDatesFound,
      });
    }

    // Merge LD+JSON tags with DOM tags (deduplicated)
    for (var mti = 0; mti < ldJsonTags.length; mti++) {
      if (tags.indexOf(ldJsonTags[mti]) === -1) tags.push(ldJsonTags[mti]);
    }
    tags = tags.slice(0, 13);

    // === DESCRIPTION EXTRACTION ===
    var descriptionRaw = '';
    var descSels = SEL.description || [
      'div[data-id="description-text"]',
      '#wt-content-toggle-product-details-content',
      'p[class*="description"]',
      'div[class*="listing-page-description"]',
    ];
    for (var dsi = 0; dsi < descSels.length; dsi++) {
      var descEl = document.querySelector(descSels[dsi]);
      if (descEl) {
        descriptionRaw = (descEl.innerText || descEl.textContent || '').trim();
        if (descriptionRaw.length > 20) break;
      }
    }
    // Fallback: try the product details toggle content
    if (descriptionRaw.length < 20) {
      var detailToggles = document.querySelectorAll('[data-wt-content-toggle]');
      for (var dti = 0; dti < detailToggles.length; dti++) {
        var dtText = (detailToggles[dti].innerText || '').trim();
        if (dtText.length > 50 && dtText.length > descriptionRaw.length) {
          descriptionRaw = dtText;
          break;
        }
      }
    }

    // Parse description into structured sections
    var descriptionSections = null;
    var descriptionQualityScore = 0;
    if (globalThis.EtsyDescriptionParser && descriptionRaw.length > 20) {
      descriptionSections = globalThis.EtsyDescriptionParser.parse(descriptionRaw);
      descriptionQualityScore = globalThis.EtsyDescriptionParser.computeDescriptionQuality(descriptionSections);
    }

    // === IMAGE & VIDEO SIGNALS ===
    var imageUrls = [];
    var imageCount = 0;
    // Carousel images
    var carouselImgs = document.querySelectorAll(
      'ul[class*="carousel"] img, div[class*="image-carousel"] img, ' +
      'div[class*="listing-page-image"] img, img[data-listing-page-image], ' +
      'ul[class*="listing-image"] img, div[class*="carousel-pane"] img'
    );
    var seenUrls = {};
    for (var imi = 0; imi < carouselImgs.length; imi++) {
      var imgSrc = carouselImgs[imi].src || carouselImgs[imi].getAttribute('data-src') || '';
      // Normalize — remove size suffix to deduplicate
      var normalizedSrc = imgSrc.replace(/\?.*$/, '').replace(/_\d+x\d+/, '');
      if (normalizedSrc && !seenUrls[normalizedSrc] && /^https?:/.test(imgSrc)) {
        seenUrls[normalizedSrc] = true;
        imageCount++;
        if (imageUrls.length < 5) imageUrls.push(imgSrc);
      }
    }
    // Fallback: count thumbnail dots/indicators
    if (imageCount === 0) {
      var thumbEls = document.querySelectorAll(
        'ul[class*="carousel"] li, div[class*="thumbnail"] img, ' +
        'button[class*="carousel-pagination"], div[class*="carousel-indicator"]'
      );
      if (thumbEls.length > 0) imageCount = thumbEls.length;
    }
    // Min 1 if we have the main image
    if (imageCount === 0 && imageUrl) imageCount = 1;

    // Video detection
    var hasVideo = false;
    var videoEls = document.querySelectorAll(
      'video, div[class*="video"] video, [data-video-id], ' +
      'div[class*="listing-video"], button[aria-label*="video"], ' +
      'div[class*="carousel"] video'
    );
    if (videoEls.length > 0) {
      hasVideo = true;
    } else {
      // Check for video indicator in carousel
      hasVideo = /\bvideo\b/i.test((document.querySelector('[class*="carousel"]') || {}).innerHTML || '');
    }

    // === DIGITAL FILE TYPES ===
    var digitalFileTypes = [];
    if (descriptionSections && descriptionSections.file_formats) {
      digitalFileTypes = descriptionSections.file_formats;
    }
    // Also check the "Digital download" section
    var digitalSection = document.querySelector('[data-id="digital-file-section"], div[class*="digital-file"]');
    if (digitalSection) {
      var dsText = digitalSection.innerText || '';
      var dsFormats = dsText.match(/\b(PDF|ZIP|PNG|SVG|JPEG|JPG|MP4|Notion|Canva|Excel)\b/gi);
      if (dsFormats) {
        for (var dfi = 0; dfi < dsFormats.length; dfi++) {
          var fmt = dsFormats[dfi].toUpperCase();
          if (digitalFileTypes.indexOf(fmt) === -1) digitalFileTypes.push(fmt);
        }
      }
    }

    // === STAR SELLER DETECTION ===
    var isStarSeller = false;
    var starSellerEls = document.querySelectorAll(
      '[class*="star-seller"], [class*="star_seller"], ' +
      '[aria-label*="Star Seller"], [data-appears-component-name*="star"]'
    );
    if (starSellerEls.length > 0) {
      isStarSeller = true;
    } else {
      isStarSeller = /\bstar\s*seller\b/i.test((document.body.innerText || '').slice(0, 8000));
    }

    // === SHOP URL ===
    var shopUrl = '';
    var shopLinks = document.querySelectorAll(
      'a[href*="/shop/"][class*="shop-name"], ' +
      'div[data-buy-box-region="seller"] a[href*="/shop/"], ' +
      'a[aria-label*="shop"][href*="/shop/"]'
    );
    for (var sli = 0; sli < shopLinks.length; sli++) {
      var href = shopLinks[sli].getAttribute('href') || '';
      if (href.indexOf('/shop/') !== -1) {
        shopUrl = href.indexOf('http') === 0 ? href : 'https://www.etsy.com' + href;
        break;
      }
    }

    // === ORIGINAL PRICE (for discount detection) ===
    var originalPrice = null;
    var origPriceEl = document.querySelector(
      '[data-buy-box-region="price"] [class*="strike"], ' +
      '[data-buy-box-region="price"] s, ' +
      '[data-buy-box-region="price"] del'
    );
    if (origPriceEl) {
      originalPrice = extractPrice(origPriceEl.textContent) || null;
    }

    // === REVIEW INTELLIGENCE (first 20 visible reviews) ===
    var reviewsData = [];
    try {
      var reviewContainers = document.querySelectorAll(
        '[data-reviews-pagination] > div, ' +
        'div[id*="review"] > div[class*="review"], ' +
        'div[class*="reviews-list"] > div, ' +
        'div[class*="review-card"], ' +
        'div[aria-label*="review"]'
      );
      for (var rci = 0; rci < reviewContainers.length && rci < 20; rci++) {
        var rc = reviewContainers[rci];
        var rText = '';
        var rRating = 0;
        var rHasPhoto = false;
        var rDate = '';
        var rResponse = false;

        // Review text
        var rTextEl = rc.querySelector('p[class*="review-text"], div[class*="review-text"], p[class*="content"]');
        if (rTextEl) rText = (rTextEl.textContent || '').trim().slice(0, 500);

        // Review rating
        var rRatingEl = rc.querySelector('input[name="rating"], [class*="stars"] input');
        if (rRatingEl) rRating = parseFloat(rRatingEl.value) || 0;
        if (!rRating) {
          var rStarEl = rc.querySelector('[aria-label*="star"]');
          if (rStarEl) {
            var rStarMatch = (rStarEl.getAttribute('aria-label') || '').match(/([\d.]+)/);
            if (rStarMatch) rRating = parseFloat(rStarMatch[1]);
          }
        }

        // Has photo
        rHasPhoto = rc.querySelectorAll('img[class*="review-image"], img[class*="review-photo"], img[alt*="review"]').length > 0;

        // Review date
        var rDateEl = rc.querySelector('time[datetime], [class*="date"]');
        if (rDateEl) {
          rDate = rDateEl.getAttribute('datetime') || rDateEl.textContent.trim();
        }

        // Seller response
        rResponse = rc.querySelector('[class*="response"], [class*="seller-reply"]') !== null;

        if (rText.length > 5 || rRating > 0) {
          reviewsData.push({
            rating: rRating,
            text: rText,
            has_photo: rHasPhoto,
            date: rDate,
            seller_response: rResponse,
          });
        }
      }
    } catch (e) { /* ignore review extraction errors */ }

    // Compute review signals
    var reviewSignals = null;
    if (reviewsData.length > 0) {
      var totalRating = 0;
      var photosCount = 0;
      var responseCount = 0;
      var sentimentKeywords = [];
      var mentionedFeatures = [];
      var mentionedComplaints = [];
      var giftMentions = 0;
      var repeatBuyer = 0;

      var posWords = ['easy', 'love', 'beautiful', 'amazing', 'perfect', 'great', 'wonderful', 'worth it', 'excellent', 'helpful', 'organized', 'useful', 'fantastic', 'recommend'];
      var negWords = ['confusing', 'difficult', 'hard', 'complicated', 'disappointed', 'wish', 'missing', 'broken', 'unclear', 'poor', 'slow', 'bug'];
      var featureWords = ['template', 'dashboard', 'tracker', 'planner', 'calendar', 'database', 'formula', 'view', 'layout', 'design', 'color', 'section', 'page', 'widget'];

      for (var rsi = 0; rsi < reviewsData.length; rsi++) {
        var rv = reviewsData[rsi];
        totalRating += rv.rating;
        if (rv.has_photo) photosCount++;
        if (rv.seller_response) responseCount++;

        var rvLower = rv.text.toLowerCase();
        for (var pw = 0; pw < posWords.length; pw++) {
          if (rvLower.indexOf(posWords[pw]) !== -1 && sentimentKeywords.indexOf(posWords[pw]) === -1) {
            sentimentKeywords.push(posWords[pw]);
          }
        }
        for (var nw = 0; nw < negWords.length; nw++) {
          if (rvLower.indexOf(negWords[nw]) !== -1 && mentionedComplaints.indexOf(negWords[nw]) === -1) {
            mentionedComplaints.push(negWords[nw]);
          }
        }
        for (var fw = 0; fw < featureWords.length; fw++) {
          if (rvLower.indexOf(featureWords[fw]) !== -1 && mentionedFeatures.indexOf(featureWords[fw]) === -1) {
            mentionedFeatures.push(featureWords[fw]);
          }
        }
        if (/\bgift\b/i.test(rvLower)) giftMentions++;
        if (/\b(bought\s+again|second\s+purchase|another\s+one|ordered\s+again|repeat)\b/i.test(rvLower)) repeatBuyer++;
      }

      var recentCutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
      var recentCount = 0;
      for (var rdi = 0; rdi < reviewsData.length; rdi++) {
        if (reviewsData[rdi].date) {
          var rd = new Date(reviewsData[rdi].date);
          if (!isNaN(rd.getTime()) && rd.getTime() > recentCutoff) recentCount++;
        }
      }

      reviewSignals = {
        count: reviewsData.length,
        avg_rating: Math.round((totalRating / reviewsData.length) * 10) / 10,
        total_with_photos: photosCount,
        sentiment_keywords: sentimentKeywords,
        mentioned_features: mentionedFeatures,
        mentioned_complaints: mentionedComplaints,
        repeat_buyer_mentions: repeatBuyer,
        gift_mentions: giftMentions,
        response_rate: Math.round((responseCount / reviewsData.length) * 100),
        recency_score: Math.round((recentCount / reviewsData.length) * 100),
      };
    }

    // === IMAGE QUALITY SCORE ===
    var imageQualityScore = 0;
    imageQualityScore += Math.min(50, Math.round((imageCount / 10) * 50));
    if (hasVideo) imageQualityScore += 30;
    if (imageCount >= 7) imageQualityScore += 20;
    imageQualityScore = Math.min(100, imageQualityScore);

    // === TRUST SCORE ===
    var trustScore = 0;
    if (isStarSeller) trustScore += 30;
    if (rating >= 4.8) trustScore += 20;
    if (reviews > 100) trustScore += 20;
    if (reviewSignals && reviewSignals.response_rate > 50) trustScore += 15;
    if (reviewSignals && reviewSignals.recency_score > 50) trustScore += 15;
    trustScore = Math.min(100, trustScore);

    // === FEATURE DENSITY ===
    var featureDensity = 0;
    if (descriptionSections) {
      featureDensity = (descriptionSections.features || []).length + (descriptionSections.whats_included || []).length;
    }

    // === MOAT SCORE ===
    var moatScore = 0;
    var custLevel = descriptionSections ? descriptionSections.customization_level : 'unknown';
    var custValue = custLevel === 'full' ? 100 : custLevel === 'partial' ? 60 : custLevel === 'unknown' ? 30 : 0;
    moatScore = Math.round(
      featureDensity * 3 * 0.3 +
      custValue * 0.3 +
      descriptionQualityScore * 0.4
    );
    moatScore = Math.min(100, moatScore);

    // Bestseller badge
    var isBestseller = /bestseller/i.test(document.body.innerText.slice(0, 5000) || '');

    // Views in last 24 hours
    var views24h = null;
    var viewsSelectors = SEL.views24h || [];
    for (var vi = 0; vi < viewsSelectors.length; vi++) {
      var viewEl = document.querySelector(viewsSelectors[vi]);
      if (viewEl) {
        var viewMatch = viewEl.textContent.match(/(\d[\d,]*)\+?\s*views?\s*(in\s*the\s*last\s*24\s*hours?|today)/i);
        if (viewMatch) {
          views24h = parseInt(viewMatch[1].replace(/,/g, ''), 10) || null;
          break;
        }
      }
    }
    // Fallback: regex scan of upper page text for views pattern
    if (views24h === null) {
      var upperText = (document.body.innerText || '').slice(0, 8000);
      var viewsFallback = upperText.match(/(\d[\d,]*)\+?\s*views?\s*(in\s*the\s*last\s*24\s*hours?|today)/i);
      if (viewsFallback) {
        views24h = parseInt(viewsFallback[1].replace(/,/g, ''), 10) || null;
      }
    }

    // Etsy's Pick badge
    var isEtsyPick = false;
    var etsyPickSels = SEL.etsyPick || [];
    for (var epi = 0; epi < etsyPickSels.length; epi++) {
      var epEl = document.querySelector(etsyPickSels[epi]);
      if (epEl && /etsy.?s?\s*pick/i.test(epEl.textContent)) {
        isEtsyPick = true;
        break;
      }
    }
    if (!isEtsyPick) {
      isEtsyPick = /etsy.?s?\s*pick/i.test((document.body.innerText || '').slice(0, 5000));
    }

    var listing = {
      listing_id: listingId,
      title: title,
      price: price || 0,
      original_price: originalPrice,
      favorites: favorites,
      reviews: reviews,
      rating: rating,
      shop_name: shopName.trim(),
      shop_url: shopUrl,
      url: window.location.href,
      image_url: imageUrl || '',
      image_count: imageCount,
      image_urls: imageUrls,
      has_video: hasVideo,
      is_bestseller: isBestseller,
      is_etsy_pick: isEtsyPick,
      is_star_seller: isStarSeller,
      tags: tags,
      category: category,
      date_published: datePublished || null,
      listing_age_source: listingAgeSource,
      views_24h: views24h,
      digital_file_types: digitalFileTypes,
      description_raw: descriptionRaw.slice(0, 5000), // cap at 5KB
      description_sections: descriptionSections,
      description_quality_score: descriptionQualityScore,
      image_quality_score: imageQualityScore,
      trust_score: trustScore,
      feature_density: featureDensity,
      moat_score: moatScore,
      review_signals: reviewSignals,
    };

    // Enrich
    if (globalThis.EtsyAnalysis) {
      globalThis.EtsyAnalysis.enrichListing(listing);
    }

    return listing;
  }

  globalThis.EtsyListingScraper = {
    scrape: scrape,
  };
})();
