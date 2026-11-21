import { useId, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { Dialog } from '../components/Dialog.jsx';
import { PasswordField } from '../components/PasswordField.jsx';
import { useToast } from '../components/Toast.jsx';
import { Alert, Button } from '../components/ui.jsx';
import { useAuth } from '../lib/auth.jsx';
import { useDocumentTitle } from '../lib/hooks.js';

const dateFormat = new Intl.DateTimeFormat('pl-PL', { dateStyle: 'long' });

function Section({ title, children }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <h2 className="font-serif text-xl font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

function ChangePasswordForm() {
  const { user, changePassword } = useAuth();
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();
    if (busy) return;

    const problems = {};
    if (!currentPassword) problems.currentPassword = 'Podaj obecne hasło.';
    if ([...newPassword].length < 8) problems.newPassword = 'Hasło musi mieć co najmniej 8 znaków.';
    if (Object.keys(problems).length > 0) {
      setErrors(problems);
      return;
    }

    setBusy(true);
    setErrors({});
    setFormError(null);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      toast('Hasło zostało zmienione. Pozostałe urządzenia zostały wylogowane.');
    } catch (err) {
      const fields = err.fields ?? {};
      setErrors(fields);
      if (!fields.currentPassword && !fields.newPassword) setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="mt-4 grid gap-4">
      {/* Ukryte pole z nazwą użytkownika pozwala menedżerom haseł zaktualizować właściwy wpis. */}
      <input type="text" name="username" autoComplete="username" value={user.username} readOnly hidden />
      <PasswordField
        label="Obecne hasło"
        name="current-password"
        value={currentPassword}
        onChange={(event) => setCurrentPassword(event.target.value)}
        error={errors.currentPassword}
        autoComplete="current-password"
      />
      <PasswordField
        label="Nowe hasło"
        name="new-password"
        value={newPassword}
        onChange={(event) => setNewPassword(event.target.value)}
        error={errors.newPassword}
        hint="Co najmniej 8 znaków."
        autoComplete="new-password"
      />
      {formError ? <Alert>{formError}</Alert> : null}
      <div>
        <Button type="submit" variant="primary" loading={busy}>
          Zmień hasło
        </Button>
      </div>
    </form>
  );
}

function DeleteAccountDialog({ onClose }) {
  const { user, deleteAccount } = useAuth();
  const navigate = useNavigate();
  const formId = useId();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();
    if (busy) return;
    if (!password) {
      setError('Podaj hasło, aby potwierdzić.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await deleteAccount(password);
      navigate('/login', { replace: true });
    } catch (err) {
      setError(err.fields?.password ?? err.message);
      setBusy(false);
    }
  }

  return (
    <Dialog
      title="Usunąć konto?"
      size="sm"
      busy={busy}
      dismissOnBackdrop={false}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Anuluj
          </Button>
          <Button variant="danger" type="submit" form={formId} loading={busy}>
            Usuń konto na zawsze
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} noValidate className="grid gap-4">
        <p className="text-[15px] leading-relaxed text-muted text-pretty">
          Konto <strong className="font-semibold text-ink wrap-anywhere">{user.username}</strong> zostanie trwale usunięte razem ze wszystkimi
          zestawami, fiszkami i obrazkami. Tej operacji nie można cofnąć.
        </p>
        <PasswordField
          label="Potwierdź hasłem"
          name="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={error}
          autoComplete="current-password"
          data-autofocus
        />
      </form>
    </Dialog>
  );
}

/** Ustawienia konta: zmiana hasła i usunięcie konta. */
export default function AccountPage() {
  useDocumentTitle('Konto');
  const { user } = useAuth();
  const [deleting, setDeleting] = useState(false);

  return (
    <div className="mx-auto max-w-xl">
      <Link to="/" className="-ml-1 inline-flex items-center gap-1.5 rounded-lg px-1 py-0.5 text-sm font-medium text-muted transition-colors hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Zestawy
      </Link>
      <h1 className="mt-5 font-serif text-4xl font-semibold tracking-tight sm:text-5xl">Konto</h1>

      <div className="mt-8 grid gap-4">
        <Section title="Dane konta">
          <dl className="mt-4 grid gap-3 text-[15px] sm:grid-cols-2">
            <div>
              <dt className="text-sm text-muted">Nazwa użytkownika</dt>
              <dd className="mt-0.5 font-medium wrap-anywhere">{user.username}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Konto założone</dt>
              <dd className="mt-0.5 font-medium">{dateFormat.format(new Date(user.createdAt))}</dd>
            </div>
          </dl>
        </Section>

        <Section title="Zmiana hasła">
          <ChangePasswordForm />
        </Section>

        <Section title="Usunięcie konta">
          <p className="mt-2 text-[15px] leading-relaxed text-muted text-pretty">
            Usunięcie konta kasuje wszystkie Twoje zestawy, fiszki i przesłane obrazki. Tej operacji nie można cofnąć.
          </p>
          <Button variant="danger-outline" onClick={() => setDeleting(true)} className="mt-4">
            Usuń konto
          </Button>
        </Section>
      </div>

      {deleting ? <DeleteAccountDialog onClose={() => setDeleting(false)} /> : null}
    </div>
  );
}
