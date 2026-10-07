// The stations' question (ADR 0018): one a day, which a beacon can answer.
// A fixed list, for Advay to edit; the day turns at midnight in Canberra
// (Australian Eastern Standard Time; 1 am in summer). A satellite keeps the
// text of what it answered, so editing this list never rewrites the record.
// Shared by the server and the browser.

export const QUESTIONS = [
  "What do you want to outlast you?",
  "What would you say to everyone here, if they could only hear it for twelve seconds?",
  "What's worth the space it takes up?",
  "What did you notice today that nobody else did?",
  "What would you tell a stranger who can't reply?",
  "What are you still carrying?",
  "What should we all stop saying?",
  "What's the quietest thing you believe?",
  "Who do you wish were listening?",
  "What will still matter in a hundred years?",
  "What small thing kept you going this week?",
  "What would you leave in orbit for someone to find?",
  "What did you say today that you didn't need to?",
  "What have you never said out loud?",
  "What does the sky look like where you are?",
  "What are you waiting for?",
  "What would you like to hear from a stranger right now?",
  "What's a promise you're keeping?",
  "What do you miss that doesn't exist any more?",
  "What's the kindest thing a stranger has done for you?",
  "If this were the last thing you said, what would it be?",
] as const;

export const DAY = 86_400_000;

// Canberra's standard time, ahead of UTC
const CANBERRA = 10 * 3_600_000;

// which day it is in Canberra, counted from 1970
export const dayOf = (time: number): number => Math.floor((time + CANBERRA) / DAY);

export const questionOn = (day: number): string => QUESTIONS[((day % QUESTIONS.length) + QUESTIONS.length) % QUESTIONS.length];

// What a launch answers: the question of the day its form showed (`asked`,
// a day number), if that's today's or yesterday's (written before midnight,
// sent after); anything else answers nothing.
export function answered(asked: string | null, now: number): string | null {
  if (asked === null || !/^\d{1,9}$/.test(asked)) return null;
  const day = Number(asked);
  const today = dayOf(now);
  return day === today || day === today - 1 ? questionOn(day) : null;
}
