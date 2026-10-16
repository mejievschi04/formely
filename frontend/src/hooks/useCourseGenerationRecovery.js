import { useCallback, useEffect, useRef, useState } from 'react';
import { openaiService } from '../services/openaiService';

export function useCourseGenerationRecovery({ enabled, onBusy, onResult, onError }) {
	const callbacks = useRef({ onBusy, onResult, onError });
	callbacks.current = { onBusy, onResult, onError };
	const [progress, setProgress] = useState(null);
	const [retryId, setRetryId] = useState(null);
	const [checking, setChecking] = useState(enabled);
	const controller = useRef(null);
	const captureError = useCallback(error => {
		if (error?.data?.generation_id) setRetryId(error.data.generation_id);
	}, []);
	const follow = useCallback(async (id, signal, retry = false) => {
		callbacks.current.onBusy(true);
		setRetryId(null);
		try {
			const result = await openaiService.resumeCourseGeneration(id, data => {
				if (data.progress) setProgress(data.progress);
			}, signal, retry);
			if (!signal.aborted) callbacks.current.onResult(result);
		} catch (error) {
			if (error.name !== 'AbortError' && !signal.aborted) {
				setRetryId(id);
				callbacks.current.onError(error);
			}
		} finally {
			if (!signal.aborted) callbacks.current.onBusy(false);
		}
	}, []);
	useEffect(() => {
		if (!enabled) { setChecking(false); return; }
		const abort = new AbortController();
		controller.current = abort;
		(async () => {
			try {
				const run = await openaiService.activeCourseGeneration(abort.signal);
				if (abort.signal.aborted || !run) return;
				setProgress(run);
				if (run.status === 'failed') { setRetryId(run.generation_id); callbacks.current.onBusy(true); callbacks.current.onBusy(false); return; }
				await follow(run.generation_id, abort.signal);
			} catch { /* A failed recovery check does not block a new submission. */ }
			finally { if (!abort.signal.aborted) setChecking(false); }
		})();
		return () => { abort.abort(); controller.current?.abort(); };
	}, [enabled, follow]);
	const retry = useCallback(() => {
		if (!retryId) return;
		controller.current?.abort();
		controller.current = new AbortController();
		return follow(retryId, controller.current.signal, true);
	}, [follow, retryId]);
	const reset = useCallback(() => { setProgress(null); setRetryId(null); }, []);
	return { progress, setProgress, retryId, checking, retry, captureError, reset };
}
