import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAutoSave } from '../../hooks/useAutoSave';
import { lessonNotesService } from '../../services/api';
import './NoteTakingSystem.css';

/**
 * Note Taking System for Students
 * Features:
 * - Notes synchronized with video timestamp
 * - Rich text editor
 * - Bookmarking important moments
 * - Export notes
 * - Search notes
 */
const NoteTakingSystem = ({ 
	lessonId, 
	videoRef,
	currentTime = 0,
	onNoteAdded,
	onNoteUpdated,
	onNoteDeleted 
}) => {
	const [notes, setNotes] = useState([]);
	const [activeNote, setActiveNote] = useState(null);
	const [isExpanded, setIsExpanded] = useState(false);
	const [searchQuery, setSearchQuery] = useState('');
	const [showAddNote, setShowAddNote] = useState(false);
	const [newNoteContent, setNewNoteContent] = useState('');
	const notesContainerRef = useRef(null);

	const loadNotesForLesson = useCallback(async () => {
		if (!lessonId) return;
		try {
			const data = await lessonNotesService.getNotes(lessonId);
			if (Array.isArray(data?.notes) && data.notes.length > 0) {
				setNotes(data.notes);
				return;
			}
		} catch {
			/* offline sau fără acces — folosim local */
		}
		try {
			const savedNotes = localStorage.getItem(`notes_${lessonId}`);
			if (savedNotes) {
				const parsed = JSON.parse(savedNotes);
				if (Array.isArray(parsed)) setNotes(parsed);
			}
		} catch (err) {
			console.error('Error loading notes:', err);
		}
	}, [lessonId]);

	useEffect(() => {
		if (!lessonId) {
			setNotes([]);
			return;
		}
		setNotes([]);
		loadNotesForLesson();
	}, [lessonId, loadNotesForLesson]);

	// Copie locală pentru offline / fallback
	useEffect(() => {
		if (!lessonId) return;
		try {
			localStorage.setItem(`notes_${lessonId}`, JSON.stringify(notes));
		} catch {
			/* quota */
		}
	}, [notes, lessonId]);

	const { saveStatus } = useAutoSave(
		{ lessonId, notes },
		async (data) => {
			if (!data.lessonId) return;
			try {
				await lessonNotesService.saveNotes(data.lessonId, data.notes);
			} catch (e) {
				console.error('Failed to save lesson notes to server:', e);
			}
		},
		2000
	);
	
	// Add new note at current timestamp
	const handleAddNote = () => {
		if (!newNoteContent.trim()) return;
		
		const newNote = {
			id: Date.now(),
			timestamp: currentTime,
			content: newNoteContent,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};
		
		const updatedNotes = [...notes, newNote].sort((a, b) => a.timestamp - b.timestamp);
		setNotes(updatedNotes);
		setNewNoteContent('');
		setShowAddNote(false);
		setActiveNote(newNote.id);
		
		if (onNoteAdded) {
			onNoteAdded(newNote);
		}
	};
	
	// Update note
	const handleUpdateNote = (noteId, content) => {
		const updatedNotes = notes.map(note => 
			note.id === noteId 
				? { ...note, content, updatedAt: new Date().toISOString() }
				: note
		);
		setNotes(updatedNotes);
		
		if (onNoteUpdated) {
			onNoteUpdated(noteId, content);
		}
	};
	
	// Delete note
	const handleDeleteNote = (noteId) => {
		const updatedNotes = notes.filter(note => note.id !== noteId);
		setNotes(updatedNotes);
		
		if (activeNote === noteId) {
			setActiveNote(null);
		}
		
		if (onNoteDeleted) {
			onNoteDeleted(noteId);
		}
	};
	
	// Jump to timestamp in video
	const handleJumpToTimestamp = (timestamp) => {
		if (videoRef && videoRef.current) {
			videoRef.current.currentTime = timestamp;
		}
	};
	
	// Format timestamp
	const formatTimestamp = (seconds) => {
		if (!seconds || isNaN(seconds)) return '0:00';
		const h = Math.floor(seconds / 3600);
		const m = Math.floor((seconds % 3600) / 60);
		const s = Math.floor(seconds % 60);
		
		if (h > 0) {
			return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
		}
		return `${m}:${s.toString().padStart(2, '0')}`;
	};
	
	// Filter notes by search query
	const filteredNotes = notes.filter(note => 
		note.content.toLowerCase().includes(searchQuery.toLowerCase())
	);
	
	// Export notes
	const handleExportNotes = () => {
		const notesText = notes.map(note => 
			`[${formatTimestamp(note.timestamp)}] ${note.content}`
		).join('\n\n');
		
		const blob = new Blob([notesText], { type: 'text/plain' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `notes_lesson_${lessonId}_${new Date().toISOString().split('T')[0]}.txt`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	};
	
	return (
		<div className={`note-taking-system ${isExpanded ? 'expanded' : ''}`}>
			{/* Toggle Button */}
			<button
				className="note-taking-toggle"
				onClick={() => setIsExpanded(!isExpanded)}
				aria-label={isExpanded ? 'Ascunde notițe' : 'Afișează notițe'}
			>
				<span className="note-taking-toggle-icon">📝</span>
				<span className="note-taking-toggle-text">
					Notițe {notes.length > 0 && `(${notes.length})`}
				</span>
			</button>
			
			{/* Notes Panel */}
			{isExpanded && (
				<div className="note-taking-panel" ref={notesContainerRef}>
					<div className="note-taking-header">
						<h3 className="note-taking-title">Notițe</h3>
						<div className="note-taking-actions">
							<button
								className="note-taking-action-btn"
								onClick={handleExportNotes}
								title="Exportă notițe"
								disabled={notes.length === 0}
							>
								💾
							</button>
							<button
								className="note-taking-action-btn"
								onClick={() => setIsExpanded(false)}
								title="Închide"
							>
								×
							</button>
						</div>
					</div>
					
					{/* Search */}
					{notes.length > 0 && (
						<div className="note-taking-search">
							<input
								type="text"
								placeholder="Caută în notițe..."
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								className="note-taking-search-input"
							/>
						</div>
					)}
					
					{/* Add Note Button */}
					<div className="note-taking-add-section">
						{!showAddNote ? (
							<button
								className="note-taking-add-btn"
								onClick={() => {
									setShowAddNote(true);
									setNewNoteContent('');
								}}
							>
								+ Adaugă notiță la {formatTimestamp(currentTime)}
							</button>
						) : (
							<div className="note-taking-add-form">
								<textarea
									value={newNoteContent}
									onChange={(e) => setNewNoteContent(e.target.value)}
									placeholder="Scrie notița ta aici..."
									className="note-taking-textarea"
									rows={3}
									autoFocus
								/>
								<div className="note-taking-add-actions">
									<button
										className="note-taking-btn note-taking-btn-primary"
										onClick={handleAddNote}
										disabled={!newNoteContent.trim()}
									>
										Salvează
									</button>
									<button
										className="note-taking-btn note-taking-btn-secondary"
										onClick={() => {
											setShowAddNote(false);
											setNewNoteContent('');
										}}
									>
										Anulează
									</button>
								</div>
							</div>
						)}
					</div>
					
					{/* Notes List */}
					<div className="note-taking-list">
						{filteredNotes.length === 0 ? (
							<div className="note-taking-empty">
								{searchQuery ? (
									<>
										<p>Nu s-au găsit notițe care să conțină "{searchQuery}"</p>
									</>
								) : (
									<>
										<p>Nu ai notițe încă.</p>
										<p className="note-taking-empty-hint">
											Adaugă notițe pentru a le salva și a reveni la ele mai târziu.
										</p>
									</>
								)}
							</div>
						) : (
							filteredNotes.map((note) => (
								<div
									key={note.id}
									className={`note-taking-item ${activeNote === note.id ? 'active' : ''}`}
								>
									<div className="note-taking-item-header">
										<button
											className="note-taking-timestamp"
											onClick={() => handleJumpToTimestamp(note.timestamp)}
											title="Saltă la acest moment în video"
										>
											⏱️ {formatTimestamp(note.timestamp)}
										</button>
										<div className="note-taking-item-actions">
											<button
												className="note-taking-item-action"
												onClick={() => setActiveNote(activeNote === note.id ? null : note.id)}
												title={activeNote === note.id ? 'Minimizează' : 'Editează'}
											>
												{activeNote === note.id ? '−' : '✏️'}
											</button>
											<button
												className="note-taking-item-action"
												onClick={() => handleDeleteNote(note.id)}
												title="Șterge"
											>
												🗑️
											</button>
										</div>
									</div>
									
									{activeNote === note.id ? (
										<div className="note-taking-item-edit">
											<textarea
												value={note.content}
												onChange={(e) => handleUpdateNote(note.id, e.target.value)}
												className="note-taking-textarea"
												rows={4}
											/>
										</div>
									) : (
										<div className="note-taking-item-content">
											{note.content}
										</div>
									)}
									
									<div className="note-taking-item-footer">
										<small className="note-taking-item-date">
											{new Date(note.createdAt).toLocaleDateString('ro-RO', {
												day: '2-digit',
												month: '2-digit',
												year: 'numeric',
												hour: '2-digit',
												minute: '2-digit'
											})}
										</small>
									</div>
								</div>
							))
						)}
					</div>
				</div>
			)}
		</div>
	);
};

export default NoteTakingSystem;
