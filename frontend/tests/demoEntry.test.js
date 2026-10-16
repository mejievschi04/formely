import test from 'node:test';
import assert from 'node:assert/strict';
import { demoEntryRedirect } from '../src/utils/demoEntry.js';

test('academy demo entry leaves the academy origin before changing its session', () => {
	assert.equal(demoEntryRedirect('https://academy.formely.org'), 'https://demo.formely.org/');
	assert.equal(demoEntryRedirect('https://admin.formely.org'), 'https://demo.formely.org/');
	assert.equal(demoEntryRedirect('https://demo.formely.org.evil.example'), 'https://demo.formely.org/');
});

test('only the configured demo origin starts the local demo session', () => {
	assert.equal(demoEntryRedirect('https://demo.formely.org'), null);
	assert.equal(demoEntryRedirect('http://localhost:5176', 'http://localhost:5176/demo'), null);
	assert.equal(demoEntryRedirect('http://localhost:5173', 'http://localhost:5176/demo'), 'http://localhost:5176/demo');
});
