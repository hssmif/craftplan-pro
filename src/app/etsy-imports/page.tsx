'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface EtsyImport {
  id: number; source: string; listings_count: number; keywords_count: number;
  deduped_listings: number; deduped_keywords: number; status: string; created_at: string;
}
interface ImportListing {
  id: number; listing_id: string; url: string; title: string; shop_name: string;
  price: number; favorites: number; reviews: number; is_bestseller: number; is_etsy_pick: number;
  classification: string; demand_score: number; revenue_estimate: number; monthly_trend: string;
  listing_age_days: number; confidence: string; tags: string; source_keyword: string;
  winner_tier?: string; winner_score?: number;
}
interface ImportKeyword {
  id: number; keyword: string; frequency: number; classification: string;
  demand_score: number; competition_level: string; avg_price: number;
}

export default function EtsyImportsPage() {
  const [imports, setImports] = useState<EtsyImport[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [listings, setListings] = useState<ImportListing[]>([]);
  const [keywords, setKeywords] = useState<ImportKeyword[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  // Batch-level select & delete state
  const [selectedBatches, setSelectedBatches] = useState<Set<number>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  function toggleBatchSelect(id: number) {
    setSelectedBatches(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedBatches.size === imports.length) {
      setSelectedBatches(new Set());
    } else {
      setSelectedBatches(new Set(imports.map(b => b.id)));
    }
  }

  async function deleteBatchById(id: number) {
    await fetch(`/api/integrations/etsy/import?id=${id}`, { method: 'DELETE' });
  }

  async function confirmDeleteBatch(id: number) {
    setDeleting(true);
    await deleteBatchById(id);
    setShowDeleteConfirm(null);
    setSelectedBatches(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    if (selected === id) setSelected(null);
    await loadImports();
    setDeleting(false);
  }

  async function handleDeleteSelected() {
    if (!confirm(`Delete ${selectedBatches.size} import batch${selectedBatches.size > 1 ? 'es' : ''}? This cannot be undone.`)) return;
    setDeleting(true);
    const ids = [...selectedBatches].join(',');
    await fetch(`/api/integrations/etsy/import?ids=${ids}`, { method: 'DELETE' });
    if (selected !== null && selectedBatches.has(selected)) setSelected(null);
    setSelectedBatches(new Set());
    await loadImports();
    setDeleting(false);
  }

  async function handleDeleteAll() {
    if (!confirm(`Delete ALL ${imports.length} import batches? This cannot be undone.`)) return;
    setDeleting(true);
    await fetch('/api/integrations/etsy/import', { method: 'DELETE' });
    setSelected(null);
    setSelectedBatches(new Set());
    await loadImports();
    setDeleting(false);
  }

  // Like / Remove state (per listing)
  const [likedListings, setLikedListings] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try { return new Set(JSON.parse(localStorage.getItem('craftplan_liked_listings') || '[]')); }
    catch { return new Set(); }
  });
  const [removedListings, setRemovedListings] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try { return new Set(JSON.parse(localStorage.getItem('craftplan_removed_listings') || '[]')); }
    catch { return new Set(); }
  });
  const [undoItem, setUndoItem] = useState<{ id: string; title: string } | null>(null);
  const undoTimerRef = useRef<NodeJS.Timeout | null>(null);

  function toggleLike(listingId: string) {
    setLikedListings(prev => {
      const next = new Set(prev);
      next.has(listingId) ? next.delete(listingId) : next.add(listingId);
      localStorage.setItem('craftplan_liked_listings', JSON.stringify([...next]));
      return next;
    });
  }

  function removeListing(listingId: string, title: string) {
    setRemovedListings(prev => {
      const next = new Set(prev);
      next.add(listingId);
      localStorage.setItem('craftplan_removed_listings', JSON.stringify([...next]));
      return next;
    });
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoItem({ id: listingId, title });
    undoTimerRef.current = setTimeout(() => setUndoItem(null), 5000);
  }

  function undoRemove() {
    if (!undoItem) return;
    setRemovedListings(prev => {
      const next = new Set(prev);
      next.delete(undoItem.id);
      localStorage.setItem('craftplan_removed_listings', JSON.stringify([...next]));
      return next;
    });
    setUndoItem(null);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
  }

  const loadImports = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/integrations/etsy/import');
    const data = await res.json();
    setImports(data.imports || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadImports(); }, [loadImports]);

  const loadImportDetail = async (id: number) => {
    if (selected === id) { setSelected(null); return; }
    setSelected(id);
    const res = await fetch(`/api/integrations/etsy/import?id=${id}`);
    const data = await res.json();
    setListings(data.listings || []);
    setKeywords(data.keywords || []);
  };

  const createOpportunities = async (importId: number) => {
    setCreating(true);
    setMessage('');
    try {
      const res = await fetch('/api/opportunities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ import_id: importId }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage(`Created ${data.opportunities_created} opportunities! View them in the Opportunities page.`);
      } else {
        setMessage(`Error: ${data.error}`);
      }
    } catch (err) {
      setMessage(`Error: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
    setCreating(false);
  };

  function detectTemplateType(title: string): string {
    const t = title.toLowerCase();
    if (t.includes('planner') || t.includes('planning')) {
      if (t.includes('student') || t.includes('college') || t.includes('school')) return 'student_planner';
      if (t.includes('adhd') || t.includes('neurodivergent')) return 'adhd_planner';
      if (t.includes('content') || t.includes('social media')) return 'social_media';
      return 'life_planner';
    }
    if (t.includes('finance') || t.includes('budget') || t.includes('money')) return 'finance_tracker';
    if (t.includes('habit') || t.includes('tracker')) return 'habit_tracker';
    if (t.includes('business') || t.includes('project') || t.includes('crm')) return 'business_hub';
    if (t.includes('debt') || t.includes('savings')) return 'debt_calculator';
    if (t.includes('journal') || t.includes('diary')) return 'habit_tracker';
    return 'life_planner';
  }

  function detectAudience(listing: ImportListing): string {
    const t = listing.title.toLowerCase();
    if (t.includes('student') || t.includes('college')) return 'Students';
    if (t.includes('adhd') || t.includes('neurodivergent')) return 'ADHD / Neurodivergent';
    if (t.includes('business') || t.includes('entrepreneur')) return 'Entrepreneurs';
    if (t.includes('minimalist') || t.includes('aesthetic')) return 'Aesthetic Minimalists';
    if (t.includes('women') || t.includes('girl') || t.includes('she')) return 'Women';
    if (listing.price > 15) return 'Premium Buyers';
    return 'Digital Planners Enthusiasts';
  }

  const handleGenerateTemplate = async (listing: ImportListing, importId: number) => {
    setGeneratingId(listing.listing_id);
    setMessage('');
    try {
      const res = await fetch('/api/listings/generate-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_id: listing.listing_id, import_id: importId }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage(`✅ Template plan generated: ${data.templateName}. Redirecting to builder...`);
        // Build competitor context for the builder
        const competitorContext = {
          title: listing.title,
          price: listing.price,
          favorites: listing.favorites,
          reviews: listing.reviews,
          revenue: listing.revenue_estimate,
          classification: listing.classification,
          shop: listing.shop_name,
          tier: listing.winner_tier,
          score: listing.winner_score,
          demandScore: listing.demand_score,
          detectedType: detectTemplateType(listing.title),
          detectedAudience: detectAudience(listing),
        };
        const redirect = `${data.redirect}&competitor=${encodeURIComponent(JSON.stringify(competitorContext))}`;
        setTimeout(() => { window.location.href = redirect; }, 1500);
      } else {
        setMessage(`Error: ${data.error}`);
      }
    } catch (err) {
      setMessage(`Error: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
    setGeneratingId(null);
  };

  const tierBadge = (tier?: string) => {
    const colors: Record<string, string> = {
      BUY: 'bg-emerald-500/15 text-emerald-400', MONITOR: 'bg-amber-500/15 text-amber-400',
      SKIP: 'bg-white/[0.06] text-[var(--text-muted)]',
    };
    return tier ? colors[tier] || 'bg-white/[0.06] text-[var(--text-muted)]' : '';
  };

  const clsBadge = (cls: string) => {
    const colors: Record<string, string> = {
      trending: 'bg-red-500/15 text-red-400', evergreen: 'bg-emerald-500/15 text-emerald-400',
      new: 'bg-emerald-500/15 text-emerald-400',
    };
    return colors[cls] || 'bg-white/[0.06] text-[var(--text-secondary)]';
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Etsy Imports</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">Data imported from ListingView extension</p>
        </div>
        <span className="text-sm text-[var(--text-muted)]">{imports.length} imports</span>
      </div>

      {message && (
        <div className="mb-4 p-3 bg-indigo-500/15 border border-indigo-500/25 rounded-lg text-sm text-indigo-400">
          {message}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-[var(--text-muted)]">Loading...</div>
      ) : imports.length === 0 ? (
        <div className="text-center py-16 bg-[var(--bg-surface)] rounded-xl border border-white/[0.08]">
          <div className="text-4xl mb-3">📦</div>
          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-1">No imports yet</h3>
          <p className="text-sm text-[var(--text-muted)]">Scan Etsy with the ListingView extension and click &quot;Send to CraftPlan&quot;</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Bulk actions bar */}
          <div className="flex items-center justify-between p-3 bg-[var(--bg-elevated)] rounded-lg border border-white/[0.08]">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={imports.length > 0 && selectedBatches.size === imports.length}
                onChange={toggleSelectAll}
                className="w-4 h-4 rounded border-white/[0.1] accent-indigo-500"
              />
              <span className="text-sm text-[var(--text-muted)]">
                {selectedBatches.size > 0
                  ? `${selectedBatches.size} selected`
                  : 'Select all'}
              </span>
            </div>

            {selectedBatches.size > 0 ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-[var(--text-muted)]">
                  {selectedBatches.size} batch{selectedBatches.size > 1 ? 'es' : ''} selected
                </span>
                <button
                  onClick={handleDeleteSelected}
                  disabled={deleting}
                  className="px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white rounded-lg text-sm font-medium flex items-center gap-1.5 disabled:opacity-50"
                >
                  🗑️ Delete Selected ({selectedBatches.size})
                </button>
                <button
                  onClick={() => setSelectedBatches(new Set())}
                  className="px-3 py-1.5 text-[var(--text-muted)] hover:text-white border border-white/[0.08] rounded-lg text-sm"
                >
                  Cancel
                </button>
              </div>
            ) : imports.length > 0 ? (
              <button
                onClick={handleDeleteAll}
                disabled={deleting}
                className="px-3 py-1.5 text-red-400 hover:text-red-300 hover:bg-red-950/30 border border-red-800/50 rounded-lg text-sm transition-all disabled:opacity-50"
              >
                🗑️ Clear All Imports
              </button>
            ) : null}
          </div>

          {imports.map((imp) => (
            <div key={imp.id} className="border border-white/[0.08] rounded-xl overflow-hidden">
              {/* Import header */}
              <div
                onClick={() => loadImportDetail(imp.id)}
                className="w-full flex items-center justify-between p-4 hover:bg-white/[0.04] transition-colors text-left cursor-pointer"
              >
                <div className="flex items-center gap-4">
                  <input
                    type="checkbox"
                    checked={selectedBatches.has(imp.id)}
                    onChange={() => toggleBatchSelect(imp.id)}
                    onClick={e => e.stopPropagation()}
                    className="w-4 h-4 rounded border-white/[0.1] accent-indigo-500 flex-shrink-0"
                  />
                  <div className="w-10 h-10 bg-orange-500/15 rounded-lg flex items-center justify-center text-orange-400 font-bold text-sm">
                    #{imp.id}
                  </div>
                  <div>
                    <div className="font-medium text-white">
                      {imp.listings_count} listings, {imp.keywords_count} keywords
                    </div>
                    <div className="text-xs text-[var(--text-muted)]">
                      {new Date(imp.created_at).toLocaleString()} &middot; {imp.deduped_listings > 0 && `${imp.deduped_listings} dupes skipped`}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {showDeleteConfirm === imp.id ? (
                    <div className="flex items-center gap-2 bg-red-950/40 border border-red-700/50 rounded-lg px-3 py-1.5" onClick={e => e.stopPropagation()}>
                      <span className="text-red-400 text-sm whitespace-nowrap">Delete this batch?</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); confirmDeleteBatch(imp.id); }}
                        disabled={deleting}
                        className="px-2 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded font-medium disabled:opacity-50"
                      >
                        {deleting ? 'Deleting...' : 'Yes, Delete'}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(null); }}
                        className="px-2 py-1 text-[var(--text-muted)] hover:text-white text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(imp.id); }}
                        className="px-3 py-1.5 text-[var(--text-muted)] hover:text-red-400 hover:bg-red-950/30 border border-white/[0.08] hover:border-red-700/50 rounded-lg text-sm transition-all flex items-center gap-1.5"
                        title="Delete this entire import batch"
                      >
                        🗑️ Delete
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); createOpportunities(imp.id); }}
                        disabled={creating}
                        className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {creating ? 'Creating...' : 'Create Opportunities'}
                      </button>
                    </>
                  )}
                  <svg className={`w-5 h-5 text-[var(--text-muted)] transition-transform ${selected === imp.id ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              {/* Expanded detail */}
              {selected === imp.id && (
                <div className="border-t border-white/[0.06] p-4 bg-[var(--bg-surface)]">
                  {/* Listings table */}
                  {(() => {
                    const visibleListings = listings.filter(l => !removedListings.has(l.listing_id));
                    const hiddenCount = listings.length - visibleListings.length;
                    return (
                      <>
                        <h4 className="font-semibold text-[var(--text-primary)] mb-2 text-sm">
                          Listings ({visibleListings.length} of {listings.length})
                          {hiddenCount > 0 && <span className="text-[var(--text-muted)] font-normal ml-1">({hiddenCount} hidden)</span>}
                        </h4>
                        {visibleListings.length > 0 ? (
                          <div className="overflow-x-auto mb-4">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-left text-[var(--text-muted)] border-b border-white/[0.06]">
                                  <th className="pb-2 pr-3">Title</th>
                                  <th className="pb-2 pr-3">Shop</th>
                                  <th className="pb-2 pr-3">Price</th>
                                  <th className="pb-2 pr-3">Favs</th>
                                  <th className="pb-2 pr-3">Rev</th>
                                  <th className="pb-2 pr-3">Age</th>
                                  <th className="pb-2 pr-3">Class</th>
                                  <th className="pb-2 pr-3">Tier</th>
                                  <th className="pb-2 pr-3">Demand</th>
                                  <th className="pb-2 pr-3">MoRev</th>
                                  <th className="pb-2">Action</th>
                                </tr>
                              </thead>
                              <tbody>
                                {visibleListings.slice(0, 50).map((l) => (
                                  <tr key={l.id} className={`border-b border-white/[0.06] ${likedListings.has(l.listing_id) ? 'bg-red-500/10' : ''}`}>
                                    <td className="py-1.5 pr-3 max-w-[200px] truncate">
                                      <a href={l.url} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">{l.title}</a>
                                    </td>
                                    <td className="py-1.5 pr-3 text-[var(--text-muted)]">{l.shop_name}</td>
                                    <td className="py-1.5 pr-3">${l.price?.toFixed(2)}</td>
                                    <td className="py-1.5 pr-3">{l.favorites}</td>
                                    <td className="py-1.5 pr-3">{l.reviews}</td>
                                    <td className="py-1.5 pr-3">{l.listing_age_days ? `${Math.round(l.listing_age_days / 30)}mo` : '-'}</td>
                                    <td className="py-1.5 pr-3">
                                      {l.classification && <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${clsBadge(l.classification)}`}>{l.classification}</span>}
                                    </td>
                                    <td className="py-1.5 pr-3">
                                      {l.winner_tier && (
                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${tierBadge(l.winner_tier)}`}>
                                          {l.winner_tier} {l.winner_score ? `(${l.winner_score})` : ''}
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-1.5 pr-3">{l.demand_score}</td>
                                    <td className="py-1.5 pr-3">${l.revenue_estimate?.toFixed(0) || '-'}</td>
                                    <td className="py-1.5">
                                      <div className="flex items-center gap-1">
                                        <button
                                          onClick={(e) => { e.stopPropagation(); toggleLike(l.listing_id); }}
                                          className={`p-1 rounded transition-colors ${likedListings.has(l.listing_id) ? 'text-red-500 hover:bg-red-500/15' : 'text-[var(--text-muted)] hover:text-red-400 hover:bg-white/[0.06]'}`}
                                          title={likedListings.has(l.listing_id) ? 'Remove from shortlist' : 'Shortlist'}
                                        >
                                          <svg className="w-3.5 h-3.5" fill={likedListings.has(l.listing_id) ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                                          </svg>
                                        </button>
                                        <button
                                          onClick={(e) => { e.stopPropagation(); removeListing(l.listing_id, l.title); }}
                                          className="p-1 rounded text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/15 transition-colors"
                                          title="Remove listing"
                                        >
                                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                          </svg>
                                        </button>
                                        {(!l.winner_tier || l.winner_tier === 'BUY' || l.winner_tier === 'MONITOR') && (
                                          <button
                                            onClick={(e) => { e.stopPropagation(); handleGenerateTemplate(l, imp.id); }}
                                            disabled={generatingId === l.listing_id}
                                            className="px-2 py-1 bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-[10px] font-medium rounded-md hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 whitespace-nowrap"
                                          >
                                            {generatingId === l.listing_id ? '⏳...' : '⚡ Generate'}
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : <p className="text-[var(--text-muted)] text-xs mb-4">No listings{hiddenCount > 0 ? ` (${hiddenCount} hidden)` : ''}</p>}
                      </>
                    );
                  })()}

                  {/* Keywords */}
                  <h4 className="font-semibold text-[var(--text-primary)] mb-2 text-sm">Keywords ({keywords.length})</h4>
                  {keywords.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {keywords.slice(0, 40).map((k) => (
                        <span key={k.id} className={`px-2 py-1 rounded-full text-xs font-medium ${clsBadge(k.classification)}`}>
                          {k.keyword} <span className="opacity-60">({k.demand_score})</span>
                        </span>
                      ))}
                    </div>
                  ) : <p className="text-[var(--text-muted)] text-xs">No keywords</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {/* Undo remove toast */}
      {undoItem && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[var(--bg-elevated)] border border-white/[0.08] text-white px-4 py-2.5 rounded-lg shadow-xl flex items-center gap-3 text-sm">
          <span className="truncate max-w-[250px]">Removed: {undoItem.title.slice(0, 40)}{undoItem.title.length > 40 ? '...' : ''}</span>
          <button onClick={undoRemove} className="font-semibold text-indigo-400 hover:text-indigo-300 whitespace-nowrap">
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
