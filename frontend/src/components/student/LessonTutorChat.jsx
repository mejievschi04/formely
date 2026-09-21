import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChatCircle, PaperPlaneTilt, X } from '@phosphor-icons/react';
import { openaiService } from '../../services/openaiService';
import { useAuth } from '../../contexts/AuthContext';
import { canUseAiFeature } from '../../utils/aiAvailability';
import './LessonTutorChat.css';

const LessonTutorChat = ({ lessonId, courseId, courseTitle, lessonTitle, enabled = true }) => {
	const { user } = useAuth();
	const [open, setOpen] = useState(false);
	const [messages, setMessages] = useState([]);
	const [input, setInput] = useState('');
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const messagesEndRef = useRef(null);

	useEffect(() => {
		if (open) {
			messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
		}
	}, [messages, open, loading]);

	const handleSend = useCallback(async () => {
		const trimmed = input.trim();
		if (!trimmed || loading || !lessonId) return;

		const userMessage = { role: 'user', content: trimmed };
		const nextMessages = [...messages, userMessage];
		setMessages(nextMessages);
		setInput('');
		setError('');
		setLoading(true);

		let assistantContent = '';
		setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

		try {
			await openaiService.streamStudentTutor(
				lessonId,
				trimmed,
				nextMessages.slice(0, -1),
				(chunk) => {
					assistantContent += chunk;
					setMessages((prev) => {
						const copy = [...prev];
						const last = copy[copy.length - 1];
						if (last?.role === 'assistant') {
							copy[copy.length - 1] = { ...last, content: assistantContent };
						}
						return copy;
					});
				},
			);
		} catch (e) {
			const message = e?.message || 'Nu am putut obține răspunsul tutorului.';
			setError(message);
			setMessages((prev) => prev.filter((msg, index) => !(index === prev.length - 1 && msg.role === 'assistant' && !msg.content)));
		} finally {
			setLoading(false);
		}
	}, [input, loading, lessonId, messages]);

	if (!lessonId) {
		return null;
	}

	if (!canUseAiFeature(user, 'ai_tutor') || !enabled) {
		return null;
	}

	return (
		<div className={`lesson-tutor-chat ${open ? 'is-open' : ''}`}>
			{open ? (
				<div className="lesson-tutor-chat-panel" role="dialog" aria-label="Tutor Formely AI">
					<header className="lesson-tutor-chat-header">
						<div>
							<strong>Formely AI</strong>
							<p>{lessonTitle || 'Tutor lecție'}{courseTitle ? ` · ${courseTitle}` : ''}</p>
						</div>
						<button type="button" className="lesson-tutor-chat-close" onClick={() => setOpen(false)} aria-label="Închide">
							<X size={20} weight="bold" />
						</button>
					</header>

					<div className="lesson-tutor-chat-messages">
						{messages.length === 0 ? (
							<p className="lesson-tutor-chat-empty">
								Întreabă despre conținutul lecției — explică concepte, dă exemple sau ajută la înțelegere.
							</p>
						) : null}
						{messages.map((msg, index) => (
							<div key={`${msg.role}-${index}`} className={`lesson-tutor-chat-bubble lesson-tutor-chat-bubble--${msg.role}`}>
								{msg.content || (loading && index === messages.length - 1 ? '...' : '')}
							</div>
						))}
						<div ref={messagesEndRef} />
					</div>

					{error ? <div className="lesson-tutor-chat-error" role="alert">{error}</div> : null}

					<form
						className="lesson-tutor-chat-form"
						onSubmit={(e) => {
							e.preventDefault();
							handleSend();
						}}
					>
						<input
							type="text"
							value={input}
							onChange={(e) => setInput(e.target.value)}
							placeholder="Întreabă tutorul..."
							disabled={loading}
						/>
						<button type="submit" disabled={loading || !input.trim()} aria-label="Trimite">
							<PaperPlaneTilt size={20} weight="fill" />
						</button>
					</form>
				</div>
			) : null}

			<button
				type="button"
				className="lesson-tutor-chat-fab"
				onClick={() => setOpen((value) => !value)}
				aria-expanded={open}
				aria-label={open ? 'Închide tutorul AI' : 'Deschide tutorul AI'}
			>
				<ChatCircle size={28} weight="fill" />
			</button>
		</div>
	);
};

export default LessonTutorChat;
