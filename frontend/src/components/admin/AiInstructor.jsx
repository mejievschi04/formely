import React, { useState, useRef, useEffect } from 'react';
import { FilePdf, Sparkle, PaperPlaneRight, Paperclip, X } from '@phosphor-icons/react';
import './AiInstructor.css';

/**
 * Asistent AI pentru instructori — interfață ghidată cu întrebări și acțiuni rapide.
 */
const AiInstructor = ({ actions = [], welcomeMessage, questions = [], pdfUploadQuestionIndex = -1 }) => {
	const [isMinimized, setIsMinimized] = useState(true);
	const [input, setInput] = useState('');
	const [pdfFile, setPdfFile] = useState(null);
	const [step, setStep] = useState('initial');
	const [activeActionIndex, setActiveActionIndex] = useState(null);
	const [answers, setAnswers] = useState([]);
	const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
	const messagesEndRef = useRef(null);

	const defaultWelcome =
		'Sunt asistentul AI Formely. Te pot ghida la crearea cursurilor, lecțiilor și testelor — funcționalitatea completă va fi disponibilă în curând.';
	const message = welcomeMessage ?? defaultWelcome;

	const activeAction = activeActionIndex !== null ? actions[activeActionIndex] : null;
	const activeQuestions = activeAction?.questions ?? questions;
	const activePdfIndex = activeAction?.pdfUploadQuestionIndex ?? pdfUploadQuestionIndex;

	const allAnswered = activeQuestions.length > 0 && answers.length >= activeQuestions.length;

	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
	}, [answers, currentQuestionIndex, step]);

	const handleStartAction = (actionIdx) => {
		const action = actions[actionIdx];
		const actionQuestions = action?.questions ?? (action?.primary ? questions : []);
		if (actionQuestions.length > 0) {
			setActiveActionIndex(actionIdx);
			setStep('questions');
			setAnswers([]);
			setCurrentQuestionIndex(0);
			setPdfFile(null);
		} else {
			setIsMinimized(true);
			action?.onClick?.();
		}
	};

	const handleBackToInitial = () => {
		setStep('initial');
		setActiveActionIndex(null);
		setAnswers([]);
		setCurrentQuestionIndex(0);
		setPdfFile(null);
	};

	const isPdfQuestion = activePdfIndex >= 0 && currentQuestionIndex === activePdfIndex;

	const handleChatSubmit = (e) => {
		e.preventDefault();
		const text = input.trim();
		const hasPdf = isPdfQuestion && pdfFile;
		if (!text && !hasPdf) return;
		const answerText = hasPdf ? `PDF: ${pdfFile.name}` : text;
		const newAnswers = [...answers, answerText];
		setAnswers(newAnswers);
		setInput('');
		if (newAnswers.length >= activeQuestions.length) {
			setStep('ready');
		} else {
			setCurrentQuestionIndex((prev) => prev + 1);
		}
	};

	const handleFinalize = () => {
		setIsMinimized(true);
		const data =
			activeQuestions.length > 0 && allAnswered
				? {
						answers,
						chatData: activeQuestions.map((q, i) => `${q}\n${answers[i] || ''}`).join('\n\n'),
						pdfFile: activePdfIndex >= 0 ? pdfFile : null,
					}
				: undefined;
		activeAction?.onClick?.(data);
		handleBackToInitial();
	};

	const aiIcon = <Sparkle size={24} weight="fill" aria-hidden />;

	const currentQuestion = activeQuestions[currentQuestionIndex];
	const showQuestions = step === 'questions' || step === 'ready';
	const showFinalizeButton = step === 'ready';

	return (
		<div className={`ai-instructor-container ${isMinimized ? 'minimized' : 'expanded'}`}>
			{isMinimized && (
				<button
					type="button"
					className="ai-instructor-floating-btn"
					onClick={() => setIsMinimized(false)}
					title="Deschide asistentul AI"
					aria-label="Deschide asistentul AI"
				>
					<span className="ai-instructor-icon">{aiIcon}</span>
				</button>
			)}

			{!isMinimized && (
				<>
					<div className="ai-instructor-header">
						<div className="ai-instructor-header-left">
							<span className="ai-instructor-icon">{aiIcon}</span>
							<span className="ai-instructor-title">Formely AI</span>
						</div>
						<button
							type="button"
							className="ai-instructor-toggle"
							onClick={() => {
								setIsMinimized(true);
								handleBackToInitial();
							}}
							title="Minimizează"
							aria-label="Minimizează"
						>
							<X size={16} weight="bold" aria-hidden />
						</button>
					</div>

					<div className="ai-instructor-chat">
						<div className="ai-instructor-message ai-instructor-message-assistant">
							<div className="ai-instructor-message-content">{message}</div>
						</div>
						{showQuestions && (
							<>
								{answers.map((answer, i) => (
									<React.Fragment key={i}>
										<div className="ai-instructor-message ai-instructor-message-assistant">
											<div className="ai-instructor-message-content ai-instructor-question">
												{activeQuestions[i]}
											</div>
										</div>
										<div className="ai-instructor-message ai-instructor-message-user">
											<div className="ai-instructor-message-content">{answer}</div>
										</div>
									</React.Fragment>
								))}
								{currentQuestion && !allAnswered && (
									<div className="ai-instructor-message ai-instructor-message-assistant">
										<div className="ai-instructor-message-content ai-instructor-question">
											{currentQuestion}
										</div>
									</div>
								)}
								{allAnswered && (
									<div className="ai-instructor-message ai-instructor-message-assistant">
										<div className="ai-instructor-message-content">
											Am notat tot. Apasă „Finalizează”
										</div>
									</div>
								)}
							</>
						)}
						<div ref={messagesEndRef} />
					</div>

					{showQuestions && !allAnswered && (
						<form className="ai-instructor-input-form" onSubmit={handleChatSubmit}>
							{isPdfQuestion && (
								<div className="ai-instructor-pdf-upload">
									<input
										type="file"
										accept=".pdf,application/pdf"
										onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
										className="ai-instructor-file-input"
										id="ai-instructor-pdf-upload"
									/>
									<label htmlFor="ai-instructor-pdf-upload" className="ai-instructor-file-label">
										{pdfFile ? (
											<>
												<FilePdf size={14} weight="duotone" aria-hidden /> {pdfFile.name}
											</>
										) : (
											<>
												<Paperclip size={14} weight="bold" aria-hidden /> Încarcă PDF
											</>
										)}
									</label>
								</div>
							)}
							<input
								type="text"
								className="ai-instructor-input"
								value={input}
								onChange={(e) => setInput(e.target.value)}
								placeholder={isPdfQuestion ? "Sau scrie 'nu' pentru a skipa..." : 'Scrie răspunsul tău...'}
							/>
							<button type="submit" className="ai-instructor-send-btn" disabled={!input.trim() && !pdfFile}>
								<PaperPlaneRight size={14} weight="fill" aria-hidden />
							</button>
						</form>
					)}

					<div className="ai-instructor-quick-actions">
						{showFinalizeButton ? (
							<button
								type="button"
								className="ai-instructor-quick-action ai-instructor-primary-action"
								onClick={handleFinalize}
							>
								Finalizează
							</button>
						) : step === 'initial' ? (
							actions.map((action, idx) => (
								<button
									key={idx}
									type="button"
									className={`ai-instructor-quick-action ${action.primary ? 'ai-instructor-primary-action' : ''}`}
									onClick={() => handleStartAction(idx)}
									disabled={action.disabled}
								>
									{action.label}
								</button>
							))
						) : null}
					</div>
				</>
			)}
		</div>
	);
};

export default AiInstructor;
