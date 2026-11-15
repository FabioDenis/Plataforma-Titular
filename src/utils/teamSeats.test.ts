import assert from 'node:assert/strict';
import test from 'node:test';
import { describeSeats, isTeamFull, parseSeatLimitInput } from './teamSeats';

test('the team line shows used and available seats, or that there is no limit', () => {
  assert.equal(describeSeats(3, 5), 'Equipo: 3 de 5 cuentas');
  assert.equal(describeSeats(1, 1), 'Equipo: 1 de 1 cuenta');
  assert.equal(describeSeats(6, 4), 'Equipo: 6 de 4 cuentas');
  assert.equal(describeSeats(3, null), 'Equipo: 3 cuentas · sin cupo');
  assert.equal(describeSeats(1, null), 'Equipo: 1 cuenta · sin cupo');
});

test('a team is full when its seats reach the limit, and never without a limit', () => {
  assert.equal(isTeamFull(5, 5), true);
  assert.equal(isTeamFull(6, 5), true);
  assert.equal(isTeamFull(4, 5), false);
  assert.equal(isTeamFull(50, null), false);
});

test('the seat limit field accepts empty for no limit or a whole number from 1 to 1000', () => {
  assert.equal(parseSeatLimitInput(''), null);
  assert.equal(parseSeatLimitInput('  '), null);
  assert.equal(parseSeatLimitInput(' 5 '), 5);
  assert.equal(parseSeatLimitInput('1000'), 1000);
  for (const text of ['0', '-2', '2.5', '1001', 'cinco', '5a']) {
    assert.equal(parseSeatLimitInput(text), 'invalid', text);
  }
});
