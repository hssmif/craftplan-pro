/**
 * Description Parser — Structural Feature Extraction from Etsy listing descriptions.
 * Parses raw description text into structured sections for product intelligence.
 */
(function () {
  'use strict';

  // --- Header detection patterns ---
  var HEADER_PATTERNS = [
    /^[A-Z][A-Z\s&]{3,40}$/,                         // ALL CAPS lines
    /^.{3,50}:$/,                                     // Lines ending with colon
    /^[\u2728\u2B50\u2764\u2705\u2714\u2716\u2022\u26A1\u2615\u2709\u274C\u27A1\u2B06\u2197\u2934\u25B6\u25CF\u25AA\uD83D].*$/,  // Emoji-prefixed lines
    /^#{1,3}\s+/,                                      // Markdown headers
    /^\*{1,3}[^*]+\*{1,3}$/,                          // Bold markdown
  ];

  // --- Section header keywords ---
  var INCLUDED_HEADERS = ['included', 'you get', "you'll receive", 'inside', "what's in", 'what you get', 'comes with', 'features', 'this template includes', 'template includes', 'you will receive', 'you will get', 'package includes'];
  var HOW_IT_WORKS_HEADERS = ['how it works', 'how to use', 'instructions', 'getting started', 'how to', 'steps', 'setup', 'installation'];
  var REQUIREMENTS_HEADERS = ["you'll need", 'you need', 'requirements', 'what you need', 'compatible with', 'works with'];
  var TARGET_HEADERS = ['perfect for', 'ideal for', 'great for', 'designed for', 'made for', 'who is this for', 'best for'];

  // --- Feature detection keywords ---
  var FEATURE_KEYWORDS = [
    'customiz', 'edit', 'automat', 'track', 'manage', 'organiz', 'plan',
    'template', 'dashboard', 'formula', 'linked', 'drag', 'drop', 'filter',
    'sort', 'calendar', 'reminder', 'notification', 'database', 'rollup',
    'relation', 'view', 'gallery', 'board', 'timeline', 'chart', 'graph',
    'widget', 'embed', 'integration', 'sync', 'import', 'export', 'print',
    'responsive', 'mobile', 'dark mode', 'light mode', 'color', 'theme',
    'habit', 'goal', 'budget', 'expense', 'income', 'savings', 'workout',
    'meal', 'recipe', 'reading', 'journal', 'mood', 'gratitude', 'reflect',
    'project', 'task', 'subtask', 'deadline', 'priority', 'progress',
    'client', 'invoice', 'content', 'social media', 'marketing', 'crm',
  ];

  // --- File format detection ---
  var FILE_FORMAT_PATTERNS = [
    { pattern: /\bnotion\b/i, format: 'Notion' },
    { pattern: /\bpdf\b/i, format: 'PDF' },
    { pattern: /\bcanva\b/i, format: 'Canva' },
    { pattern: /\bgoogle\s*sheets?\b/i, format: 'Google Sheets' },
    { pattern: /\bgoogle\s*docs?\b/i, format: 'Google Docs' },
    { pattern: /\bexcel\b/i, format: 'Excel' },
    { pattern: /\bword\b/i, format: 'Word' },
    { pattern: /\bpowerpoint\b|\bpptx?\b/i, format: 'PowerPoint' },
    { pattern: /\bfigma\b/i, format: 'Figma' },
    { pattern: /\bairtable\b/i, format: 'Airtable' },
    { pattern: /\btrello\b/i, format: 'Trello' },
    { pattern: /\bzip\b/i, format: 'ZIP' },
    { pattern: /\bsvg\b/i, format: 'SVG' },
    { pattern: /\bpng\b/i, format: 'PNG' },
    { pattern: /\bjpe?g\b/i, format: 'JPEG' },
  ];

  // --- Customization level detection ---
  var CUSTOMIZATION_PATTERNS = {
    full: [/fully\s+edit/i, /fully\s+customiz/i, /100%\s+edit/i, /completely\s+edit/i, /edit\s+everything/i],
    partial: [/partially\s+edit/i, /some\s+.*\s+edit/i, /certain\s+.*\s+edit/i],
    none: [/view\s+only/i, /read[\s-]+only/i, /not\s+edit/i, /cannot\s+edit/i],
  };

  // --- Bullet point patterns ---
  var BULLET_REGEX = /^[\s]*[\u2022\u2023\u25E6\u2043\u2219\u25AA\u25CF\u2713\u2714\u2705\u2716\u274C\u27A1\u25B6\u2605★●○◆◇▸▹►▻→➤✓✔✅❌•\-\*]\s*/;
  var NUMBERED_REGEX = /^\s*\d{1,2}[\.\)]\s+/;

  /**
   * Parse raw description text into structured sections.
   * @param {string} rawText - The raw description text
   * @returns {object} Structured description sections
   */
  function parse(rawText) {
    if (!rawText || typeof rawText !== 'string') {
      return emptyResult();
    }

    var text = rawText.trim();
    if (text.length < 10) return emptyResult();

    // Split into lines
    var lines = text.split(/\n/);
    var cleanLines = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (line.length > 0) cleanLines.push(line);
    }

    // Split into sections by headers or double newlines
    var sections = splitIntoSections(cleanLines);

    // Extract structured data
    var result = {
      what_is_it: extractFirstParagraph(cleanLines),
      whats_included: [],
      features: [],
      how_it_works: [],
      requirements: [],
      file_formats: detectFileFormats(text),
      customization_level: detectCustomizationLevel(text),
      target_audience: extractTargetAudience(text),
      guarantee_text: extractGuarantee(text),
      upsell_mentions: extractUpsells(text),
      word_count: text.split(/\s+/).length,
      section_count: sections.length,
      has_instructions: false,
      has_demo_link: /\b(demo|preview|sample|example)\b.*\b(link|url|http|here)\b/i.test(text) || /https?:\/\/[^\s]+\b(demo|preview|sample)\b/i.test(text),
      urgency_signals: extractUrgencySignals(text),
    };

    // Process each section
    for (var si = 0; si < sections.length; si++) {
      var section = sections[si];
      var headerLower = (section.header || '').toLowerCase();
      var bullets = extractBullets(section.lines);

      // Classify section by header
      if (matchesAny(headerLower, INCLUDED_HEADERS)) {
        result.whats_included = result.whats_included.concat(bullets.length > 0 ? bullets : section.lines);
      } else if (matchesAny(headerLower, HOW_IT_WORKS_HEADERS)) {
        result.how_it_works = result.how_it_works.concat(bullets.length > 0 ? bullets : section.lines);
        result.has_instructions = true;
      } else if (matchesAny(headerLower, REQUIREMENTS_HEADERS)) {
        result.requirements = result.requirements.concat(bullets.length > 0 ? bullets : section.lines);
      } else if (matchesAny(headerLower, TARGET_HEADERS)) {
        // Target audience from section content
        var audienceItems = bullets.length > 0 ? bullets : section.lines;
        if (audienceItems.length > 0 && !result.target_audience) {
          result.target_audience = audienceItems.join(', ');
        }
      }
    }

    // Extract features from ALL lines (not just sections)
    result.features = extractFeatures(cleanLines);

    // If no instructions section found, check for instruction-like content
    if (!result.has_instructions) {
      result.has_instructions = /\b(step\s+\d|how\s+to\s+use|getting\s+started|instructions)\b/i.test(text);
    }

    // Deduplicate arrays
    result.whats_included = dedup(result.whats_included).slice(0, 30);
    result.features = dedup(result.features).slice(0, 30);
    result.how_it_works = dedup(result.how_it_works).slice(0, 20);
    result.requirements = dedup(result.requirements).slice(0, 10);
    result.file_formats = dedup(result.file_formats);
    result.upsell_mentions = dedup(result.upsell_mentions).slice(0, 10);
    result.urgency_signals = dedup(result.urgency_signals).slice(0, 5);

    return result;
  }

  function emptyResult() {
    return {
      what_is_it: '',
      whats_included: [],
      features: [],
      how_it_works: [],
      requirements: [],
      file_formats: [],
      customization_level: 'unknown',
      target_audience: '',
      guarantee_text: '',
      upsell_mentions: [],
      word_count: 0,
      section_count: 0,
      has_instructions: false,
      has_demo_link: false,
      urgency_signals: [],
    };
  }

  // --- Split lines into sections ---
  function splitIntoSections(lines) {
    var sections = [];
    var currentSection = { header: '', lines: [] };

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (isHeader(line)) {
        if (currentSection.lines.length > 0 || currentSection.header) {
          sections.push(currentSection);
        }
        currentSection = { header: line.replace(/[:*#\u2728\u2B50\u2764\u2705]+\s*$/, '').trim(), lines: [] };
      } else {
        currentSection.lines.push(line);
      }
    }
    if (currentSection.lines.length > 0 || currentSection.header) {
      sections.push(currentSection);
    }
    return sections;
  }

  function isHeader(line) {
    if (line.length > 80 || line.length < 2) return false;
    for (var i = 0; i < HEADER_PATTERNS.length; i++) {
      if (HEADER_PATTERNS[i].test(line)) return true;
    }
    // Also detect lines that are section keywords
    var lower = line.toLowerCase().replace(/[^a-z\s]/g, '').trim();
    var allHeaders = INCLUDED_HEADERS.concat(HOW_IT_WORKS_HEADERS, REQUIREMENTS_HEADERS, TARGET_HEADERS);
    for (var j = 0; j < allHeaders.length; j++) {
      if (lower.indexOf(allHeaders[j]) !== -1 && lower.length < 60) return true;
    }
    return false;
  }

  // --- Extract first paragraph (what_is_it) ---
  function extractFirstParagraph(lines) {
    var para = [];
    for (var i = 0; i < lines.length && i < 5; i++) {
      var line = lines[i];
      if (isHeader(line) && i > 0) break;
      if (BULLET_REGEX.test(line) && i > 0) break;
      para.push(line);
      // Stop after 200 words
      if (para.join(' ').split(/\s+/).length > 200) break;
    }
    return para.join(' ').slice(0, 800);
  }

  // --- Extract bullet points from section lines ---
  function extractBullets(lines) {
    var bullets = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (BULLET_REGEX.test(line) || NUMBERED_REGEX.test(line)) {
        var clean = line.replace(BULLET_REGEX, '').replace(NUMBERED_REGEX, '').trim();
        if (clean.length > 2 && clean.length < 300) bullets.push(clean);
      }
    }
    return bullets;
  }

  // --- Extract feature lines ---
  function extractFeatures(lines) {
    var features = [];
    for (var i = 0; i < lines.length; i++) {
      var lower = lines[i].toLowerCase();
      for (var j = 0; j < FEATURE_KEYWORDS.length; j++) {
        if (lower.indexOf(FEATURE_KEYWORDS[j]) !== -1) {
          var clean = lines[i].replace(BULLET_REGEX, '').replace(NUMBERED_REGEX, '').trim();
          if (clean.length > 5 && clean.length < 200) {
            features.push(clean);
          }
          break; // one match per line is enough
        }
      }
    }
    return features;
  }

  // --- Detect file formats ---
  function detectFileFormats(text) {
    var formats = [];
    for (var i = 0; i < FILE_FORMAT_PATTERNS.length; i++) {
      if (FILE_FORMAT_PATTERNS[i].pattern.test(text)) {
        formats.push(FILE_FORMAT_PATTERNS[i].format);
      }
    }
    return formats;
  }

  // --- Detect customization level ---
  function detectCustomizationLevel(text) {
    var levels = ['full', 'partial', 'none'];
    for (var li = 0; li < levels.length; li++) {
      var patterns = CUSTOMIZATION_PATTERNS[levels[li]];
      for (var pi = 0; pi < patterns.length; pi++) {
        if (patterns[pi].test(text)) return levels[li];
      }
    }
    // Fallback heuristic
    if (/\bedit(?:able)?\b/i.test(text)) return 'full';
    return 'unknown';
  }

  // --- Extract target audience ---
  function extractTargetAudience(text) {
    var patterns = [
      /(?:perfect|ideal|great|designed|made|best)\s+for\s+([^.!?\n]{10,150})/i,
      /(?:who\s+is\s+this\s+for)[:\s]+([^.!?\n]{10,150})/i,
    ];
    for (var i = 0; i < patterns.length; i++) {
      var match = text.match(patterns[i]);
      if (match) return match[1].trim();
    }
    return '';
  }

  // --- Extract guarantee text ---
  function extractGuarantee(text) {
    var patterns = [
      /(?:100%|full)\s+(?:money[\s-]*back|satisfaction|refund)[^.!?\n]{0,100}[.!?]/i,
      /(?:guarantee|guaranteed)[^.!?\n]{0,100}[.!?]/i,
      /(?:not\s+satisfied|not\s+happy)[^.!?\n]{0,100}[.!?]/i,
    ];
    for (var i = 0; i < patterns.length; i++) {
      var match = text.match(patterns[i]);
      if (match) return match[0].trim();
    }
    return '';
  }

  // --- Extract upsell/cross-sell mentions ---
  function extractUpsells(text) {
    var mentions = [];
    var patterns = [
      /(?:check\s+out|see\s+also|you\s+(?:may|might)\s+also|browse)\s+(?:my|our)\s+([^.!?\n]{5,100})/gi,
      /(?:more\s+templates?|other\s+products?|full\s+collection)\s*(?::|\-|in)\s*([^.!?\n]{5,100})/gi,
    ];
    for (var i = 0; i < patterns.length; i++) {
      var match;
      while ((match = patterns[i].exec(text)) !== null) {
        mentions.push(match[0].trim().slice(0, 150));
      }
    }
    // Also detect links to other Etsy listings
    var linkMatches = text.match(/https?:\/\/www\.etsy\.com\/listing\/\d+/gi);
    if (linkMatches) {
      for (var li = 0; li < linkMatches.length; li++) {
        mentions.push(linkMatches[li]);
      }
    }
    return mentions;
  }

  // --- Extract urgency signals ---
  function extractUrgencySignals(text) {
    var signals = [];
    var patterns = [
      /\b(?:limited\s+time|sale\s+ends?|flash\s+sale|ends?\s+soon|hurry|don't\s+miss|last\s+chance)\b/gi,
      /\b\d+%\s+off\b/gi,
    ];
    for (var i = 0; i < patterns.length; i++) {
      var match;
      while ((match = patterns[i].exec(text)) !== null) {
        signals.push(match[0].trim());
      }
    }
    return signals;
  }

  // --- Helpers ---
  function matchesAny(text, keywords) {
    for (var i = 0; i < keywords.length; i++) {
      if (text.indexOf(keywords[i]) !== -1) return true;
    }
    return false;
  }

  function dedup(arr) {
    var seen = {};
    var result = [];
    for (var i = 0; i < arr.length; i++) {
      var key = arr[i].toLowerCase().trim();
      if (!seen[key] && key.length > 0) {
        seen[key] = true;
        result.push(arr[i]);
      }
    }
    return result;
  }

  /**
   * Compute description quality score (0-100).
   * @param {object} parsed - Output of parse()
   * @returns {number}
   */
  function computeDescriptionQuality(parsed) {
    if (!parsed) return 0;
    var score = 0;

    // Word count (0-25): 500+ words = 25
    score += Math.min(25, Math.round((parsed.word_count / 500) * 25));

    // Section count (0-25): 5+ sections = 25
    score += Math.min(25, Math.round((parsed.section_count / 5) * 25));

    // Has instructions (0-15)
    if (parsed.has_instructions) score += 15;

    // Has demo link (0-10)
    if (parsed.has_demo_link) score += 10;

    // Features count (0-15): 5+ features = 15
    score += Math.min(15, Math.round(((parsed.features || []).length / 5) * 15));

    // What's included count (0-10): 3+ items = 10
    score += Math.min(10, Math.round(((parsed.whats_included || []).length / 3) * 10));

    return Math.min(100, score);
  }

  globalThis.EtsyDescriptionParser = {
    parse: parse,
    computeDescriptionQuality: computeDescriptionQuality,
  };
})();
