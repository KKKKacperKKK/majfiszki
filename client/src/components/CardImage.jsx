import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import { useCardImageSrc, useInView } from '../lib/hooks.js';
import { cx } from '../lib/utils.js';

/**
 * Obrazek fiszki — zarówno przesłany na serwer (pobierany z tokenem), jak i z zewnętrznego adresu URL.
 *
 * @param {object} props
 * @param {{ kind: 'upload' | 'url', src: string }} props.image
 * @param {'contain' | 'cover'} [props.variant] `contain` — cały obrazek z zaokrąglonymi rogami (tryb nauki),
 *                                              `cover` — miniatura wypełniająca ramkę
 * @param {boolean} [props.lazy] wczytuj dopiero, gdy element zbliży się do widocznego obszaru (długie listy)
 */
export function CardImage({ image, variant = 'contain', lazy = false, alt = 'Ilustracja fiszki', className }) {
  const [ref, inView] = useInView(lazy);
  const { src, status } = useCardImageSrc(image, inView);
  const [failedSrc, setFailedSrc] = useState(null);
  const [loadedSrc, setLoadedSrc] = useState(null);

  const isCover = variant === 'cover';
  const broken = status === 'error' || (src !== null && failedSrc === src);

  let content;
  if (broken) {
    content = (
      <div className="flex flex-col items-center gap-1.5 text-center text-muted">
        <ImageOff className="size-5" aria-hidden="true" />
        <span className={isCover ? 'sr-only' : 'text-xs'}>Nie udało się wczytać obrazka</span>
      </div>
    );
  } else if (src) {
    content = (
      <img
        src={src}
        alt={alt}
        referrerPolicy="no-referrer"
        decoding="async"
        loading={lazy ? 'lazy' : undefined}
        draggable={false}
        onLoad={() => setLoadedSrc(src)}
        onError={() => setFailedSrc(src)}
        className={cx(
          'transition-opacity duration-200',
          isCover ? 'size-full object-cover' : 'max-h-full max-w-full rounded-2xl object-contain',
          loadedSrc === src ? 'opacity-100' : 'opacity-0',
        )}
      />
    );
  } else {
    content = <div className={cx('animate-pulse bg-subtle', isCover ? 'size-full' : 'h-full w-3/5 rounded-2xl')} aria-hidden="true" />;
  }

  return (
    <div ref={ref} className={cx('flex items-center justify-center', isCover && 'overflow-hidden bg-subtle', className)}>
      {content}
    </div>
  );
}
