import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { cx } from '../lib/utils.js';

/**
 * Wspólna logika rozwijanych paneli: zamykanie klawiszem Esc i kliknięciem poza panelem.
 * Zwraca stan oraz referencje do kontenera i przycisku otwierającego.
 */
export function usePopover() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const triggerRef = useRef(null);

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, close]);

  return { open, setOpen, close, containerRef, triggerRef };
}

export const popoverPanelClass =
  'absolute top-full z-30 mt-1.5 rounded-2xl border border-line bg-surface shadow-pop animate-pop-in';

const MenuContext = createContext(() => {});

/**
 * Menu rozwijane. `trigger` to funkcja renderująca przycisk — dostaje właściwości,
 * które trzeba na niego przenieść (ref, aria-*, onClick).
 */
export function Menu({ label, trigger, align = 'right', className, children }) {
  const { open, setOpen, close, containerRef, triggerRef } = usePopover();
  const menuRef = useRef(null);

  useEffect(() => {
    if (open) menuRef.current?.querySelector('[role="menuitem"]')?.focus();
  }, [open]);

  function handleKeyDown(event) {
    const items = [...menuRef.current.querySelectorAll('[role="menuitem"]')];
    const index = items.indexOf(document.activeElement);
    const focusItem = (nextIndex) => {
      event.preventDefault();
      items[(nextIndex + items.length) % items.length]?.focus();
    };

    if (event.key === 'ArrowDown') focusItem(index + 1);
    else if (event.key === 'ArrowUp') focusItem(index - 1);
    else if (event.key === 'Home') focusItem(0);
    else if (event.key === 'End') focusItem(items.length - 1);
    else if (event.key === 'Tab') setOpen(false);
  }

  return (
    <div ref={containerRef} className={cx('relative', open ? 'z-30' : 'z-10', className)}>
      {trigger({
        ref: triggerRef,
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        onClick: () => setOpen((value) => !value),
      })}
      {open ? (
        <div
          ref={menuRef}
          role="menu"
          tabIndex={-1}
          aria-label={label}
          onKeyDown={handleKeyDown}
          className={cx(popoverPanelClass, 'min-w-52 p-1.5', align === 'right' ? 'right-0' : 'left-0')}
        >
          <MenuContext.Provider value={close}>{children}</MenuContext.Provider>
        </div>
      ) : null}
    </div>
  );
}

/** Pozycja menu: przycisk (`onSelect`) albo odnośnik (`to`). */
export function MenuItem({ icon: Icon, danger = false, onSelect, to, children }) {
  const close = useContext(MenuContext);
  const className = cx(
    'flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium outline-hidden',
    danger ? 'text-danger hover:bg-danger-soft focus-visible:bg-danger-soft' : 'text-ink hover:bg-subtle focus-visible:bg-subtle',
  );
  const content = (
    <>
      {Icon ? <Icon className="size-4 shrink-0" aria-hidden="true" /> : null}
      {children}
    </>
  );

  if (to) {
    return (
      <Link role="menuitem" to={to} className={className} onClick={() => close(false)}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      role="menuitem"
      className={className}
      onClick={() => {
        close();
        onSelect?.();
      }}
    >
      {content}
    </button>
  );
}
