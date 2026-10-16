// Reads `docker compose ... config --format json` from stdin; never prints credentials.
const assert = require('node:assert/strict');
const fs = require('node:fs');

const { services } = JSON.parse(fs.readFileSync(0, 'utf8'));
for (const [name, service] of Object.entries(services).filter(([name]) => name.startsWith('demo-'))) {
  assert.deepEqual(Object.keys(service.networks), ['demo-network'], `${name}: isolated network`);
  for (const volume of service.volumes || []) {
    if (volume.type === 'volume') {
      assert.ok(volume.source.startsWith('demo_'), `${name}: isolated volume`);
    } else {
      assert.ok(!volume.target.startsWith('/var/www/html'), `${name}: no real data bind`);
    }
  }
  assert.ok(Object.keys(service.depends_on || {}).every(dependency => dependency.startsWith('demo-')), `${name}: isolated dependencies`);
  if (['demo-backend', 'demo-queue', 'demo-scheduler'].includes(name)) {
    assert.equal(service.environment.DB_HOST, 'demo-postgres');
    assert.equal(service.environment.DB_DATABASE, services['demo-postgres'].environment.POSTGRES_DB);
    assert.equal(service.environment.FORMELY_DEMO_INSTANCE, 'true');
    assert.equal(service.environment.FORMELY_DEMO_LOGIN_ENABLED, 'true');
    assert.equal(service.environment.SESSION_DOMAIN, '');
    assert.equal(service.environment.SESSION_COOKIE, 'formely_demo_session');
    assert.equal(service.environment.AI_ENABLED, 'false');
    assert.equal(service.environment.MAIL_MAILER, 'log');
  }
}
assert.equal(services.backend.environment.FORMELY_DEMO_INSTANCE, 'false');
assert.equal(services.backend.environment.FORMELY_DEMO_LOGIN_ENABLED, 'false');
assert.equal(services['demo-frontend'].build.args.VITE_API_URL, '/api');
assert.equal(services['demo-frontend'].build.args.VITE_STORAGE_URL, '');
assert.equal((services['demo-postgres'].ports || []).length, 0);
console.log('Demo database, storage, network, sessions and API are isolated.');
