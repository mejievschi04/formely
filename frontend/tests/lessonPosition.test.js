import test from 'node:test';
import assert from 'node:assert/strict';
import { getLessonPosition } from '../src/utils/lessonOrder.js';
import { nameInitials } from '../src/utils/initials.js';

const modules = [
    { id: 20, order: 2, title: 'Modul B', lessons: [{ id: 4, order: 0 }] },
    { id: 10, order: 1, title: 'Modul A', lessons: [{ id: 3, order: 1 }, { id: 2, order: 0 }] },
];
const rootLessons = [{ id: 1, order: 0, module_id: null }];

test('lesson position follows the Previous/Next order: root lessons, then modules by order', () => {
    assert.deepEqual(getLessonPosition(modules, 1, rootLessons), { index: 1, total: 4, module: null });
    const second = getLessonPosition(modules, 2, rootLessons);
    assert.equal(second.index, 2);
    assert.equal(second.module.title, 'Modul A');
    assert.equal(getLessonPosition(modules, '4', rootLessons).index, 4);
});

test('lesson position is null for an unknown or missing lesson', () => {
    assert.equal(getLessonPosition(modules, 99, rootLessons), null);
    assert.equal(getLessonPosition(modules, null, rootLessons), null);
});

test('avatar initials use at most two words', () => {
    assert.equal(nameInitials('Cursant E2E mobile'), 'CE');
    assert.equal(nameInitials('  ana   pop '), 'AP');
    assert.equal(nameInitials(''), 'U');
    assert.equal(nameInitials(null, 'A'), 'A');
});
