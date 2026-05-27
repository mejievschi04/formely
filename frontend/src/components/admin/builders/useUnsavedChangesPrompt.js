import { useEffect } from 'react';

const useUnsavedChangesPrompt = (enabled, message = 'Ai modificari nesalvate. Esti sigur ca vrei sa iesi?') => {
	useEffect(() => {
		if (!enabled) return undefined;
		const handleBeforeUnload = (event) => {
			event.preventDefault();
			event.returnValue = message;
			return message;
		};
		window.addEventListener('beforeunload', handleBeforeUnload);
		return () => window.removeEventListener('beforeunload', handleBeforeUnload);
	}, [enabled, message]);
};

export default useUnsavedChangesPrompt;
