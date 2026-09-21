import api from '../api.js';

let cached = null;
let inflight = null;

export async function fetchPublicConfig() {
	if (cached) {
		return cached;
	}
	if (!inflight) {
		inflight = api.get('/plans').then((res) => {
			cached = {
				publicRegisterEnabled: Boolean(res.data?.public_register_enabled),
				plans: res.data?.plans || [],
			};
			return cached;
		}).catch(() => {
			cached = { publicRegisterEnabled: false, plans: [] };
			return cached;
		}).finally(() => {
			inflight = null;
		});
	}
	return inflight;
}
