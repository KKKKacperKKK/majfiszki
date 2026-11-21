import { useId, useState } from 'react';
import { api } from '../lib/api.js';
import { AUTO } from '../lib/lang.js';
import { Dialog } from './Dialog.jsx';
import { SpeechLanguagePicker } from './SpeechLanguagePicker.jsx';
import { Alert, Button, TextField } from './ui.jsx';

/**
 * Formularz tworzenia nowego zestawu albo edycji istniejącego (gdy przekazano `deck`).
 * @param {object} props
 * @param {object} [props.deck]
 * @param {{ front: string | null, back: string | null }} [props.detected] języki rozpoznane w fiszkach zestawu
 * @param {() => void} props.onClose
 * @param {(deck: object) => void} props.onSaved
 */
export function DeckFormDialog({ deck, detected, onClose, onSaved }) {
  const isEdit = Boolean(deck);
  const formId = useId();

  const [name, setName] = useState(deck?.name ?? '');
  const [description, setDescription] = useState(deck?.description ?? '');
  const [languages, setLanguages] = useState({ frontLang: deck?.frontLang ?? AUTO, backLang: deck?.backLang ?? AUTO });
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();
    if (busy) return;

    if (!name.trim()) {
      setErrors({ name: 'Podaj nazwę zestawu.' });
      return;
    }

    setBusy(true);
    setErrors({});
    setFormError(null);
    try {
      const body = { name, description, ...languages };
      const { deck: saved } = isEdit
        ? await api(`/decks/${deck.id}`, { method: 'PATCH', body })
        : await api('/decks', { method: 'POST', body });
      onSaved(saved);
    } catch (err) {
      setBusy(false);
      const fields = err.fields ?? {};
      setErrors(fields);
      if (!fields.name && !fields.description) setFormError(err.message);
    }
  }

  return (
    <Dialog
      title={isEdit ? 'Edytuj zestaw' : 'Nowy zestaw'}
      onClose={onClose}
      busy={busy}
      dismissOnBackdrop={false}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Anuluj
          </Button>
          <Button variant="primary" type="submit" form={formId} loading={busy}>
            {isEdit ? 'Zapisz zmiany' : 'Utwórz zestaw'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} noValidate className="grid gap-5">
        <TextField
          label="Nazwa zestawu"
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={errors.name}
          maxLength={80}
          placeholder="np. Angielski — podróże"
          autoComplete="off"
          required
          data-autofocus
        />
        <TextField
          label="Opis"
          optional
          multiline
          rows={2}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          error={errors.description}
          maxLength={300}
          placeholder="O czym jest ten zestaw?"
        />
        <fieldset>
          <legend className="text-sm font-semibold text-ink">Odczyt na głos</legend>
          <p className="mb-3 mt-1 text-sm text-muted">
            Język, w którym przeglądarka czyta fiszki. W trybie automatycznym jest rozpoznawany na podstawie treści.
          </p>
          <SpeechLanguagePicker
            value={languages}
            detected={detected}
            disabled={busy}
            onChange={(patch) => setLanguages((current) => ({ ...current, ...patch }))}
          />
        </fieldset>
        {formError ? <Alert>{formError}</Alert> : null}
      </form>
    </Dialog>
  );
}
