const { test } = require('node:test');
const assert = require('node:assert/strict');
const model = require('../site/model.js');
const event = { starts_at_local: '2026-11-09T06:30', timezone: 'America/Los_Angeles', status: 'published' };
const filter = { period: 'upcoming', status: 'published', month: 'all', day: 'all', time: 'all' };
test('upcoming comparisons use San Francisco time, independent of the viewer timezone', () => {
  assert.equal(model.eventMatches(event, filter, new Date('2026-11-09T14:29:00Z')), true);
  assert.equal(model.eventMatches(event, filter, new Date('2026-11-09T14:31:00Z')), false);
  assert.equal(model.eventMatches(event, {...filter, period:'past'}, new Date('2026-11-09T14:31:00Z')), true);
});
test('San Francisco offset respects daylight saving time', () => {
  assert.equal(model.localMinute(new Date('2026-06-01T14:00:00Z')), '2026-06-01T07:00');
  assert.equal(model.localMinute(new Date('2026-11-09T14:00:00Z')), '2026-11-09T06:00');
});
test('filters distinguish published, unconfirmed and cancelled events', () => {
  const now = new Date('2026-11-09T14:00:00Z');
  assert.equal(model.eventMatches({...event,status:'unconfirmed'}, filter, now), false);
  assert.equal(model.eventMatches({...event,status:'unconfirmed'}, {...filter,status:'all'}, now), true);
  assert.equal(model.eventMatches({...event,status:'cancelled'}, {...filter,status:'all'}, now), false);
});
test('morning filter includes an event with a morning alternative start', () => {
  const e = {...event, starts_at_local:'2026-11-09T12:00', meeting_options:[{local_time:'11:45'}]};
  assert.equal(model.eventMatches(e, {...filter,time:'am'}, new Date('2026-11-09T14:00:00Z')), true);
  assert.equal(model.eventMatches(e, {...filter,time:'pm'}, new Date('2026-11-09T14:00:00Z')), true);
  assert.equal(model.eventMatches(e, {...filter,time:'am'}, new Date('2026-11-09T19:50:00Z')), false);
});
test('day and time filters do not turn recurring patterns into dated events', () => {
  const p = {days:['monday'],local_time:'06:30'};
  assert.equal(model.patternMatches(p, {day:'monday',time:'am'}), true);
  assert.equal(model.patternMatches(p, {day:'tuesday',time:'am'}), false);
  assert.equal(model.patternMatches({...p,local_time:null}, {day:'monday',time:'am'}), false);
  assert.equal(model.patternMatches({...p,local_time:null}, {day:'monday',time:'unknown'}), true);
});

test('today and tomorrow are determined in San Francisco across year boundaries', () => {
  const nextYear = {...event, starts_at_local:'2027-01-01T06:30'};
  const now = new Date('2027-01-01T07:30:00Z'); // still December 31 in San Francisco
  assert.equal(model.eventMatches(nextYear, {...filter,period:'tomorrow'}, now), true);
  assert.equal(model.eventMatches(nextYear, {...filter,period:'today'}, now), false);
});
