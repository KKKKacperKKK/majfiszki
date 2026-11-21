import { useId } from 'react';
import { CircleAlert, LoaderCircle } from 'lucide-react';
import { Link } from 'react-router';
import { cx } from '../lib/utils.js';

// ── Przyciski ──────────────────────────────────────────────────────────────
const BUTTON_BASE =
  'inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-xl font-medium transition-colors duration-150 select-none disabled:pointer-events-none disabled:opacity-50';

const BUTTON_VARIANTS = {
  primary: 'bg-ink text-canvas hover:bg-ink/85 active:bg-ink/75',
  secondary: 'border border-line-strong bg-surface text-ink hover:bg-subtle active:bg-line',
  ghost: 'text-muted hover:bg-subtle hover:text-ink active:bg-line',
  danger: 'bg-danger text-on-danger hover:bg-danger/90 active:bg-danger/80',
  'danger-ghost': 'text-muted hover:bg-danger-soft hover:text-danger active:bg-danger-soft',
  'danger-outline': 'border border-danger/40 bg-surface text-danger hover:bg-danger-soft',
  'accent-soft': 'bg-accent-soft text-accent hover:bg-accent-soft/70',
};

const BUTTON_SIZES = {
  sm: 'h-9 gap-1.5 px-3 text-sm',
  md: 'h-11 gap-2 px-4 text-[15px]',
  lg: 'h-12 gap-2.5 px-6 text-base',
};

export function buttonClass({ variant = 'secondary', size = 'md', className } = {}) {
  return cx(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className);
}

export function Spinner({ className }) {
  return <LoaderCircle className={cx('animate-spin', className)} aria-hidden="true" />;
}

function ButtonContent({ icon: Icon, loading, children }) {
  return (
    <>
      {loading ? <Spinner className="size-[18px]" /> : Icon ? <Icon className="size-[18px]" aria-hidden="true" /> : null}
      {children}
    </>
  );
}

export function Button({ variant, size, icon, loading = false, disabled, className, children, type = 'button', ...props }) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClass({ variant, size, className })}
      {...props}
    >
      <ButtonContent icon={icon} loading={loading}>
        {children}
      </ButtonContent>
    </button>
  );
}

/** Odnośnik wyglądający jak przycisk. */
export function ButtonLink({ variant, size, icon, className, children, ...props }) {
  return (
    <Link className={buttonClass({ variant, size, className })} {...props}>
      <ButtonContent icon={icon}>{children}</ButtonContent>
    </Link>
  );
}

const ICON_BUTTON_SIZES = { sm: 'size-9', md: 'size-10', lg: 'size-11' };

/** Przycisk z samą ikoną; `label` trafia do czytników ekranu i podpowiedzi po najechaniu. */
export function IconButton({ label, icon: Icon, variant = 'ghost', size = 'md', className, ...props }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(BUTTON_BASE, BUTTON_VARIANTS[variant], ICON_BUTTON_SIZES[size], className)}
      {...props}
    >
      <Icon className="size-[18px]" aria-hidden="true" />
    </button>
  );
}

/** Odnośnik z samą ikoną. */
export function IconLink({ label, icon: Icon, variant = 'ghost', size = 'md', className, ...props }) {
  return (
    <Link aria-label={label} title={label} className={cx(BUTTON_BASE, BUTTON_VARIANTS[variant], ICON_BUTTON_SIZES[size], className)} {...props}>
      <Icon className="size-[18px]" aria-hidden="true" />
    </Link>
  );
}

// ── Pola formularzy ────────────────────────────────────────────────────────
export const inputClass =
  'block w-full rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-base text-ink placeholder:text-faint ' +
  'transition-[border-color,box-shadow] duration-150 outline-hidden focus:border-accent focus:ring-3 focus:ring-accent/20 ' +
  'aria-invalid:border-danger aria-invalid:focus:ring-danger/20 disabled:opacity-60';

export function FieldLabel({ htmlFor, optional, children }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-ink">
      {children}
      {optional ? <span className="font-normal text-muted"> (opcjonalnie)</span> : null}
    </label>
  );
}

export function FieldMessage({ id, error, hint }) {
  if (error) {
    return (
      <p id={id} role="alert" className="mt-1.5 text-sm text-danger">
        {error}
      </p>
    );
  }
  if (hint) {
    return (
      <p id={id} className="mt-1.5 text-sm text-muted">
        {hint}
      </p>
    );
  }
  return null;
}

/**
 * Pole tekstowe z etykietą, podpowiedzią i komunikatem błędu.
 * `multiline` zamienia je w <textarea>; `trailing` to element wstawiany po prawej stronie pola.
 */
export function TextField({ label, hint, error, optional, multiline = false, trailing, className, inputClassName, ...props }) {
  const id = useId();
  const messageId = error || hint ? `${id}-message` : undefined;
  const Control = multiline ? 'textarea' : 'input';

  return (
    <div className={className}>
      <FieldLabel htmlFor={id} optional={optional}>
        {label}
      </FieldLabel>
      <div className="relative">
        <Control
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={messageId}
          className={cx(inputClass, multiline && 'field-sizing-content max-h-56 min-h-[4.5rem] resize-y', trailing && 'pr-12', inputClassName)}
          {...props}
        />
        {trailing ? <div className="absolute inset-y-0 right-1 flex items-center">{trailing}</div> : null}
      </div>
      <FieldMessage id={messageId} error={error} hint={hint} />
    </div>
  );
}

// ── Komunikaty i stany ─────────────────────────────────────────────────────
export function Alert({ children, tone = 'danger', className }) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cx(
        'flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-sm',
        tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-accent-soft text-ink',
        className,
      )}
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Wyśrodkowany komunikat z ikoną: pusty stan, błąd wczytywania, „nie znaleziono”. */
export function StatePanel({ icon: Icon, title, children, actions, className }) {
  return (
    <div className={cx('mx-auto flex max-w-md flex-col items-center px-4 py-14 text-center', className)}>
      {Icon ? (
        <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-subtle text-muted">
          <Icon className="size-6" aria-hidden="true" />
        </div>
      ) : null}
      <h2 className="font-serif text-2xl font-semibold tracking-tight text-balance">{title}</h2>
      {children ? <div className="mt-2 text-[15px] leading-relaxed text-muted text-pretty">{children}</div> : null}
      {actions ? <div className="mt-6 flex flex-wrap items-center justify-center gap-3">{actions}</div> : null}
    </div>
  );
}

export function Skeleton({ className }) {
  return <div className={cx('animate-pulse rounded-xl bg-subtle', className)} aria-hidden="true" />;
}

export function Logo({ className }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect className="fill-accent" x="10" y="3.5" width="17" height="22" rx="4.5" transform="rotate(12 18.5 14.5)" />
      <rect className="fill-ink" x="4.5" y="6.5" width="17" height="22" rx="4.5" />
      <path className="stroke-canvas" d="M9.5 13.5h7M9.5 18.5h4.5" fill="none" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
