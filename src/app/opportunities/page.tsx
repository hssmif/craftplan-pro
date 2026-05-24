'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface Opportunity {
  id: number; import_id: number; title: string; core_keywords: string; tag_set: string;
  niche: string; category: string; market_signals: string; opportunity_score: number;
  recommended_angle: string; deliverables: string; listing_plan: string;
  status: string; created_at: string; updated_at: string;
}

const STATUS_TABS = ['all', 'new', 'shortlisted', 'in_progress', 'published', 'dismissed'] as const;
const STATUS_COLORS: Record<string, string> = {
  new: 'bg-blue-500/15 text-blue-400',
  shortlisted: 'bg-amber-500/15 text-amber-400',
  in_progress: 'bg-purple-500/15 text-purple-400',
  published: 'bg-emerald-500/15 text-emerald-400',
  dismissed: 'bg-white/[0.06] text-[var(--text-muted)]',
};

export default function OpportunitiesPage() {
  const [opps, setOpps] = useState<Opportunity[]>([]);
  const [tab, setTab] = useState<string>('all');
  const [selected, setSelected] = useState<Opportunity | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState('');
  const [dismissedIds, setDismissedIds] = useState<Set<number>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const stored = localStorage.getItem('craftplan_dismissed_opportunities');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });
  const [undoItem, setUndoItem] = useState<{ id: number; title: string } | null>(null);
  const undoTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Persist dismissed IDs
  useEffect(() => {
    localStorage.setItem('craftplan_dismissed_opportunities', JSON.stringify([...dismissedIds]));
  }, [dismissedIds]);

  const dismissOpp = (opp: Opportunity, e: React.MouseEvent) => {
    e.stopPropagation();
    setDismissedIds(prev => new Set([...prev, opp.id]));
    if (selected?.id === opp.id) setSelected(null);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoItem({ id: opp.id, title: opp.title });
    undoTimerRef.current = setTimeout(() => setUndoItem(null), 5000);
  };

  const undoDismiss = () => {
    if (!undoItem) return;
    setDismissedIds(prev => {
      const next = new Set(prev);
      next.delete(undoItem.id);
      return next;
    });
    setUndoItem(null);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
  };

  const toggleLike = (opp: Opportunity, e: React.MouseEvent) => {
    e.stopPropagation();
    const newStatus = opp.status === 'shortlisted' ? 'new' : 'shortlisted';
    updateStatus(opp.id, newStatus);
  };

  const loadOpps = useCallback(async () => {
    setLoading(true);
    const url = tab === 'all' ? '/api/opportunities' : `/api/opportunities?status=${tab}`;
    const res = await fetch(url);
    const data = await res.json();
    const raw: Opportunity[] = data.opportunities || [];
    // Filter noise entries and deduplicate
    const noiseKeywords = ['privacy', 'settings', 'cookie', 'advertisement', 'sponsored', 'uncategorized'];
    const filtered = raw
      .filter(o => !noiseKeywords.some(k => o.title.toLowerCase().includes(k) || o.niche.toLowerCase() === k))
      .filter((o, i, arr) => arr.findIndex(x => x.niche === o.niche && x.title === o.title) === i);
    setOpps(filtered);
    setLoading(false);
  }, [tab]);

  useEffect(() => { loadOpps(); }, [loadOpps]);

  const generatePlan = async (oppId: number) => {
    setGenerating(true);
    setMessage('');
    try {
      const res = await fetch('/api/opportunities/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opportunity_id: oppId }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage('Template plan generated!');
        setSelected(data.opportunity);
        loadOpps();
      } else {
        setMessage(`Error: ${data.error}`);
      }
    } catch (err) {
      setMessage(`Error: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
    setGenerating(false);
  };

  const updateStatus = async (oppId: number, status: string) => {
    await fetch('/api/opportunities', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: oppId, status }),
    });
    loadOpps();
    if (selected?.id === oppId) {
      setSelected(prev => prev ? { ...prev, status } : null);
    }
  };

  const parseJson = (str: string | null) => {
    if (!str) return null;
    try { return JSON.parse(str); } catch { return null; }
  };

  const scoreColor = (s: number) => {
    if (s >= 60) return 'text-emerald-400 bg-emerald-500/15 border-emerald-500/25';
    if (s >= 40) return 'text-amber-400 bg-amber-500/15 border-amber-500/25';
    return 'text-[var(--text-muted)] bg-white/[0.06] border-white/[0.08]';
  };

  const displayedOpps = opps.filter(o => !dismissedIds.has(o.id));

  return (
    <div className="flex h-full">
      {/* Left: List */}
      <div className="w-[400px] border-r border-white/[0.08] flex flex-col bg-[var(--bg-surface)]">
        <div className="p-4 border-b border-white/[0.08]">
          <h1 className="text-lg font-bold text-white">Opportunities</h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">{displayedOpps.length} opportunities{dismissedIds.size > 0 ? ` (${dismissedIds.size} hidden)` : ''}</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-2 overflow-x-auto scrollbar-hide flex-nowrap border-b border-white/[0.06]">
          {STATUS_TABS.map(t => (
            <button key={t} onClick={() => { setTab(t); setSelected(null); }}
              className={`px-2.5 py-1 text-xs rounded-full whitespace-nowrap flex-shrink-0 ${tab === t ? 'bg-indigo-600 text-white' : 'text-[var(--text-muted)] hover:bg-white/[0.06]'}`}>
              {t === 'all' ? 'All' : t.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="text-center py-8 text-[var(--text-muted)] text-sm">Loading...</div>
          ) : opps.length === 0 ? (
            <div className="text-center py-12 px-4">
              <div className="text-3xl mb-2">⚡</div>
              <p className="text-sm text-[var(--text-muted)]">No opportunities yet. Import data from ListingView and create opportunities.</p>
            </div>
          ) : (
            displayedOpps.map(opp => (
              <div key={opp.id} onClick={() => setSelected(opp)}
                className={`w-full text-left p-3 border-b border-white/[0.06] hover:bg-white/[0.04] transition-colors cursor-pointer ${selected?.id === opp.id ? 'bg-indigo-950/30 border-l-2 border-l-indigo-500' : ''}`}>
                <div className="flex items-start justify-between gap-1">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-white truncate">{opp.title}</div>
                    <div className="text-xs text-[var(--text-muted)] mt-0.5">
                      {opp.category || opp.niche}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                    <span className={`px-1.5 py-0.5 text-[10px] font-semibold rounded border ${scoreColor(opp.opportunity_score)}`}>
                      {opp.opportunity_score}
                    </span>
                    <button
                      onClick={(e) => toggleLike(opp, e)}
                      className={`p-1 rounded transition-colors ${opp.status === 'shortlisted' ? 'text-red-500 hover:bg-red-500/15' : 'text-[var(--text-muted)] hover:text-red-400 hover:bg-white/[0.06]'}`}
                      title={opp.status === 'shortlisted' ? 'Remove from shortlist' : 'Shortlist'}
                    >
                      <svg className="w-3.5 h-3.5" fill={opp.status === 'shortlisted' ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => dismissOpp(opp, e)}
                      className="p-1 rounded text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/15 transition-colors"
                      title="Dismiss"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
                {opp.core_keywords && (
                  <div className="flex gap-1 mt-1.5 flex-wrap">
                    {(parseJson(opp.core_keywords) || []).slice(0, 3).map((k: string, i: number) => (
                      <span key={i} className="text-[10px] px-1.5 py-0.5 bg-white/[0.06] text-[var(--text-muted)] rounded">{k}</span>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right: Detail */}
      <div className="flex-1 overflow-y-auto bg-[var(--bg-base)] p-6">
        {!selected ? (
          <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-sm">
            Select an opportunity to view details
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-6">
            {message && (
              <div className="p-3 bg-indigo-500/15 border border-indigo-500/25 rounded-lg text-sm text-indigo-400">{message}</div>
            )}

            {/* Header */}
            <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white">{selected.title}</h2>
                  <p className="text-sm text-[var(--text-muted)] mt-1">{selected.category || selected.niche}</p>
                </div>
                <div className={`text-2xl font-bold px-3 py-1 rounded-lg border ${scoreColor(selected.opportunity_score)}`}>
                  {selected.opportunity_score}
                </div>
              </div>

              {/* Status controls */}
              <div className="flex gap-2 mt-4">
                {selected.status === 'new' && (
                  <button onClick={() => updateStatus(selected.id, 'shortlisted')}
                    className="px-3 py-1.5 bg-amber-500 text-white text-xs font-medium rounded-lg hover:bg-amber-600">
                    ⭐ Shortlist
                  </button>
                )}
                {(selected.status === 'new' || selected.status === 'shortlisted') && (
                  <button onClick={() => updateStatus(selected.id, 'in_progress')}
                    className="px-3 py-1.5 bg-purple-600 text-white text-xs font-medium rounded-lg hover:bg-purple-700">
                    🚀 Start
                  </button>
                )}
                {selected.status !== 'dismissed' && (
                  <button onClick={() => updateStatus(selected.id, 'dismissed')}
                    className="px-3 py-1.5 bg-white/[0.06] text-[var(--text-secondary)] text-xs font-medium rounded-lg hover:bg-white/[0.1]">
                    Dismiss
                  </button>
                )}
              </div>
            </div>

            {/* Market Signals */}
            {selected.market_signals && (() => {
              const signals = parseJson(selected.market_signals);
              if (!signals) return null;
              return (
                <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] p-5">
                  <h3 className="font-semibold text-[var(--text-primary)] mb-3 text-sm">Market Signals</h3>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Listings', value: signals.listings_count },
                      { label: 'Bestsellers', value: signals.bestseller_count },
                      { label: 'Avg Price', value: `$${signals.avg_price}` },
                      { label: 'Total Favs', value: signals.total_favorites?.toLocaleString() },
                      { label: 'Avg Age', value: `${Math.round((signals.avg_listing_age_days || 0) / 30)}mo` },
                      { label: 'Avg Mo Rev', value: `$${signals.avg_monthly_revenue}` },
                    ].map((m, i) => (
                      <div key={i} className="bg-white/[0.04] rounded-lg p-2.5">
                        <div className="text-lg font-bold text-white">{m.value}</div>
                        <div className="text-[10px] text-[var(--text-muted)]">{m.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Tags */}
            {selected.tag_set && (
              <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] p-5">
                <h3 className="font-semibold text-[var(--text-primary)] mb-3 text-sm">Tags</h3>
                <div className="flex flex-wrap gap-1.5">
                  {(parseJson(selected.tag_set) || []).map((t: string, i: number) => (
                    <span key={i} className="px-2 py-1 bg-indigo-500/15 text-indigo-400 rounded text-xs">{t}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Generate button */}
            {!selected.listing_plan && (
              <button onClick={() => generatePlan(selected.id)} disabled={generating}
                className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 shadow-lg">
                {generating ? '⏳ Generating with AI...' : '✨ Generate Template Plan'}
              </button>
            )}

            {/* Generated Plan */}
            {selected.listing_plan && (() => {
              const plan = parseJson(selected.listing_plan);
              if (!plan) return null;
              // Support both old format (template_concept) and new format (templateName)
              const isNewFormat = !!plan.templateName;
              const el = plan.etsyListing || plan.etsy_listing;
              return (
                <div className="space-y-4">
                  {/* Template Overview */}
                  {isNewFormat && (
                    <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] p-5">
                      <h3 className="font-semibold text-[var(--text-primary)] mb-3">📋 Template Plan</h3>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-3 mb-3">
                          <span className="text-xl font-bold text-white">{plan.templateName}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="bg-white/[0.04] rounded-lg p-2.5">
                            <div className="text-[10px] text-[var(--text-muted)] uppercase">Type</div>
                            <div className="font-medium text-[var(--text-primary)]">{plan.type?.replace(/_/g, ' ')}</div>
                          </div>
                          <div className="bg-white/[0.04] rounded-lg p-2.5">
                            <div className="text-[10px] text-[var(--text-muted)] uppercase">Aesthetic</div>
                            <div className="font-medium text-[var(--text-primary)]">{plan.aesthetic}</div>
                          </div>
                          <div className="bg-white/[0.04] rounded-lg p-2.5">
                            <div className="text-[10px] text-[var(--text-muted)] uppercase">Complexity</div>
                            <div className="font-medium text-[var(--text-primary)]">{plan.complexity}</div>
                          </div>
                          <div className="bg-white/[0.04] rounded-lg p-2.5">
                            <div className="text-[10px] text-[var(--text-muted)] uppercase">Suggested Price</div>
                            <div className="font-bold text-green-600 text-lg">${plan.priceSuggestion}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Databases */}
                  {isNewFormat && plan.databases?.length > 0 && (
                    <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] p-5">
                      <h3 className="font-semibold text-[var(--text-primary)] mb-3">🗄️ Databases ({plan.databases.length})</h3>
                      <div className="space-y-3">
                        {plan.databases.map((db: { name: string; icon?: string; purpose?: string; properties?: { name: string; type: string; options?: string[] }[] }, i: number) => (
                          <details key={i} className="border border-white/[0.06] rounded-lg overflow-hidden">
                            <summary className="px-3 py-2 bg-white/[0.04] cursor-pointer hover:bg-white/[0.06] flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
                              <span>{db.icon || '📊'}</span> {db.name}
                              <span className="text-[10px] text-[var(--text-muted)] ml-auto">{db.properties?.length || 0} properties</span>
                            </summary>
                            <div className="px-3 py-2 text-xs">
                              {db.purpose && <p className="text-[var(--text-muted)] mb-2 italic">{db.purpose}</p>}
                              <table className="w-full">
                                <thead>
                                  <tr className="text-[10px] text-[var(--text-muted)] uppercase border-b">
                                    <th className="text-left py-1">Property</th><th className="text-left py-1">Type</th><th className="text-left py-1">Options</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(db.properties || []).map((p: { name: string; type: string; options?: string[] }, j: number) => (
                                    <tr key={j} className="border-b border-white/[0.04]">
                                      <td className="py-1 font-medium text-[var(--text-primary)]">{p.name}</td>
                                      <td className="py-1"><span className="px-1.5 py-0.5 bg-indigo-500/15 text-indigo-400 rounded text-[10px]">{p.type}</span></td>
                                      <td className="py-1 text-[var(--text-muted)]">{p.options?.join(', ') || '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </details>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Relations + Rollups + Formulas */}
                  {isNewFormat && (plan.relations?.length > 0 || plan.rollups?.length > 0 || plan.formulas?.length > 0) && (
                    <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] p-5">
                      <h3 className="font-semibold text-[var(--text-primary)] mb-3">🔗 Relations & Formulas</h3>
                      {plan.relations?.length > 0 && (
                        <div className="mb-3">
                          <div className="text-xs font-semibold text-[var(--text-muted)] mb-1">Relations ({plan.relations.length})</div>
                          {plan.relations.map((r: { from: string; property: string; to: string }, i: number) => (
                            <div key={i} className="text-xs text-[var(--text-secondary)] py-0.5">{r.from} → <span className="font-medium text-indigo-600">{r.property}</span> → {r.to}</div>
                          ))}
                        </div>
                      )}
                      {plan.rollups?.length > 0 && (
                        <div className="mb-3">
                          <div className="text-xs font-semibold text-[var(--text-muted)] mb-1">Rollups ({plan.rollups.length})</div>
                          {plan.rollups.map((r: { db: string; property: string; relation: string; target_property: string; function: string }, i: number) => (
                            <div key={i} className="text-xs text-[var(--text-secondary)] py-0.5">{r.db}.{r.property} = <span className="font-medium text-purple-600">{r.function}</span>({r.relation}.{r.target_property})</div>
                          ))}
                        </div>
                      )}
                      {plan.formulas?.length > 0 && (
                        <div>
                          <div className="text-xs font-semibold text-[var(--text-muted)] mb-1">Formulas ({plan.formulas.length})</div>
                          {plan.formulas.map((f: { db: string; property: string; logic: string }, i: number) => (
                            <div key={i} className="text-xs text-[var(--text-secondary)] py-0.5">{f.db}.{f.property}: <span className="italic text-[var(--text-muted)]">{f.logic}</span></div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Views */}
                  {isNewFormat && plan.views?.length > 0 && (
                    <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] p-5">
                      <h3 className="font-semibold text-[var(--text-primary)] mb-3">👁️ Views ({plan.views.length})</h3>
                      <div className="grid grid-cols-1 gap-2">
                        {plan.views.map((v: { db: string; name: string; type: string; filter?: string; sort?: string }, i: number) => (
                          <div key={i} className="flex items-center justify-between bg-white/[0.04] rounded-lg px-3 py-2 text-xs">
                            <div>
                              <span className="font-medium text-[var(--text-primary)]">{v.name}</span>
                              <span className="text-[var(--text-muted)] ml-1">({v.db})</span>
                            </div>
                            <span className="px-2 py-0.5 bg-blue-500/15 text-blue-400 rounded-full text-[10px] font-medium">{v.type}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Dashboard */}
                  {isNewFormat && plan.dashboards?.length > 0 && (
                    <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] p-5">
                      <h3 className="font-semibold text-[var(--text-primary)] mb-3">📊 Dashboard</h3>
                      {plan.dashboards.map((d: { name: string; blocks: { type: string; content: string }[] }, i: number) => (
                        <div key={i}>
                          <div className="text-sm font-medium text-[var(--text-primary)] mb-2">{d.name}</div>
                          <div className="space-y-1">
                            {(d.blocks || []).map((b: { type: string; content: string }, j: number) => (
                              <div key={j} className="flex items-center gap-2 text-xs bg-white/[0.04] rounded px-2 py-1.5">
                                <span className="px-1.5 py-0.5 bg-white/[0.06] text-[var(--text-muted)] rounded text-[10px]">{b.type}</span>
                                <span className="text-[var(--text-secondary)] truncate">{b.content}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Etsy Listing */}
                  {el && (
                    <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] p-5">
                      <h3 className="font-semibold text-[var(--text-primary)] mb-3">🏷️ Etsy Listing</h3>
                      <div className="space-y-3 text-sm">
                        <div>
                          <strong>Title:</strong>
                          <p className="mt-1 p-2 bg-white/[0.04] rounded text-[var(--text-primary)]">{el.title}</p>
                        </div>
                        <div>
                          <strong>Description:</strong>
                          <p className="mt-1 p-2 bg-white/[0.04] rounded text-[var(--text-primary)] whitespace-pre-wrap text-xs">{el.description}</p>
                        </div>
                        <div>
                          <strong>Tags ({el.tags?.length || 0}):</strong>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {(el.tags || []).map((t: string, i: number) => (
                              <span key={i} className="px-2 py-0.5 bg-orange-500/15 text-orange-400 rounded text-xs">{t}</span>
                            ))}
                          </div>
                        </div>
                        {el.seoCategory && (
                          <p className="text-xs text-[var(--text-muted)]">Category: {el.seoCategory}</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Mockup Scenes */}
                  {(plan.mockupScenes || plan.mockup_suggestions)?.length > 0 && (
                    <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] p-5">
                      <h3 className="font-semibold text-[var(--text-primary)] mb-3">🎨 Mockup Scenes</h3>
                      <ul className="space-y-2 text-sm text-[var(--text-secondary)]">
                        {(plan.mockupScenes || plan.mockup_suggestions).map((m: string, i: number) => (
                          <li key={i} className="flex gap-2"><span className="text-indigo-500">•</span>{m}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Upgrades */}
                  {isNewFormat && plan.upgrades?.length > 0 && (
                    <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] p-5">
                      <h3 className="font-semibold text-[var(--text-primary)] mb-3">⚡ Upgrades</h3>
                      <div className="space-y-2">
                        {plan.upgrades.map((u: { feature: string; description: string; implementation: string }, i: number) => (
                          <div key={i} className="bg-gradient-to-r from-purple-500/10 to-indigo-500/10 rounded-lg p-3">
                            <div className="text-sm font-semibold text-purple-400">{u.feature}</div>
                            <div className="text-xs text-[var(--text-secondary)] mt-0.5">{u.description}</div>
                            <div className="text-[10px] text-[var(--text-muted)] mt-1 italic">How: {u.implementation}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Open in Notion Builder */}
                  {isNewFormat && (
                    <a href={`/notion-builder?plan=${selected.id}`}
                      className="block w-full py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-semibold rounded-xl hover:from-green-700 hover:to-emerald-700 text-center shadow-lg">
                      🚀 Open in Notion Builder
                    </a>
                  )}

                  {/* Regenerate */}
                  <button onClick={() => generatePlan(selected.id)} disabled={generating}
                    className="w-full py-2 bg-white/[0.06] text-[var(--text-primary)] text-sm font-medium rounded-lg hover:bg-white/[0.1] disabled:opacity-50">
                    {generating ? 'Regenerating...' : '🔄 Regenerate Plan'}
                  </button>
                </div>
              );
            })()}

            {selected.recommended_angle && !selected.listing_plan && (
              <div className="bg-[var(--bg-elevated)] rounded-xl border border-white/[0.08] p-5">
                <h3 className="font-semibold text-[var(--text-primary)] mb-2">Recommended Angle</h3>
                <p className="text-sm text-[var(--text-secondary)]">{selected.recommended_angle}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Undo dismiss toast */}
      {undoItem && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[var(--bg-elevated)] border border-white/[0.08] text-white px-4 py-2.5 rounded-lg shadow-xl flex items-center gap-3 text-sm">
          <span className="truncate max-w-[200px]">Dismissed: {undoItem.title}</span>
          <button onClick={undoDismiss} className="font-semibold text-indigo-400 hover:text-indigo-300 whitespace-nowrap">
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
