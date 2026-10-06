import { useEffect } from 'react';

const useUnsavedChangesPrompt = (enabled, message = 'Ai modificări nesalvate. Ești sigur că vrei să ieși?') => {
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
