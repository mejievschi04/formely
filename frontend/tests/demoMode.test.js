import test from 'node:test';
import assert from 'node:assert/strict';
import { isPublicDemoSession } from '../src/utils/demoMode.js';

test('demo guide requires a public demo session and a demo academy', () => {
    assert.equal(isPublicDemoSession(null), false);
    assert.equal(isPublicDemoSession({ is_demo: false, is_public_demo_session: true }), false);
    assert.equal(isPublicDemoSession({ company: { is_demo: true } }), false);
    assert.equal(isPublicDemoSession({ is_demo: true, is_public_demo_session: false }), false);
    assert.equal(isPublicDemoSession({ is_demo: true, is_public_demo_session: true }), true);
});
