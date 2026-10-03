import { useEffect, useRef, type ReactNode } from 'react';
import { ArrowUpRight, Check, LoaderCircle, X, type LucideIcon } from 'lucide-react';
import { relativeTime } from './types';

export function AppButton({ children, icon: Icon, variant = 'primary', className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: LucideIcon; variant?: 'primary' | 'soft' | 'ghost' | 'outline' | 'danger' }) {
  return <button {...props} className={`ws-button ws-button-${variant} ${className}`}>{Icon && <Icon size={16} strokeWidth={1.8} />}{children}</button>;
}

export function IconButton({ icon: Icon, label, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string }) {
  return <button {...props} className={`ws-icon-button ${props.className || ''}`} title={label} aria-label={label}><Icon size={18} strokeWidth={1.7} /></button>;
}

export function Avatar({ name, color, size = 32 }: { name: string; color?: string; size?: number }) {
  return <span className="ws-avatar" style={{ width: size, height: size, background: color || '#b7cba4', fontSize: size * .34 }} aria-label={name}>{name.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase()}</span>;
}

export function Modal({ title, description, children, onClose, wide = false }: { title: string; description?: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const dialog = ref.current!;
    const lastActive = document.activeElement as HTMLElement;
    dialog.showModal();
    return () => { dialog.close(); lastActive?.focus?.(); };
  }, []);
  return <dialog ref={ref} className={`ws-modal ${wide ? 'ws-modal-wide' : ''}`} aria-labelledby="ws-dialog-title" onCancel={(e) => { e.preventDefault(); closeRef.current(); }} onClick={(e) => { if (e.target === e.currentTarget) { const box = e.currentTarget.getBoundingClientRect(); if (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom) onClose(); } }}>
    <div className="ws-modal-head"><div><h2 id="ws-dialog-title">{title}</h2>{description && <p>{description}</p>}</div><IconButton label="Close dialog" icon={X} onClick={onClose} /></div>
    <div className="ws-modal-body">{children}</div>
  </dialog>;
}

export function PageHeading({ eyebrow, title, description, children }: { eyebrow?: string; title: string; description: string; children?: ReactNode }) {
  return <header className="ws-page-heading"><div>{eyebrow && <div className="ws-eyebrow">{eyebrow}</div>}<h1>{title}</h1><p>{description}</p></div>{children && <div className="ws-heading-actions">{children}</div>}</header>;
}

export function SectionHeading({ title, sub, action, onAction }: { title: string; sub?: string; action?: string; onAction?: () => void }) {
  return <div className="ws-section-heading"><div><h2>{title}</h2>{sub && <p>{sub}</p>}</div>{action && <button className="ws-text-button" onClick={onAction}>{action}<ArrowUpRight size={14} /></button>}</div>;
}

export function Empty({ icon: Icon, title, body, children }: { icon: LucideIcon; title: string; body: string; children?: ReactNode }) {
  return <div className="ws-empty"><span><Icon size={24} strokeWidth={1.4} /></span><h3>{title}</h3><p>{body}</p>{children}</div>;
}

export function Loading({ label = 'Getting your workspace ready' }: { label?: string }) {
  return <div className="ws-loading"><LoaderCircle size={24} className="ws-spin" /><p>{label}</p></div>;
}

export function Tag({ children, color = 'neutral' }: { children: ReactNode; color?: 'neutral' | 'green' | 'purple' | 'orange' | 'blue' }) {
  return <span className={`ws-tag ws-tag-${color}`}>{children}</span>;
}

export function CheckButton({ checked, onChange, disabled, label }: { checked: boolean; onChange: () => void; disabled?: boolean; label: string }) {
  return <button className={`ws-checkbox ${checked ? 'is-checked' : ''}`} role="checkbox" aria-checked={checked} aria-label={label} disabled={disabled} onClick={onChange}>{checked && <Check size={12} strokeWidth={3} />}</button>;
}

export function Time({ value }: { value: string }) {
  return <time dateTime={value} title={new Date(value).toLocaleString()}>{relativeTime(value)}</time>;
}

export function downloadText(filename: string, text: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Switch({ checked, onChange, label, disabled = false }: { checked: boolean; onChange: () => void; label: string; disabled?: boolean }) {
  return <button className={`ws-switch ${checked ? 'is-on' : ''}`} type="button" role="switch" aria-checked={checked} aria-label={label} onClick={onChange} disabled={disabled}><span /></button>;
}