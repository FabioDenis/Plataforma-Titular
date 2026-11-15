// Seat limit of a newsroom team, as shown to the platform admin and to the newsroom manager.
// Seats are the owner, the active accounts and the pending invites; null means no limit.

const accounts = (count: number) => (count === 1 ? '1 cuenta' : `${count} cuentas`);

export function describeSeats(seatsUsed: number, seatLimit: number | null): string {
  if (seatLimit === null) return `Equipo: ${accounts(seatsUsed)} · sin cupo`;
  return `Equipo: ${seatsUsed} de ${accounts(seatLimit)}`;
}

export function isTeamFull(seatsUsed: number, seatLimit: number | null): boolean {
  return seatLimit !== null && seatsUsed >= seatLimit;
}

/** Reads the admin's seat limit field: empty means no limit; otherwise a whole number from 1 to 1000. */
export function parseSeatLimitInput(text: string): number | null | 'invalid' {
  const value = text.trim();
  if (!value) return null;
  if (!/^\d+$/.test(value)) return 'invalid';
  const limit = Number(value);
  return limit >= 1 && limit <= 1000 ? limit : 'invalid';
}
