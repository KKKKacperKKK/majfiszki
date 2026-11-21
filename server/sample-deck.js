import { SAMPLE_IMAGES } from './sample-images-data.js';

/** Zawartość wbudowanego przykładowego obrazka. */
export const sampleImage = (name) => Buffer.from(SAMPLE_IMAGES[name], 'base64');

/** Zestaw tworzony na życzenie użytkownika przyciskiem „Dodaj przykładowy zestaw”. */
export const SAMPLE_DECK = {
  name: 'Angielski — pierwsze słowa',
  description: 'Przykładowy zestaw. Możesz go dowolnie zmieniać albo usunąć.',
  // Język odczytu zostaje w trybie automatycznym — aplikacja sama rozpozna angielski i polski.
  frontLang: 'auto',
  backLang: 'auto',
  cards: [
    // Obrazek na rewersie: pojawia się razem z odpowiedzią i nie podpowiada jej zawczasu.
    { front: 'apple', back: 'jabłko', image: 'apple.webp', imageSide: 'back' },
    { front: 'cat', back: 'kot', image: 'cat.webp', imageSide: 'back' },
    { front: 'bicycle', back: 'rower', image: 'bicycle.webp', imageSide: 'back' },
    { front: 'book', back: 'książka' },
    { front: 'to learn', back: 'uczyć się' },
    { front: 'Good morning!', back: 'Dzień dobry!' },
    { front: 'How are you?', back: 'Jak się masz?' },
    { front: 'Thank you very much.', back: 'Bardzo dziękuję.' },
    { front: 'See you tomorrow!', back: 'Do zobaczenia jutro!' },
    {
      front: 'serendipity',
      back: 'szczęśliwy traf — odkrycie czegoś cennego zupełnie przypadkiem, przy okazji szukania czegoś innego',
    },
  ],
};
