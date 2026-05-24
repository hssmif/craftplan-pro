(function () {
  'use strict';

  var STOPWORDS = (globalThis.EtsyConstants || {}).STOPWORDS || new Set();

  /**
   * Tokenize a title string into lowercase words
   */
  function tokenize(title) {
    if (!title) return [];
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .filter(function (t) { return t.length > 1; });
  }

  /**
   * Extract n-grams (unigrams, bigrams, trigrams) from token array
   * Filters stopwords from unigrams, requires at least one non-stop word in bi/trigrams
   */
  function extractNgrams(tokens, maxN) {
    maxN = maxN || 3;
    var ngrams = {};

    // Unigrams
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      if (!STOPWORDS.has(t)) {
        ngrams[t] = (ngrams[t] || 0) + 1;
      }
    }

    // Bigrams
    if (maxN >= 2) {
      for (var j = 0; j < tokens.length - 1; j++) {
        if (!STOPWORDS.has(tokens[j]) || !STOPWORDS.has(tokens[j + 1])) {
          var bi = tokens[j] + ' ' + tokens[j + 1];
          ngrams[bi] = (ngrams[bi] || 0) + 1;
        }
      }
    }

    // Trigrams
    if (maxN >= 3) {
      for (var k = 0; k < tokens.length - 2; k++) {
        if (!STOPWORDS.has(tokens[k]) && !STOPWORDS.has(tokens[k + 2])) {
          var tri = tokens[k] + ' ' + tokens[k + 1] + ' ' + tokens[k + 2];
          ngrams[tri] = (ngrams[tri] || 0) + 1;
        }
      }
    }

    return ngrams;
  }

  /**
   * Analyze keyword frequency across an array of listings
   * Returns sorted array: [{ keyword, frequency }, ...]
   */
  function analyzeKeywordFrequency(listings) {
    var globalFreq = {};

    for (var i = 0; i < listings.length; i++) {
      var listing = listings[i];

      // From title
      var tokens = tokenize(listing.title);
      var ngrams = extractNgrams(tokens);
      for (var key in ngrams) {
        globalFreq[key] = (globalFreq[key] || 0) + ngrams[key];
      }

      // From tags
      var tags = listing.tags;
      if (typeof tags === 'string') {
        try { tags = JSON.parse(tags); } catch (e) { tags = []; }
      }
      if (Array.isArray(tags)) {
        for (var t = 0; t < tags.length; t++) {
          var tag = tags[t].toLowerCase().trim();
          if (tag) globalFreq[tag] = (globalFreq[tag] || 0) + 1;
        }
      }
    }

    // Sort by frequency, filter noise
    return Object.keys(globalFreq)
      .filter(function (k) { return globalFreq[k] >= 2; })
      .sort(function (a, b) { return globalFreq[b] - globalFreq[a]; })
      .map(function (k) { return { keyword: k, frequency: globalFreq[k] }; });
  }

  /**
   * Cluster keywords by Jaccard word-overlap similarity (>=50%)
   */
  function clusterKeywords(keywords) {
    var clusters = [];
    var assigned = {};

    for (var i = 0; i < keywords.length; i++) {
      var kw = keywords[i];
      if (assigned[kw.keyword]) continue;

      var cluster = {
        id: kw.keyword,
        keywords: [kw],
        totalFrequency: kw.frequency,
      };

      var kwWords = kw.keyword.split(' ');
      var kwSet = {};
      for (var w = 0; w < kwWords.length; w++) kwSet[kwWords[w]] = true;

      for (var j = i + 1; j < keywords.length; j++) {
        var other = keywords[j];
        if (assigned[other.keyword]) continue;

        var otherWords = other.keyword.split(' ');
        var otherSet = {};
        for (var ow = 0; ow < otherWords.length; ow++) otherSet[otherWords[ow]] = true;

        // Jaccard similarity
        var intersection = 0, unionSet = Object.assign({}, kwSet);
        for (var ok in otherSet) {
          if (kwSet[ok]) intersection++;
          unionSet[ok] = true;
        }
        var unionSize = Object.keys(unionSet).length;
        var similarity = unionSize > 0 ? intersection / unionSize : 0;

        if (similarity >= 0.5) {
          cluster.keywords.push(other);
          cluster.totalFrequency += other.frequency;
          assigned[other.keyword] = true;
        }
      }

      assigned[kw.keyword] = true;
      clusters.push(cluster);
    }

    clusters.sort(function (a, b) { return b.totalFrequency - a.totalFrequency; });
    return clusters;
  }

  globalThis.EtsyKeywords = {
    tokenize: tokenize,
    extractNgrams: extractNgrams,
    analyzeKeywordFrequency: analyzeKeywordFrequency,
    clusterKeywords: clusterKeywords,
  };
})();
