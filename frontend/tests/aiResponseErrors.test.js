import test from 'node:test';
import assert from 'node:assert/strict';
import { aiResponseErrorMessage, parseAiStreamEvent } from '../src/utils/aiResponseErrors.js';

test('server HTML is replaced by a useful HTTP error', () => {
	for (const data of [null, { error: '<!DOCTYPE html><html><body>500</body></html>' }]) {
		const message = aiResponseErrorMessage(data, 500);
		assert.match(message, /HTTP 500/);
		assert.doesNotMatch(message, /<html>/);
	}
});

test('API errors preserve actionable validation and quota messages', () => {
	assert.equal(aiResponseErrorMessage({ message: 'Materialul este obligatoriu.' }, 422), 'Materialul este obligatoriu.');
	assert.equal(aiResponseErrorMessage({ error: { message: 'Cotă epuizată.' } }, 429), 'Cotă epuizată.');
});

test('stream JSON parsing preserves provider errors regardless of their wording', () => {
	for (const error of ['Unexpected provider error', 'JSON generation failed']) {
		assert.deepEqual(parseAiStreamEvent(JSON.stringify({ error })), { error });
	}
	assert.equal(parseAiStreamEvent('{truncated'), null);
	assert.deepEqual(parseAiStreamEvent('{"content":"Bună"}'), { content: 'Bună' });
});
