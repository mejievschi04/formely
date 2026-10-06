import test from 'node:test';
import assert from 'node:assert/strict';
import { setVoltCapabilities, runVoltAction, assertVoltEnabled, VoltUnavailableError } from '../src/utils/voltAvailability.js';

test('disabled Volt reports unavailability and never starts an action', () => {
  setVoltCapabilities({ volt: false });
  let called = false;
  let message;
  runVoltAction((text) => { message = text; }, () => { called = true; });
  assert.equal(called, false);
  assert.equal(typeof message, 'string');
  assert.throws(assertVoltEnabled, VoltUnavailableError);
});

test('configured Volt allows an action and logout removes that capability', () => {
  setVoltCapabilities({ volt: true });
  assert.equal(runVoltAction(null, () => 'started'), 'started');
  setVoltCapabilities(null);
  assert.throws(assertVoltEnabled, VoltUnavailableError);
});

test('unknown capabilities cannot enable an AI request', () => {
  for (const capabilities of [undefined, {}, { volt: 'false' }, { volt: 1 }]) {
    setVoltCapabilities(capabilities);
    assert.throws(assertVoltEnabled, VoltUnavailableError);
  }
});
