import { useCallback, useEffect, useState } from "react";
import { MessageSquareQuote, Star, ShieldCheck } from "lucide-react";
import { supabase } from "./cloud";
import { AppButton, Modal, SectionHeading, Time } from "./ui";
import { useStore } from "../lib/store";
import type { PublicReview } from "./types";

/**
 * Public reviews wall.
 *
 * Only APPROVED reviews are ever returned — the RLS select policy allows a
 * visitor to read approved rows and nothing else, so there is no way to
 * see the moderation queue from the public site.
 *
 * If the table has not been migrated yet we show nothing rather than
 * inventing testimonials. That rule is the whole point of migration 004.
 */
export function Reviews({ compactMode = false }: { compactMode?: boolean }) {
  const [reviews, setReviews] = useState<PublicReview[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [composing, setComposing] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) { setState('unavailable'); return; }
    try {
      const { data, error } = await supabase.rpc('public_reviews', { p_limit: compactMode ? 6 : 24 });
      if (error) throw error;
      const rows = (data ?? []) as PublicReview[];
      setReviews(rows);
      setState(rows.length ? 'ready' : 'ready');
    } catch {
      setState('unavailable');
    }
  }, [compactMode]);

  useEffect(() => { void load(); }, [load]);

  if (state === 'loading') {
    return <div className="faint small">Loading reviews…</div>;
  }

  /* Honest empty state — no stock quotes, no invented people. */
  if (state === 'unavailable') {
    return null;
  }

  if (!reviews.length) {
    return (
      <div className="card p-7">
        <SectionHeading title="Reviews" sub="Published after a human reads them" />
        <p className="mt-3 text-[14px] text-ink-2">
          No reviews have been published yet. Every review on this page is one a person actually
          wrote and an administrator approved — we do not show placeholder quotes.
        </p>
        <div className="mt-4">
          <AppButton variant="outline" icon={MessageSquareQuote} onClick={() => setComposing(true)}>
            Write the first review
          </AppButton>
        </div>
        <ReviewComposer open={composing} onClose={() => setComposing(false)} onDone={() => { setComposing(false); void load(); }} />
      </div>
    );
  }

  const avg = reviews.reduce((n, r) => n + r.rating, 0) / reviews.length;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="overline">What people say</div>
          <h2 className="mt-2 text-[clamp(26px,3.4vw,38px)] font-extrabold tracking-[-0.035em]">
            {reviews.length} review{reviews.length === 1 ? '' : 's'}
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <Stars value={avg} />
          <span className="text-[13px] text-ink-3">{avg.toFixed(1)} average</span>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {reviews.map((r) => (
          <div key={r.id} className="card flex h-full flex-col p-6">
            <div className="flex items-start justify-between gap-3">
              <Stars value={r.rating} />
              <Time value={r.created_at} />
            </div>
            <p className="mt-4 flex-1 text-[14.5px] leading-[1.7] text-ink-2">{r.body}</p>
            <div className="mt-4 flex items-center gap-3 border-t border-[var(--line)] pt-4">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-green-soft text-[12px] font-extrabold text-green-deep">
                {r.author_name.trim().slice(0, 1).toUpperCase()}
              </span>
              <span className="text-[13px] font-semibold">{r.author_name}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 flex justify-center">
        <AppButton variant="outline" icon={MessageSquareQuote} onClick={() => setComposing(true)}>
          Write a review
        </AppButton>
      </div>

      <ReviewComposer open={composing} onClose={() => setComposing(false)} onDone={() => { setComposing(false); void load(); }} />
    </div>
  );
}

function Stars({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${value.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={14}
          style={{
            color: i <= Math.round(value) ? "var(--green-deep)" : "var(--ink-4)",
            fill: i <= Math.round(value) ? "var(--green-deep)" : "none",
          }}
        />
      ))}
    </span>
  );
}

function ReviewComposer({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { toast } = useStore();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [body, setBody] = useState("");
  const [rating, setRating] = useState(5);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  if (!open) return null;

  const submit = async () => {
    if (name.trim().length < 1) { setErr('Please add your name.'); return; }
    if (body.trim().length < 10) { setErr('Please write at least 10 characters.'); return; }
    setBusy(true); setErr('');
    try {
      if (!supabase) throw new Error('Cloud is not configured.');
      const { error } = await supabase.rpc('submit_review', {
        p_name: name.trim(),
        p_body: body.trim(),
        p_rating: rating,
        p_email: email.trim() || null,
      });
      if (error) throw error;
      toast({ title: 'Thank you', msg: 'Your review will appear once a person reads it.' });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not send that review.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Write a review" description="Reviewed by a person before it appears. Not instant, on purpose." onClose={busy ? () => {} : onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 7 }}>Your rating</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {[1, 2, 3, 4, 5].map((i) => (
              <button key={i} onClick={() => setRating(i)} aria-label={`${i} star${i === 1 ? '' : 's'}`} style={{ background: 'none', border: 0, cursor: 'pointer', padding: 2 }}>
                <Star size={22} style={{ color: i <= rating ? "var(--green-deep)" : "var(--ink-4)", fill: i <= rating ? "var(--green-deep)" : "none" }} />
              </button>
            ))}
          </div>
        </div>
        <label className="ws-field">
          <span>Name</span>
          <input className="ws-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="How you want to be credited" />
        </label>
        <label className="ws-field">
          <span>Email <em style={{ color: 'var(--ink-4)', fontStyle: 'normal' }}>(optional, never shown)</em></span>
          <input className="ws-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} placeholder="only if you want a reply" />
        </label>
        <label className="ws-field">
          <span>Your review</span>
          <textarea className="ws-input" value={body} onChange={(e) => setBody(e.target.value)} rows={5} maxLength={2000} placeholder="What works for you? What would you change?" />
          <small>{body.trim().length}/2000</small>
        </label>
        {err && <div className="ws-error-banner" role="alert"><span>{err}</span></div>}
        <div className="ws-info-strip">
          <ShieldCheck size={16} />
          <div>Reviews are queued for moderation.<small>Nothing you write appears publicly until an administrator approves it.</small></div>
        </div>
        <div className="ws-modal-actions">
          <AppButton onClick={() => { void submit(); }} disabled={busy}>{busy ? 'Sending…' : 'Submit review'}</AppButton>
          <AppButton variant="ghost" disabled={busy} onClick={onClose}>Cancel</AppButton>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Public bug report form. Posts to the same queue the admin panel reads.
 * Works signed out — a broken build often cannot authenticate.
 */
export function BugReportForm() {
  const { toast } = useStore();
  const [summary, setSummary] = useState('');
  const [details, setDetails] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    if (summary.trim().length < 4) { setErr('Please describe the problem in a few words.'); return; }
    setBusy(true); setErr('');
    try {
      if (!supabase) throw new Error('Cloud is not configured.');
      const { error } = await supabase.rpc('submit_bug_report', {
        p_summary: summary.trim(),
        p_details: details.trim(),
        p_area: 'general',
        p_email: email.trim() || null,
        p_version: '',
        p_platform: navigator.platform || '',
      });
      if (error) throw error;
      toast({ title: 'Report sent', msg: 'Thank you — this reaches the developer directly.' });
      setSummary(''); setDetails(''); setEmail('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not send that report.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-6">
      <SectionHeading title="Report a problem" sub="Goes straight to the developer. No account needed." />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
        <input className="ws-input" value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={200} placeholder="Short summary — what went wrong?" />
        <textarea className="ws-input" value={details} onChange={(e) => setDetails(e.target.value)} rows={4} maxLength={20000} placeholder="Steps to reproduce, what you expected, what happened instead" />
        <input className="ws-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} placeholder="Email (optional, for follow-up)" />
        {err && <div className="ws-error-banner" role="alert"><span>{err}</span></div>}
        <div>
          <AppButton onClick={() => { void submit(); }} disabled={busy}>{busy ? 'Sending…' : 'Send report'}</AppButton>
        </div>
      </div>
    </div>
  );
}