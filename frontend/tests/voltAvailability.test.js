import test from 'node:test';
import assert from 'node:assert/strict';
import {
  setVoltCapabilities,
  setAiUsage,
  runVoltAction,
  assertVoltEnabled,
  VoltUnavailableError,
  AiApiError,
  hasAiQuota,
  getAiCredits,
  getAiCreditCost,
  isVoltEnabled,
  isAiQuotaError,
  applyAiUsageFromResponse,
} from '../src/utils/voltAvailability.js';

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

test('plan features and credit pool gate Formely AI', () => {
  setVoltCapabilities(
    { volt: true },
    {
      features: { ai_test_generation: true, ai_creator: true, ai_tutor: false },
      ai_usage: {
        credits: { used: 98, limit: 100, remaining: 2, unlimited: false },
        costs: { course_generation: 15, test_generation: 3, tutor: 1 },
        actions: {
          test_generation: { used: 32, limit: 33, remaining: 0, unlimited: false, credit_cost: 3 },
          course_generation: { used: 6, limit: 6, remaining: 0, unlimited: false, credit_cost: 15 },
        },
      },
    },
  );
  assert.equal(isVoltEnabled('ai_test_generation'), true);
  assert.equal(isVoltEnabled('ai_tutor'), false);
  assert.equal(hasAiQuota('test_generation'), false); // 2 < 3
  assert.equal(hasAiQuota('course_generation'), false); // 2 < 15
  assert.equal(hasAiQuota('tutor'), true); // 2 >= 1
  assert.equal(getAiCredits().remaining, 2);
  assert.equal(getAiCreditCost('course_generation'), 15);
  let called = false;
  runVoltAction(() => {}, () => { called = true; }, 'ai_test_generation', 'test_generation');
  assert.equal(called, false);
});

test('isAiQuotaError accepts fetch AiApiError shape', () => {
  const err = new AiApiError('quota', 429, { code: 'ai_quota_exceeded', error: 'limit' });
  assert.equal(isAiQuotaError(err), true);
  assert.equal(isAiQuotaError(new AiApiError('nope', 500, { code: 'x' })), false);
  assert.equal(isAiQuotaError({ response: { status: 429, data: { code: 'ai_quota_exceeded' } } }), true);
});

test('applyAiUsageFromResponse refreshes local credit snapshot', () => {
  setVoltCapabilities({ volt: true }, {
    features: { ai_creator: true },
    ai_usage: {
      credits: { used: 0, limit: 100, remaining: 100, unlimited: false },
      costs: { course_generation: 15, test_generation: 3, tutor: 1 },
      actions: {
        course_generation: { used: 0, limit: 6, remaining: 6, unlimited: false, credit_cost: 15 },
      },
    },
  });
  applyAiUsageFromResponse({
    ai_usage: {
      credits: { used: 30, limit: 100, remaining: 70, unlimited: false },
      costs: { course_generation: 15, test_generation: 3, tutor: 1 },
      actions: {
        course_generation: { used: 2, limit: 6, remaining: 4, unlimited: false, credit_cost: 15 },
      },
    },
  });
  assert.equal(hasAiQuota('course_generation'), true);
  setAiUsage({
    credits: { used: 100, limit: 100, remaining: 0, unlimited: false },
    costs: { course_generation: 15, test_generation: 3, tutor: 1 },
    actions: {
      course_generation: { used: 6, limit: 6, remaining: 0, unlimited: false, credit_cost: 15 },
    },
  });
  assert.equal(hasAiQuota('course_generation'), false);
});
