import React, { useState, useRef, useEffect } from 'react';
import { extractPdfTextAsHtml } from '../../../utils/pdfTextExtractor';
import { openaiService } from '../../../services/openaiService';
import { useToast } from '../../../contexts/ToastContext';
import { buildCourseCreationPromptFromBrief } from '../../../utils/aiPrompts';
import { isAiEnabled, notifyAiComingSoon, AI_COMING_SOON_MESSAGE } from '../../../utils/aiAvailability';
import './AIChat.css';

const AICourseChat = ({
	onCourseGenerated,
	onPlanGenerated = null,
	onApplyPlan = null,
	onClose,
	initialCourseId = null,
	mode = 'create', // create | assist
	title = '⚡ Creator curs AI',
	welcomeMessage = null,
	showPlanPreview = true,
	autoApplyPlan = false,
	quickActions = [],
}) => {
	const { showToast } = useToast();
	const [messages, setMessages] = useState([
		{
			role: 'assistant',
			content: welcomeMessage || (mode === 'assist'
			? 'Sunt AI. Pot modifica și genera lecții, module și conținutul lor. Spune-mi ce vrei să schimbăm.'
				: 'Sunt AI. Pot genera cursul complet, cu module, lecții și conținutul lor. Dacă îmi lipsesc detalii, te întreb pe rând.'),
		},
	]);
	const [input, setInput] = useState('');
	const [isGenerating, setIsGenerating] = useState(false);
	const [generatedPlan, setGeneratedPlan] = useState(null);
	const [attachedDocuments, setAttachedDocuments] = useState([]);
	const [attachmentUploading, setAttachmentUploading] = useState(false);
	const [currentCourseId, setCurrentCourseId] = useState(initialCourseId); // Track current course ID
	const [guidedBrief, setGuidedBrief] = useState({
		topic: '',
		courseTitle: '',
		description: '',
		targetAudience: '',
		level: 'incepator',
		style: 'practic',
		modulesCount: '3',
		lessonsPerModule: '2',
		lessonSize: 'mediu',
	});
	const messagesEndRef = useRef(null);
	const chatContainerRef = useRef(null);
	const attachmentInputRef = useRef(null);

	useEffect(() => {
		scrollToBottom();
	}, [messages]);

	const scrollToBottom = () => {
		messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
	};

	const extractJsonFromText = (text) => {
		if (!text || typeof text !== 'string') return null;

		const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
		const candidates = [fencedMatch?.[1], text.trim()].filter(Boolean);

		for (const candidate of candidates) {
			try {
				return JSON.parse(candidate);
			} catch {
				// Continue searching other candidates.
			}
		}

		const start = text.indexOf('{');
		const end = text.lastIndexOf('}');
		if (start !== -1 && end !== -1 && end > start) {
			try {
				return JSON.parse(text.slice(start, end + 1));
			} catch {
				return null;
			}
		}

		return null;
	};

	const getResponseTypeFromText = (text) => {
		const parsed = extractJsonFromText(text || '');
		return String(parsed?.response_type || parsed?.type || '').trim().toLowerCase();
	};

	const stripHtmlToText = (html) => {
		if (!html || typeof html !== 'string') {
			return '';
		}

		if (typeof document === 'undefined') {
			return html.replace(/<[^>]*>/g, ' ');
		}

		const wrapper = document.createElement('div');
		wrapper.innerHTML = html;
		return (wrapper.textContent || wrapper.innerText || '').replace(/\s+/g, ' ').trim();
	};

	const normalizeAttachmentText = (text) => {
		if (!text || typeof text !== 'string') {
			return '';
		}

		return text
			.replace(/\u0000/g, '')
			.replace(/\r\n/g, '\n')
			.replace(/\r/g, '\n')
			.replace(/[ \t]+\n/g, '\n')
			.replace(/\n{3,}/g, '\n\n')
			.trim();
	};

	const buildAttachmentNote = (documents) => {
		if (!Array.isArray(documents) || documents.length === 0) {
			return '';
		}

		const parts = documents
			.slice(0, 5)
			.map((doc, index) => {
				const label = doc?.name || doc?.file_name || `Document ${index + 1}`;
				const type = doc?.type || doc?.mime_type || 'document';
				const sizeKb = Number.isFinite(Number(doc?.size)) ? Math.max(1, Math.round(Number(doc?.size) / 1024)) : null;
				const content = normalizeAttachmentText(doc?.text || doc?.preview || '');
				if (!content) return '';
				const meta = [`tip: ${type}`];
				if (sizeKb) {
					meta.push(`dimensiune: ${sizeKb}KB`);
				}
				return [`[${label}] (${meta.join(', ')})`, content.slice(0, 4000)].join('\n');
			})
			.filter(Boolean);

		if (!parts.length) {
			return '';
		}

		return `\n\nDocumente atașate de administrator (folosește-le ca sursă principală; selectează informația utilă în funcție de temă, stil și dimensiunea documentelor):\n${parts.join('\n\n---\n\n')}`;
	};

	const updateGuidedBriefField = (field, value) => {
		setGuidedBrief((prev) => ({
			...prev,
			[field]: value,
		}));
	};

	const getGuidedBriefPayload = () => {
		if (mode !== 'create') return null;

		const normalizeText = (value) => String(value || '').trim();
		const toBoundedInt = (value, fallback, min, max) => {
			const parsed = Number.parseInt(String(value || ''), 10);
			if (!Number.isFinite(parsed)) return fallback;
			return Math.min(max, Math.max(min, parsed));
		};

		const topic = normalizeText(guidedBrief.topic);
		const courseTitle = normalizeText(guidedBrief.courseTitle);
		const description = normalizeText(guidedBrief.description);
		const targetAudience = normalizeText(guidedBrief.targetAudience);
		const level = normalizeText(guidedBrief.level) || 'incepator';
		const style = normalizeText(guidedBrief.style) || 'practic';
		const lessonSize = normalizeText(guidedBrief.lessonSize) || 'mediu';
		const modulesCount = toBoundedInt(guidedBrief.modulesCount, 3, 2, 12);
		const lessonsPerModule = toBoundedInt(guidedBrief.lessonsPerModule, 2, 2, 8);

		if (!topic && !courseTitle && !description) {
			return null;
		}

		return {
			topic,
			course_title: courseTitle,
			description,
			target_audience: targetAudience,
			level,
			style,
			modules_count: modulesCount,
			lessons_per_module: lessonsPerModule,
			lesson_size: lessonSize,
			language: 'ro',
		};
	};

	const handleAttachmentClick = () => {
		attachmentInputRef.current?.click();
	};

	const handleAttachmentRemove = (fileName) => {
		setAttachedDocuments(prev => prev.filter(doc => doc.name !== fileName));
	};

	const handleAttachmentChange = async (event) => {
		const files = Array.from(event.target.files || []);
		if (!files.length) return;

		setAttachmentUploading(true);
		try {
			const processed = [];
			for (const file of files) {
				const lowerName = (file.name || '').toLowerCase();
				const mime = (file.type || '').toLowerCase();
				let text = '';
				let type = 'file';

				if (mime === 'application/pdf' || lowerName.endsWith('.pdf')) {
					type = 'pdf';
					const html = await extractPdfTextAsHtml(file);
					text = stripHtmlToText(html);
				} else if (mime === 'text/plain' || lowerName.endsWith('.txt')) {
					type = 'txt';
					text = await file.text();
				} else {
					const extracted = await openaiService.extractDocumentContext(file);
					type = extracted?.type || type;
					text = extracted?.text || extracted?.preview || '';
				}

				const normalizedText = normalizeAttachmentText(text);
				processed.push({
					name: file.name,
					type,
					mime_type: file.type || null,
					size: file.size,
					text: normalizedText.slice(0, 12000),
					preview: normalizedText.slice(0, 800),
				});
			}

			setAttachedDocuments(prev => {
				const merged = [...prev];
				for (const item of processed) {
					const existingIndex = merged.findIndex(doc => doc.name === item.name);
					if (existingIndex >= 0) {
						merged[existingIndex] = item;
					} else {
						merged.push(item);
					}
				}
				return merged;
			});
		} catch (error) {
			console.error('Error reading attachment:', error);
			showToast('Nu am putut citi documentul. Încearcă un PDF/Word valid.', 'error');
		} finally {
			setAttachmentUploading(false);
			if (attachmentInputRef.current) {
				attachmentInputRef.current.value = '';
			}
		}
	};

	const submitPrompt = async (promptText) => {
		if (isGenerating) return;
		if (!isAiEnabled()) {
			notifyAiComingSoon(showToast);
			return;
		}

		const briefPayload = getGuidedBriefPayload();
		const basePrompt = buildCourseCreationPromptFromBrief(briefPayload, promptText);
		if (!basePrompt?.trim()) return;

		const attachmentNote = buildAttachmentNote(attachedDocuments);
		const promptWithAttachments = `${basePrompt.trim()}${attachmentNote}`;
		const userMessage = { role: 'user', content: promptWithAttachments };
		setMessages(prev => [...prev, userMessage]);
		setInput('');
		setIsGenerating(true);
		setGeneratedPlan(null);
		let waitingHintTimer = null;
		let firstChunkReceived = false;

		try {
			let assistantResponse = '';
			let rawResponse = '';
			let buildModeDetected = false;
			const assistantMessage = {
				role: 'assistant',
				content: mode === 'create'
					? '⚙️ Generez cursul. Dacă îmi lipsesc detalii, te întreb pe rând.'
					: '',
			};
			setMessages(prev => [...prev, assistantMessage]);

			if (mode === 'create') {
				waitingHintTimer = window.setTimeout(() => {
					if (firstChunkReceived) return;
					setMessages(prev => {
						const next = [...prev];
						next[next.length - 1] = {
							...next[next.length - 1],
							content: '⚙️ Încă lucrez la curs...\nDacă îmi lipsesc detalii, îți cer o clarificare pe rând.',
						};
						return next;
					});
				}, 12000);
			}

			console.log(mode === 'assist' ? 'Starting builder diff stream...' : 'Starting course generation stream...');

			let courseId = null;
			let streamResponseType = '';
			let streamClarificationText = '';
			const streamMessages = messages.map(m => ({ role: m.role, content: m.content }));
			const streamHandler = (chunk) => {
				if (!chunk) return;
				firstChunkReceived = true;
				if (waitingHintTimer) {
					window.clearTimeout(waitingHintTimer);
					waitingHintTimer = null;
				}
				rawResponse += chunk;

				// Hide raw JSON in create/assist modes and show build-progress instead.
				if (mode === 'create' || mode === 'assist') {
					const trimmed = rawResponse.trimStart();
					const looksLikeJson =
						trimmed.startsWith('{') ||
						trimmed.startsWith('```json') ||
						/"modules"\s*:/.test(rawResponse) ||
						/"title"\s*:/.test(rawResponse) ||
						/"response_type"\s*:/.test(rawResponse);

					if (looksLikeJson) {
						const responseType = getResponseTypeFromText(rawResponse);
						buildModeDetected = true;
						const phase = mode === 'assist'
							? (rawResponse.length < 900
								? '⚙️ Analizez structura curentă'
								: rawResponse.length < 1900
									? '⚙️ Construiesc modificările'
									: '⚙️ Finalizez modificările')
							: (responseType === 'clarification'
								? '⚙️ Cer o clarificare'
								: rawResponse.length < 900
									? '⚙️ Construiesc structura cursului'
									: rawResponse.length < 1900
										? '⚙️ Generez modulele și lecțiile'
										: '⚙️ Finalizez cursul');
						const dots = '.'.repeat((Math.floor(rawResponse.length / 220) % 3) + 1);
						const statusText = `${phase}${dots}\nTe rog să aștepți.`;
						setMessages(prev => {
							const newMessages = [...prev];
							newMessages[newMessages.length - 1] = {
								...newMessages[newMessages.length - 1],
								content: statusText,
							};
							return newMessages;
						});
						return;
					}
				}

				assistantResponse += chunk;
				setMessages(prev => {
					const newMessages = [...prev];
					newMessages[newMessages.length - 1] = {
						...newMessages[newMessages.length - 1],
						content: assistantResponse,
					};
					return newMessages;
				});
			};
			const dataHandler = (data) => {
				if (data?.response_type) {
					streamResponseType = String(data.response_type || '').trim().toLowerCase();
				}
				if (data?.clarification_question || data?.question || data?.message) {
					streamClarificationText = String(
						data.clarification_question ||
						data.question ||
						data.message ||
						''
					).trim();
				}
				if (data?.course_id) {
					courseId = data.course_id;
					setCurrentCourseId(courseId);
					console.log('Course created/updated with ID:', courseId);
				}
			};

			const streamResult = await openaiService.streamCourseGeneration(
					userMessage.content,
					streamMessages,
					currentCourseId,
					streamHandler,
					dataHandler,
					{
						mode: mode === 'assist' ? 'builder_diff' : 'guided_creation:full',
						courseId: currentCourseId,
						initialCourseId: currentCourseId,
						attachments: attachedDocuments,
						guided_brief: briefPayload,
					}
				);

			if (streamResult?.content && !assistantResponse) {
				if (mode === 'create') {
					rawResponse = streamResult.content;
				} else {
					assistantResponse = streamResult.content;
					setMessages(prev => {
						const newMessages = [...prev];
						newMessages[newMessages.length - 1] = {
							...newMessages[newMessages.length - 1],
							content: assistantResponse,
						};
						return newMessages;
					});
				}
			}

			console.log('Stream completed. Total length:', assistantResponse.length);
			if (!assistantResponse && rawResponse && !buildModeDetected) {
				assistantResponse = rawResponse;
			}

			if (mode === 'assist') {
				if (streamResponseType === 'clarification' && streamClarificationText) {
					setMessages(prev => {
						const newMessages = [...prev];
						newMessages[newMessages.length - 1] = {
							...newMessages[newMessages.length - 1],
							content: streamClarificationText,
						};
						return newMessages;
					});
					return;
				}

				const planSource = rawResponse || assistantResponse;
				const plan = extractJsonFromText(planSource);
				if (plan) {
					setGeneratedPlan(plan);
					const hasOperations = Array.isArray(plan.operations) && plan.operations.length > 0;
					const needsClarification = plan.needs_confirmation === true || Boolean(plan.clarification_question);
					if (autoApplyPlan && onApplyPlan && hasOperations && !needsClarification) {
						await onApplyPlan(plan);
						setGeneratedPlan(null);
						setMessages(prev => {
							const newMessages = [...prev];
							newMessages[newMessages.length - 1] = {
								...newMessages[newMessages.length - 1],
								content: '✅ Am aplicat modificările direct în builder.',
							};
							return newMessages;
						});
					} else if (buildModeDetected) {
						setMessages(prev => {
							const newMessages = [...prev];
							newMessages[newMessages.length - 1] = {
								...newMessages[newMessages.length - 1],
								content: '✅ Am pregătit modificările propuse. Verifică secțiunea de mai jos.',
							};
							return newMessages;
						});
					}
					if (onPlanGenerated) {
						await onPlanGenerated(plan, planSource);
					}
				} else {
					showToast('AI a raspuns, dar nu am putut interpreta un plan JSON valid.', 'warning');
				}
				return;
			}

			// If course was created or updated, show success message but don't redirect
			const sourceText = rawResponse || assistantResponse;
			const parsedCourse = extractJsonFromText(sourceText || '');
			const responseType = String(
				streamResponseType ||
				parsedCourse?.response_type ||
				parsedCourse?.type ||
				getResponseTypeFromText(sourceText || '') ||
				''
			).trim().toLowerCase();
			const clarificationText = String(
				streamClarificationText ||
				parsedCourse?.clarification_question ||
				parsedCourse?.question ||
				parsedCourse?.message ||
				''
			).trim();

			if (courseId) {
				setCurrentCourseId(courseId); // Save course ID for future requests
				setMessages(prev => [...prev, {
					role: 'assistant',
					content: `✅ Cursul a fost ${currentCourseId ? 'actualizat' : 'creat'} cu succes în background!\n\nID curs: ${courseId}\n\nPoți continua conversația sau să îmi spui dacă vrei să modific ceva.`
				}]);
				
				// Don't redirect - user stays in chat
				// Optionally reload courses list if callback is provided
				if (onCourseGenerated) {
					onCourseGenerated({ id: courseId, created: !currentCourseId });
				}
			} else if (responseType === 'clarification' && clarificationText) {
				setMessages(prev => {
					const newMessages = [...prev];
					newMessages[newMessages.length - 1] = {
						...newMessages[newMessages.length - 1],
						content: clarificationText,
					};
					return newMessages;
				});
			} else if (responseType === 'clarification') {
				setMessages(prev => {
					const newMessages = [...prev];
					newMessages[newMessages.length - 1] = {
						...newMessages[newMessages.length - 1],
						content: 'Am nevoie de o singură clarificare ca să continui cu cursul.',
					};
					return newMessages;
				});
			} else if (responseType === 'course') {
				setMessages(prev => {
					const newMessages = [...prev];
					newMessages[newMessages.length - 1] = {
						...newMessages[newMessages.length - 1],
						content: 'Nu am putut valida cursul complet. Te rog să reformulezi cererea sau să adaugi mai multe detalii.',
					};
					return newMessages;
				});
			} else if (clarificationText) {
				setMessages(prev => {
					const newMessages = [...prev];
					newMessages[newMessages.length - 1] = {
						...newMessages[newMessages.length - 1],
						content: clarificationText,
					};
					return newMessages;
				});
			} else if (sourceText && sourceText.trim()) {
				const trimmedSourceText = sourceText.trim();
				const fallbackText = parsedCourse
					? (parsedCourse.description || parsedCourse.short_description || 'Am pregătit cursul. Dacă vrei să continui, îmi poți spune ce lipsește.')
					: trimmedSourceText;
				setMessages(prev => {
					const newMessages = [...prev];
					newMessages[newMessages.length - 1] = {
						...newMessages[newMessages.length - 1],
						content: String(fallbackText).trim(),
					};
					return newMessages;
				});
			}
		} catch (error) {
			console.error('Error generating course:', error);
			showToast('Eroare la generarea cursului. Te rugăm să încerci din nou.', 'error');
			setMessages(prev => {
				const newMessages = [...prev];
				newMessages[newMessages.length - 1] = {
					...newMessages[newMessages.length - 1],
					content: 'Îmi pare rău, am întâmpinat o eroare. Te rugăm să încerci din nou sau să reformulezi cererea.',
				};
				return newMessages;
			});
		} finally {
			if (waitingHintTimer) {
				window.clearTimeout(waitingHintTimer);
			}
			setIsGenerating(false);
		}
	};

	const handleSend = async (e) => {
		e.preventDefault();
		await submitPrompt(input);
	};

	const handleQuickAction = async (actionPrompt) => {
		await submitPrompt(actionPrompt);
	};

	const hasLessonOperations = (plan) => {
		const operations = Array.isArray(plan?.operations) ? plan.operations : [];
		return operations.some((op) => {
			if (!op || typeof op !== 'object') return false;
			const opType = String(op.op || '').trim();
			return (
				opType === 'create_lesson' ||
				opType === 'createLesson' ||
				opType === 'update_lesson' ||
				opType === 'updateLesson' ||
				(Array.isArray(op.lessons) && op.lessons.length > 0)
			);
		});
	};

	const canSend = mode === 'create'
		? Boolean(
			input.trim() ||
			String(guidedBrief.topic || '').trim() ||
			String(guidedBrief.courseTitle || '').trim() ||
			String(guidedBrief.description || '').trim()
		)
		: Boolean(input.trim());


	if (!isAiEnabled()) {
		return (
			<div className={`ai-chat-container ${mode === 'create' ? 'ai-chat-container-create' : ''}`}>
				<div className="ai-chat-header">
					<div className="ai-chat-header-title-wrap">
						<h2>{title}</h2>
					</div>
					{onClose && (
						<button type="button" className="ai-chat-close" onClick={onClose}>
							×
						</button>
					)}
				</div>
				<div className="ai-chat-volt-unavailable">
					<p>{AI_COMING_SOON_MESSAGE}</p>
				</div>
			</div>
		);
	}

	return (
		<div className={`ai-chat-container ${mode === 'create' ? 'ai-chat-container-create' : ''}`}>
			<div className="ai-chat-header">
				<div className="ai-chat-header-title-wrap">
					<h2>{title}</h2>
					{mode === 'create' && (
						<p className="ai-chat-header-subtitle">
							Pot genera cursul complet. Dacă lipsește ceva, te întreb pe rând.
						</p>
					)}
				</div>
				{onClose && (
					<button className="ai-chat-close" onClick={onClose}>
						×
					</button>
				)}
			</div>
			{mode === 'create' && (
				<div className="ai-chat-guided-brief">
					<div className="ai-chat-guided-brief-grid">
						<input
							type="text"
							className="ai-chat-guided-brief-input"
							placeholder="Tema cursului (ex: React Native avansat)"
							value={guidedBrief.topic}
							onChange={(e) => updateGuidedBriefField('topic', e.target.value)}
							disabled={isGenerating}
						/>
						<input
							type="text"
							className="ai-chat-guided-brief-input"
							placeholder="Titlu curs (opțional)"
							value={guidedBrief.courseTitle}
							onChange={(e) => updateGuidedBriefField('courseTitle', e.target.value)}
							disabled={isGenerating}
						/>
						<input
							type="text"
							className="ai-chat-guided-brief-input"
							placeholder="Public țintă (ex: începători cu JS)"
							value={guidedBrief.targetAudience}
							onChange={(e) => updateGuidedBriefField('targetAudience', e.target.value)}
							disabled={isGenerating}
						/>
						<div className="ai-chat-guided-brief-row">
							<label>Nivel</label>
							<select
								value={guidedBrief.level}
								onChange={(e) => updateGuidedBriefField('level', e.target.value)}
								disabled={isGenerating}
							>
								<option value="incepator">Începător</option>
								<option value="mediu">Mediu</option>
								<option value="avansat">Avansat</option>
							</select>
						</div>
						<div className="ai-chat-guided-brief-row">
							<label>Stil</label>
							<select
								value={guidedBrief.style}
								onChange={(e) => updateGuidedBriefField('style', e.target.value)}
								disabled={isGenerating}
							>
								<option value="practic">Practic</option>
								<option value="teoretic">Teoretic</option>
								<option value="mixt">Mixt</option>
							</select>
						</div>
						<div className="ai-chat-guided-brief-row">
							<label>Dimensiune lecții</label>
							<select
								value={guidedBrief.lessonSize}
								onChange={(e) => updateGuidedBriefField('lessonSize', e.target.value)}
								disabled={isGenerating}
							>
								<option value="scurt">Scurtă</option>
								<option value="mediu">Medie</option>
								<option value="lung">Lungă</option>
							</select>
						</div>
						<div className="ai-chat-guided-brief-row">
							<label>Nr. module</label>
							<input
								type="number"
								min={2}
								max={12}
								value={guidedBrief.modulesCount}
								onChange={(e) => updateGuidedBriefField('modulesCount', e.target.value)}
								disabled={isGenerating}
							/>
						</div>
						<div className="ai-chat-guided-brief-row">
							<label>Lecții / modul</label>
							<input
								type="number"
								min={2}
								max={8}
								value={guidedBrief.lessonsPerModule}
								onChange={(e) => updateGuidedBriefField('lessonsPerModule', e.target.value)}
								disabled={isGenerating}
							/>
						</div>
					</div>
					<textarea
						className="ai-chat-guided-brief-textarea"
						placeholder="Descriere curs (opțional). Dacă lași gol, AI o generează."
						value={guidedBrief.description}
						onChange={(e) => updateGuidedBriefField('description', e.target.value)}
						disabled={isGenerating}
						rows={3}
					/>
				</div>
			)}

			<div className="ai-chat-messages" ref={chatContainerRef}>
				{messages.map((message, index) => (
					<div
						key={index}
						className={`ai-chat-message ${message.role === 'user' ? 'ai-chat-message-user' : 'ai-chat-message-assistant'}`}
					>
						<div className="ai-chat-message-content">
							{message.role === 'assistant' && typeof message.content === 'string' && message.content.includes('Te rog să aștepți.') ? (
								<div className="ai-chat-build-status" role="status" aria-live="polite">
									{(() => {
										const [titleLine, ...subtitleLines] = message.content.split('\n').filter(Boolean);
										const subtitle = subtitleLines.join(' ') || 'Te rog să aștepți.';
										return (
											<>
									<p className="ai-chat-build-status-title">
													{titleLine || '⚙️ Construiesc...'}
									</p>
												<p className="ai-chat-build-status-subtitle">{subtitle}</p>
											</>
										);
									})()}
									<div className="ai-chat-build-progress" aria-hidden="true">
										<span className="ai-chat-build-progress-bar" />
									</div>
								</div>
							) : (
								message.content
							)}
						</div>
					</div>
				))}
				{isGenerating && (
					<div className="ai-chat-message ai-chat-message-assistant">
						<div className="ai-chat-message-content">
							<div className="ai-chat-build-status ai-chat-build-status-live" role="status" aria-live="polite">
								<p className="ai-chat-build-status-title">
									<span className="ai-chat-build-title-text">⚙️ AI construiește cursul</span>
									<span className="ai-chat-build-dots" aria-hidden="true">
										<span />
										<span />
										<span />
									</span>
								</p>
								<p className="ai-chat-build-status-subtitle">
									Verific detaliile, cer clarificări doar dacă lipsesc informații și apoi finalizez.
								</p>
								<div className="ai-chat-build-progress" aria-hidden="true">
									<span className="ai-chat-build-progress-bar" />
								</div>
							</div>
						</div>
					</div>
				)}
				<div ref={messagesEndRef} />
			</div>

			{quickActions.length > 0 && (
				<div className="ai-chat-quick-actions">
					{quickActions.map((action) => (
						<button
							key={action.id || action.label}
							type="button"
							className="ai-chat-quick-action"
							onClick={() => handleQuickAction(action.prompt)}
							disabled={isGenerating}
						>
							{action.label}
						</button>
					))}
				</div>
			)}

			{mode === 'assist' && showPlanPreview && generatedPlan && (
				<div className="ai-chat-preview ai-chat-plan-preview">
					<h3>Modificări propuse</h3>
					<div className="ai-chat-preview-content">
						{generatedPlan.summary && <p><strong>Sumar:</strong> {generatedPlan.summary}</p>}
						{generatedPlan.clarification_question && (
							<p><strong>Întrebare:</strong> {generatedPlan.clarification_question}</p>
						)}
						<p><strong>Operații:</strong> {Array.isArray(generatedPlan.operations) ? generatedPlan.operations.length : 0}</p>
						{Array.isArray(generatedPlan.operations) && generatedPlan.operations.some((op) => {
							if (!op || typeof op !== 'object') return false;
							const opType = String(op.op || '').trim();
							return opType === 'create_module' || opType === 'createModule' || opType === 'update_module' || opType === 'updateModule';
						}) && !hasLessonOperations(generatedPlan) && (
							<p className="ai-chat-plan-warning"><strong>Atenție:</strong> modificările nu conțin lecții. Poate fi incomplet.</p>
						)}
					</div>
					<div className="ai-chat-plan-actions">
						<button
							type="button"
							className="ai-chat-btn ai-chat-btn-primary"
							onClick={() => onApplyPlan?.(generatedPlan)}
							disabled={!Array.isArray(generatedPlan.operations) || generatedPlan.operations.length === 0}
						>
							Aplică modificările
						</button>
						<button
							type="button"
							className="ai-chat-btn ai-chat-btn-secondary"
							onClick={() => setGeneratedPlan(null)}
						>
							Refă modificările
						</button>
					</div>
				</div>
			)}

			<form className="ai-chat-input-form" onSubmit={handleSend}>
				<input
					ref={attachmentInputRef}
					type="file"
					className="ai-chat-file-input"
					accept=".pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
					multiple
					onChange={handleAttachmentChange}
				/>
				<button
					type="button"
					className="ai-chat-btn ai-chat-btn-attach"
					onClick={handleAttachmentClick}
					disabled={isGenerating || attachmentUploading}
					title="Adaugă PDF sau Word"
				>
					{attachmentUploading ? '…' : '📎'}
				</button>
				<input
					type="text"
					className="ai-chat-input"
					value={input}
					onChange={(e) => setInput(e.target.value)}
					placeholder={mode === 'create' ? 'Ex: vreau un curs de React pentru începători, orientat pe practică' : 'Scrie cererea ta...'}
					disabled={isGenerating}
				/>
				<button
					type="submit"
					className="ai-chat-btn ai-chat-btn-send"
					disabled={!canSend || isGenerating}
				>
					{isGenerating ? '⏳' : '➤'}
				</button>
			</form>
			{attachedDocuments.length > 0 && (
				<div className="ai-chat-attachments">
					{attachedDocuments.map((doc) => (
						<div key={`${doc.name}-${doc.size}`} className="ai-chat-attachment-chip">
							<span className="ai-chat-attachment-chip-name">{doc.name}</span>
							<button
								type="button"
								className="ai-chat-attachment-chip-remove"
								onClick={() => handleAttachmentRemove(doc.name)}
								disabled={isGenerating}
								aria-label={`Elimină ${doc.name}`}
							>
								×
							</button>
						</div>
					))}
				</div>
			)}
		</div>
	);
};

export default AICourseChat;
