import { useEffect, useId, useRef, useState } from 'react';
import { CircleCheck, ImageOff, Link2, Trash2, Upload } from 'lucide-react';
import { api } from '../lib/api.js';
import { ACCEPTED_IMAGE_TYPES, forgetPrivateImage, prepareImage } from '../lib/images.js';
import { cardsLabel, cx, formatBytes, parseHttpUrl } from '../lib/utils.js';
import { CardImage } from './CardImage.jsx';
import { Dialog } from './Dialog.jsx';
import { Alert, Button, FieldMessage, IconButton, Spinner, TextField, inputClass } from './ui.jsx';

const IMAGE_SIDES = [
  { value: 'front', label: 'Awers' },
  { value: 'back', label: 'Rewers' },
  { value: 'both', label: 'Obie strony' },
];

const NO_IMAGE = { kind: 'none' };

// Zapamiętuje wybór „Dodaj kolejną” do końca wizyty na stronie.
let addAnotherPreference = false;

/** Stan obrazka w formularzu na podstawie edytowanej fiszki. */
function initialImage(card) {
  if (!card?.image) return NO_IMAGE;
  if (card.image.kind === 'url') return { kind: 'url', url: card.image.src };
  return { kind: 'existing', image: card.image };
}

/** Podgląd obrazka spod adresu URL — z krótkim opóźnieniem, żeby nie ładować go po każdym znaku. */
function UrlPreview({ url }) {
  const [shownUrl, setShownUrl] = useState(url);
  const [failedUrl, setFailedUrl] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => setShownUrl(url), 350);
    return () => clearTimeout(timer);
  }, [url]);

  if (failedUrl === shownUrl) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-xl bg-subtle px-4 text-center text-sm text-muted">
        <ImageOff className="size-5" aria-hidden="true" />
        <p>Nie udało się wczytać obrazka z tego adresu. Sprawdź, czy link prowadzi bezpośrednio do pliku graficznego.</p>
      </div>
    );
  }

  return (
    <div className="flex h-40 items-center justify-center rounded-xl bg-subtle p-2">
      <img
        src={shownUrl}
        alt="Podgląd obrazka"
        referrerPolicy="no-referrer"
        onError={() => setFailedUrl(shownUrl)}
        className="max-h-full max-w-full rounded-lg object-contain"
      />
    </div>
  );
}

/**
 * Formularz dodawania fiszki do zestawu albo edycji istniejącej (gdy przekazano `card`).
 * Obrazek można wybrać z dysku, przeciągnąć, wkleić ze schowka albo podać jako adres URL.
 *
 * @param {object} props
 * @param {number} props.deckId
 * @param {object} [props.card]
 * @param {() => void} props.onClose
 * @param {(card: object) => void} props.onSaved wywoływane po każdym udanym zapisie
 */
export function CardFormDialog({ deckId, card, onClose, onSaved }) {
  const isEdit = Boolean(card);
  const formId = useId();
  const frontRef = useRef(null);
  const backRef = useRef(null);
  const urlRef = useRef(null);
  const fileInputRef = useRef(null);
  const mounted = useRef(true);

  const [front, setFront] = useState(card?.front ?? '');
  const [back, setBack] = useState(card?.back ?? '');
  const [image, setImage] = useState(() => initialImage(card));
  const [imageSide, setImageSide] = useState(card?.imageSide ?? 'both');
  const [addAnother, setAddAnother] = useState(addAnotherPreference);
  const [addedCount, setAddedCount] = useState(0);
  const [preparing, setPreparing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Adres podglądu pliku (blob:) zwalniamy, gdy obrazek się zmieni albo okno zostanie zamknięte.
  useEffect(() => {
    if (image.kind !== 'file') return undefined;
    return () => URL.revokeObjectURL(image.previewUrl);
  }, [image]);

  const validUrl = image.kind === 'url' ? parseHttpUrl(image.url) : null;
  const hasImage = image.kind === 'file' || image.kind === 'existing' || Boolean(validUrl);

  const clearError = (key) => setErrors((current) => (current[key] ? { ...current, [key]: undefined } : current));

  async function chooseFile(file) {
    if (!file || busy) return;
    clearError('image');
    setPreparing(true);
    try {
      const prepared = await prepareImage(file);
      if (!mounted.current) return;
      setImage({ kind: 'file', file: prepared, previewUrl: URL.createObjectURL(prepared) });
    } catch (err) {
      if (mounted.current) setErrors((current) => ({ ...current, image: err.message }));
    } finally {
      if (mounted.current) setPreparing(false);
      if (fileInputRef.current) fileInputRef.current.value = ''; // pozwala wybrać ponownie ten sam plik
    }
  }

  function removeImage() {
    setImage(NO_IMAGE);
    clearError('image');
    clearError('imageUrl');
  }

  function handlePaste(event) {
    const file = [...(event.clipboardData?.files ?? [])].find((item) => item.type.startsWith('image/'));
    if (!file) return; // zwykłe wklejanie tekstu zostawiamy przeglądarce
    event.preventDefault();
    chooseFile(file);
  }

  const isFileDrag = (event) => [...(event.dataTransfer?.types ?? [])].includes('Files');

  // Cały formularz przyjmuje upuszczony plik (zastępuje on dotychczasowy obrazek).
  const dropHandlers = {
    onDragOver(event) {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      setDragging(true);
    },
    onDragLeave(event) {
      if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false);
    },
    onDrop(event) {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      setDragging(false);
      chooseFile(event.dataTransfer.files?.[0]);
    },
  };

  // Plik upuszczony obok formularza przeglądarka otworzyłaby zamiast aplikacji — blokujemy to.
  useEffect(() => {
    const prevent = (event) => {
      if (isFileDrag(event)) event.preventDefault();
    };
    window.addEventListener('dragover', prevent);
    window.addEventListener('drop', prevent);
    return () => {
      window.removeEventListener('dragover', prevent);
      window.removeEventListener('drop', prevent);
    };
  }, []);

  async function handleSubmit(event) {
    event?.preventDefault();
    if (busy || preparing) return;

    const nextErrors = {};
    if (!front.trim()) nextErrors.front = 'Uzupełnij treść awersu.';
    if (!back.trim()) nextErrors.back = 'Uzupełnij treść rewersu.';
    if (image.kind === 'url' && image.url.trim() && !validUrl) {
      nextErrors.imageUrl = 'Podaj poprawny adres obrazka zaczynający się od http:// lub https://.';
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      (nextErrors.front ? frontRef : nextErrors.back ? backRef : urlRef).current?.focus();
      return;
    }

    let body;
    if (image.kind === 'file') {
      // Plik wymaga formatu multipart/form-data.
      body = new FormData();
      body.set('front', front);
      body.set('back', back);
      body.set('imageSide', imageSide);
      body.set('image', image.file, image.file.name);
    } else {
      body = { front, back, imageSide };
      if (validUrl) body.imageUrl = validUrl;
      else if (isEdit && card.image && image.kind !== 'existing') body.removeImage = true;
    }

    setBusy(true);
    setErrors({});
    setFormError(null);
    try {
      const { card: saved } = isEdit
        ? await api(`/cards/${card.id}`, { method: 'PATCH', body })
        : await api(`/decks/${deckId}/cards`, { method: 'POST', body });

      // Podmieniony lub usunięty plik nie będzie już potrzebny w pamięci przeglądarki.
      if (isEdit && card.image?.kind === 'upload' && card.image.src !== saved.image?.src) {
        forgetPrivateImage(card.image.src);
      }

      onSaved(saved);

      if (!isEdit && addAnother) {
        setFront('');
        setBack('');
        setImage(NO_IMAGE);
        setAddedCount((count) => count + 1);
        setBusy(false);
        frontRef.current?.focus();
      } else {
        onClose();
      }
    } catch (err) {
      setBusy(false);
      const fields = err.fields ?? {};
      setErrors(fields);
      if (!fields.front && !fields.back && !fields.image && !fields.imageUrl) setFormError(err.message);
    }
  }

  function handleKeyDown(event) {
    // Ctrl/Cmd + Enter zapisuje fiszkę także z pola wielowierszowego.
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) handleSubmit(event);
  }

  return (
    <Dialog
      title={isEdit ? 'Edytuj fiszkę' : 'Nowa fiszka'}
      onClose={onClose}
      busy={busy}
      dismissOnBackdrop={false}
      footer={
        <>
          {isEdit ? null : (
            <div className="flex w-full items-center justify-between gap-3 sm:mr-auto sm:block sm:w-auto">
              <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-ink">
                <input
                  type="checkbox"
                  checked={addAnother}
                  onChange={(event) => {
                    addAnotherPreference = event.target.checked;
                    setAddAnother(event.target.checked);
                  }}
                  className="size-4 accent-accent"
                />
                Dodaj kolejną
              </label>
              <p role="status" className="flex items-center gap-1.5 text-xs text-muted sm:mt-1 sm:min-h-5">
                {addedCount > 0 ? (
                  <>
                    <CircleCheck className="size-3.5 text-accent" aria-hidden="true" />
                    Dodano {cardsLabel(addedCount)}
                  </>
                ) : null}
              </p>
            </div>
          )}
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {addedCount > 0 ? 'Zamknij' : 'Anuluj'}
          </Button>
          <Button variant="primary" type="submit" form={formId} loading={busy} disabled={preparing}>
            {isEdit ? 'Zapisz zmiany' : 'Dodaj fiszkę'}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={handleSubmit}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        {...dropHandlers}
        noValidate
        className={cx('grid gap-5 rounded-xl outline-2 outline-offset-8', dragging && image.kind !== 'none' ? 'outline-dashed outline-accent' : 'outline-transparent')}
      >
        <TextField
          ref={frontRef}
          label={
            <>
              Awers <span className="font-normal text-muted">— pytanie lub pojęcie</span>
            </>
          }
          multiline
          rows={2}
          value={front}
          onChange={(event) => {
            setFront(event.target.value);
            clearError('front');
          }}
          error={errors.front}
          maxLength={2000}
          required
          data-autofocus
        />
        <TextField
          ref={backRef}
          label={
            <>
              Rewers <span className="font-normal text-muted">— odpowiedź lub definicja</span>
            </>
          }
          multiline
          rows={2}
          value={back}
          onChange={(event) => {
            setBack(event.target.value);
            clearError('back');
          }}
          error={errors.back}
          maxLength={2000}
          required
        />

        <div>
          <p className="mb-1.5 text-sm font-medium text-ink">
            Obrazek <span className="font-normal text-muted">(opcjonalnie)</span>
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_IMAGE_TYPES.join(',')}
            onChange={(event) => chooseFile(event.target.files?.[0])}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
          />

          {image.kind === 'none' ? (
            <div
              className={cx(
                'rounded-xl border border-dashed px-4 py-5 text-center transition-colors',
                dragging ? 'border-accent bg-accent-soft' : 'border-line-strong',
              )}
            >
              {preparing ? (
                <p className="flex h-9 items-center justify-center gap-2 text-sm text-muted">
                  <Spinner className="size-4" /> Przygotowuję obraz…
                </p>
              ) : (
                <div className="flex flex-wrap items-center justify-center gap-2.5">
                  <Button size="sm" icon={Upload} onClick={() => fileInputRef.current?.click()}>
                    Wybierz z dysku
                  </Button>
                  <Button size="sm" icon={Link2} onClick={() => setImage({ kind: 'url', url: '' })}>
                    Wklej adres URL
                  </Button>
                </div>
              )}
              <p className="mt-3 text-xs leading-relaxed text-muted">
                JPG, PNG, WebP, GIF lub AVIF, do 5 MB. Plik można też przeciągnąć tutaj albo wkleić ze schowka.
              </p>
            </div>
          ) : null}

          {image.kind === 'url' ? (
            <div className="grid gap-3">
              <div className="flex gap-2">
                <input
                  ref={urlRef}
                  type="url"
                  inputMode="url"
                  value={image.url}
                  onChange={(event) => {
                    setImage({ kind: 'url', url: event.target.value });
                    clearError('imageUrl');
                  }}
                  placeholder="https://example.com/obrazek.jpg"
                  aria-label="Adres URL obrazka"
                  autoFocus
                  aria-invalid={errors.imageUrl ? true : undefined}
                  aria-describedby={errors.imageUrl ? `${formId}-url-error` : undefined}
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={2000}
                  className={inputClass}
                />
                <IconButton label="Usuń obrazek" icon={Trash2} variant="danger-ghost" size="lg" onClick={removeImage} />
              </div>
              <FieldMessage id={`${formId}-url-error`} error={errors.imageUrl} />
              {validUrl ? <UrlPreview url={validUrl} /> : null}
            </div>
          ) : null}

          {image.kind === 'file' || image.kind === 'existing' ? (
            <div className="rounded-xl border border-line p-2">
              <div className="flex h-40 items-center justify-center rounded-lg bg-subtle p-2">
                {image.kind === 'file' ? (
                  <img src={image.previewUrl} alt="Podgląd obrazka" className="max-h-full max-w-full rounded-lg object-contain" />
                ) : (
                  <CardImage image={image.image} alt="Obecny obrazek fiszki" className="size-full" />
                )}
              </div>
              <div className="flex items-center justify-between gap-3 pl-2 pt-2">
                <p className="min-w-0 truncate text-sm text-muted">
                  {image.kind === 'file' ? `${image.file.name} · ${formatBytes(image.file.size)}` : 'Obecny obrazek'}
                </p>
                <div className="flex shrink-0 gap-1">
                  <Button size="sm" variant="ghost" icon={Upload} onClick={() => fileInputRef.current?.click()} disabled={preparing}>
                    Zmień
                  </Button>
                  <Button size="sm" variant="danger-ghost" icon={Trash2} onClick={removeImage}>
                    Usuń
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          <FieldMessage error={errors.image} />

          {hasImage ? (
            <fieldset className="mt-4">
              <legend className="mb-1.5 text-sm font-medium text-ink">Pokaż obrazek na</legend>
              <div className="inline-flex rounded-xl bg-subtle p-1">
                {IMAGE_SIDES.map((option) => (
                  <label key={option.value} className="cursor-pointer">
                    <input
                      type="radio"
                      name={`${formId}-image-side`}
                      value={option.value}
                      checked={imageSide === option.value}
                      onChange={() => setImageSide(option.value)}
                      className="peer sr-only"
                    />
                    <span className="block rounded-lg px-3.5 py-1.5 text-sm font-medium text-muted transition-colors peer-checked:bg-surface peer-checked:text-ink peer-checked:shadow-sm peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent">
                      {option.label}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
        </div>

        {formError ? <Alert>{formError}</Alert> : null}
      </form>
    </Dialog>
  );
}
