import React, { useState, useEffect } from 'react';
import { useAutoSave } from '../../hooks/useAutoSave';

const LessonNotes = ({ lessonId, initialNotes = '' }) => {
	const [notes, setNotes] = useState(initialNotes);
	const { saveStatus } = useAutoSave(
		notes,
		async (data) => {
			// Save notes to localStorage (or API in future)
			localStorage.setItem(`lesson_notes_${lessonId}`, data);
		},
		1000 // 1 second delay
	);

	useEffect(() => {
		// Load notes from localStorage
		const savedNotes = localStorage.getItem(`lesson_notes_${lessonId}`);
		if (savedNotes) {
			setNotes(savedNotes);
		}
	}, [lessonId]);

	return (
		<div className="student-lesson-notes">
			<div className="student-lesson-notes-header">
				<h3 className="student-lesson-notes-title">
					<span className="student-lesson-notes-icon">📝</span>
					<span>Note personale</span>
				</h3>
				{saveStatus === 'saving' && (
					<span className="student-lesson-notes-saving">Salvare...</span>
				)}
				{saveStatus === 'saved' && (
					<span className="student-lesson-notes-saved">✓ Salvat</span>
				)}
			</div>
			<textarea
				className="student-lesson-notes-textarea"
				value={notes}
				onChange={(e) => setNotes(e.target.value)}
				placeholder="Adaugă note, întrebări sau observații despre această lecție..."
				rows={6}
			/>
		</div>
	);
};

export default LessonNotes;

