const DAY_MS = 24 * 60 * 60 * 1000;

export const LESSON_RATINGS = ['again', 'hard', 'medium', 'easy'];

export function reviewTransition({ box, consecutiveFails, rating, now = new Date() }) {
  let nextBox = box;
  let nextFails = consecutiveFails;
  let intervalDays;

  switch (rating) {
    case 'again':
      nextBox = 1;
      nextFails += 1;
      intervalDays = 1;
      break;
    case 'hard':
      nextBox = 1;
      nextFails = 0;
      intervalDays = 1;
      break;
    case 'medium':
      nextBox = Math.min(5, box + 1);
      nextFails = 0;
      intervalDays = nextBox === 2 ? 3 : 4;
      break;
    case 'easy':
      nextBox = Math.min(5, box + 2);
      nextFails = 0;
      intervalDays = nextBox === 3 ? 7 : nextBox === 4 ? 14 : 30;
      break;
    default:
      throw new TypeError('Nieprawidłowa ocena powtórki.');
  }

  return {
    box: nextBox,
    consecutiveFails: nextFails,
    nextReviewAt: new Date(now.getTime() + intervalDays * DAY_MS).toISOString(),
  };
}

