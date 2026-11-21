import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reviewTransition } from '../server/leitner.js';

const now = new Date('2026-01-01T12:00:00.000Z');
const atDay = (days) => new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();

test('Nie umiem resets the box, schedules tomorrow, and counts consecutive failures', () => {
  assert.deepEqual(
    reviewTransition({ box: 4, consecutiveFails: 2, rating: 'again', now }),
    { box: 1, consecutiveFails: 3, nextReviewAt: atDay(1) },
  );
});

test('Słabo always resets to box 1 and clears the fail streak', () => {
  assert.deepEqual(
    reviewTransition({ box: 5, consecutiveFails: 2, rating: 'hard', now }),
    { box: 1, consecutiveFails: 0, nextReviewAt: atDay(1) },
  );
});

test('Średnio advances one box and uses the box 2 / higher intervals', () => {
  assert.equal(reviewTransition({ box: 1, consecutiveFails: 1, rating: 'medium', now }).nextReviewAt, atDay(3));
  assert.deepEqual(
    reviewTransition({ box: 2, consecutiveFails: 1, rating: 'medium', now }),
    { box: 3, consecutiveFails: 0, nextReviewAt: atDay(4) },
  );
});

test('Umiem advances by two boxes and uses the 7 / 14 / 30 day intervals', () => {
  assert.equal(reviewTransition({ box: 1, consecutiveFails: 2, rating: 'easy', now }).nextReviewAt, atDay(7));
  assert.equal(reviewTransition({ box: 2, consecutiveFails: 0, rating: 'easy', now }).nextReviewAt, atDay(14));
  assert.equal(reviewTransition({ box: 4, consecutiveFails: 0, rating: 'easy', now }).nextReviewAt, atDay(30));
});
