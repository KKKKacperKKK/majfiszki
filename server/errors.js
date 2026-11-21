/** Błąd, który ma trafić do klienta jako odpowiedź JSON z konkretnym kodem HTTP. */
export class HttpError extends Error {
  /**
   * @param {number} status  kod HTTP
   * @param {string} code    stabilny identyfikator błędu dla frontendu
   * @param {string} message komunikat dla użytkownika (po polsku)
   * @param {Record<string, string> | null} [fields] błędy przypisane do pól formularza
   */
  constructor(status, code, message, fields = null) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export function notFound(message = 'Nie znaleziono zasobu.') {
  return new HttpError(404, 'not_found', message);
}

export function validationError(fields) {
  return new HttpError(422, 'validation_error', Object.values(fields)[0], fields);
}
