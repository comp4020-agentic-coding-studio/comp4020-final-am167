// "45 s", or "2 min 05 s": how long until a satellite comes round.
export const countdown = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
};
