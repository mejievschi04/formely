import React, { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { openaiService } from '../../../services/openaiService';
import { adminService } from '../../../services/api';

import { useToast } from '../../../contexts/ToastContext';
import { buildCourseCreationPromptFromBrief } from '../../../utils/aiPrompts';
import { detectAiWorkspaceIntent } from '../../../utils/detectAiWorkspaceIntent';
import { applyAiCoursePlan, summarizeAiPlanOperations, AI_TEST_REFRESH_EVENT } from '../../../utils/aiCoursePlan';
import { describeAiPageContext, getAiPageContext } from '../../../utils/getAiPageContext';
import {
	buildStructuredExcelRows,
	downloadStructuredExcel,
	statisticsExcelFilename,
} from '../../../utils/statisticsExcelExport';
import { isAiEnabled, notifyAiComingSoon, canUseAiFeature, notifyAiPlanLocked, AI_PLAN_LOCKED_MESSAGE } from '../../../utils/aiAvailability';
import { useAuth } from '../../../contexts/AuthContext';
import './AIChat.css';

function summarizeCoursePlan(plan) {
	const modules = plan?.modules || plan?.course?.modules || [];
	if (!Array.isArray(modules) || modules.length === 0) return [];
	return modules.slice(0, 12).map((mod) => ({
		title: String(mod.title || mod.name || 'Modul'),
		lessons: Array.isArray(mod.lessons)
			? mod.lessons.slice(0, 8).map((lesson) => String(lesson.title || lesson.name || 'Lecție'))
			: [],
	}));
}

const AICourseChat = ({
	onCourseGenerated,
	onPlanGenerated = null,
	onApplyPlan = null,
	onClose,
	initialCourseId = null,
	selectedModuleId = null,
	selectedLessonId = null,
	selectedLessonDraft = null,
	mode = 'create', // create | assist | workspace
	title = 'Generează o ciornă cu Formely AI',
	titleId = 'ai-chat-title',
	welcomeMessage = null,
	showPlanPreview = true,
	autoApplyPlan = false,
	quickActions = [],
	initialTitle = '',
	initialDescription = '',
	embed = false,
	onTestGenerated = null,
	onMapGenerated = null,
	initialTestId = null,
	initialMapId = null,
}) => {
	const { showToast } = useToast();
	const { user } = useAuth();
	const location = useLocation();
	const pageContext = getAiPageContext(location);
	const requiredFeature = mode === 'assist'
		? 'ai_builder'
		: mode === 'workspace'
			? null
			: 'ai_creator';
	const aiAllowed = requiredFeature
		? canUseAiFeature(user, requiredFeature)
		: (
			canUseAiFeature(user, 'ai_builder')
			|| canUseAiFeature(user, 'ai_creator')
			|| canUseAiFeature(user, 'ai_stats')
			|| canUseAiFeature(user, 'ai_test_generation')
		);
	const [messages, setMessages] = useState(() => {
		// În modul "create", subtitlul din header transmite deja mesajul de bun venit — evităm dublarea.
		if ((mode === 'create' || mode === 'workspace') && !welcomeMessage) {
			return mode === 'workspace'
				? [{
					role: 'assistant',
					content: `Sunt Formely AI. ${describeAiPageContext(getAiPageContext(typeof window === 'undefined' ? {} : { pathname: window.location.pathname, search: window.location.search }))}`,
				}]
				: [];
		}
		return [
			{
				role: 'assistant',
				content: welcomeMessage || (mode === 'assist'
					? 'Sunt Formely AI. Pot modifica și genera lecții, module și conținutul lor. Spune-mi ce vrei să schimbăm.'
					: 'Sunt Formely AI. Pregătesc o ciornă cu module și lecții pe care le poți revizui. Dacă îmi lipsesc detalii, te întreb pe rând.'),
			},
		];
	});
	const [input, setInput] = useState('');
	const [isGenerating, setIsGenerating] = useState(false);
	const [isDirectExporting, setIsDirectExporting] = useState(false);
	const [pendingCreatedCourse, setPendingCreatedCourse] = useState(null);
	const [attachedDocuments, setAttachedDocuments] = useState([]);
	const [attachmentUploading, setAttachmentUploading] = useState(false);
	const [currentCourseId, setCurrentCourseId] = useState(initialCourseId);
	const [currentTestId, setCurrentTestId] = useState(initialTestId);
	const [currentMapId, setCurrentMapId] = useState(initialMapId);
	const [pendingDraft, setPendingDraft] = useState(null);
	const [generatedPlan, setGeneratedPlan] = useState(null);
	const [isApplying, setIsApplying] = useState(false);
	const [guidedBrief, setGuidedBrief] = useState({
		topic: initialTitle || '',
		courseTitle: initialTitle || '',
		description: initialDescription || '',
		targetAudience: '',
		level: 'incepator',
		style: 'practic',
		modulesCount: '2',
		lessonsPerModule: '2',
		lessonSize: 'detaliat',
	});
	const messagesEndRef = useRef(null);
	const chatContainerRef = useRef(null);
	const attachmentInputRef = useRef(null);

	useEffect(() => {
		scrollToBottom();
	}, [messages]);

	useEffect(() => {
		setCurrentCourseId(initialCourseId ?? pageContext.courseId ?? null);
		setCurrentTestId(initialTestId ?? pageContext.testId ?? null);
		setCurrentMapId(initialMapId ?? pageContext.mapId ?? null);
	}, [initialCourseId, initialTestId, initialMapId, pageContext.courseId, pageContext.testId, pageContext.mapId]);

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

	const looksLikePartialJson = (text) => {
		if (!text || typeof text !== 'string') return false;
		const trimmed = text.trim();
		return (
			trimmed.startsWith('{') ||
			trimmed.startsWith('```json') ||
			trimmed.includes('"response_type"') ||
			trimmed.includes('"modules"')
		) && !extractJsonFromText(trimmed);
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
			.replaceAll('\u0000', '')
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
					const { extractPdfTextAsHtml } = await import('../../../utils/pdfTextExtractor');
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

	const finishAssistantMessage = (content) => {
		setMessages((prev) => {
			const next = [...prev];
			next[next.length - 1] = { ...next[next.length - 1], content };
			return next;
		});
	};

	const mapAiTestQuestions = (rawQuestions) => {
		if (!Array.isArray(rawQuestions)) return [];
		return rawQuestions
			.map((q, index) => {
				const options = Array.isArray(q.options) ? q.options : (Array.isArray(q.answers) ? q.answers : []);
				const correctIndex = Number.isFinite(Number(q.correct_answer))
					? Number(q.correct_answer)
					: options.findIndex((opt) => opt && typeof opt === 'object' && opt.is_correct);
				const answers = options.map((opt, optIndex) => {
					if (opt && typeof opt === 'object') {
						return {
							text: String(opt.text || opt.label || ''),
							is_correct: Boolean(opt.is_correct) || optIndex === correctIndex,
						};
					}
					return { text: String(opt), is_correct: optIndex === correctIndex };
				});
				return {
					type: q.type || 'multiple_choice',
					content: String(q.question || q.content || ''),
					answers,
					points: Number(q.points) || 1,
					order: index,
					explanation: q.explanation || '',
				};
			})
			.filter((q) => q.content && q.answers.length >= 2);
	};

	const applyPendingDraft = async () => {
		if (!pendingDraft || isApplying) return;
		setIsApplying(true);
		try {
			if (pendingDraft.kind === 'test') {
				if (pendingDraft.action === 'update' && currentTestId) {
					const updated = await adminService.updateTest(currentTestId, {
						title: pendingDraft.title,
						description: pendingDraft.description,
						questions: pendingDraft.questions,
					});
					const test = updated?.test || updated;
					if (typeof window !== 'undefined') {
						window.dispatchEvent(new CustomEvent(AI_TEST_REFRESH_EVENT, { detail: { testId: Number(currentTestId) } }));
					}
					showToast('Testul a fost actualizat.', 'success');
					setPendingDraft(null);
					onTestGenerated?.(test);
					return;
				}
				const created = await adminService.createTest({
					title: pendingDraft.title,
					description: pendingDraft.description || '',
					type: 'final',
					status: 'draft',
					questions: pendingDraft.questions,
				});
				const test = created?.test || created;
				showToast('Test creat cu Formely AI.', 'success');
				setPendingDraft(null);
				onTestGenerated?.(test);
				return;
			}

			if (pendingDraft.kind === 'map') {
				if (pendingDraft.action === 'update' && currentMapId) {
					const updated = await adminService.updateCourseMap(currentMapId, {
						name: pendingDraft.name,
						description: pendingDraft.description,
					});
					if (Array.isArray(pendingDraft.course_ids) && pendingDraft.course_ids.length) {
						try {
							await adminService.attachCoursesToMap(currentMapId, pendingDraft.course_ids);
						} catch (attachErr) {
							console.warn('Map updated but courses were not attached', attachErr);
						}
					}
					showToast('Mapa a fost actualizată.', 'success');
					setPendingDraft(null);
					onMapGenerated?.(updated);
					return;
				}
				const created = await adminService.createCourseMap({
					name: pendingDraft.name,
					description: pendingDraft.description,
				});
				const map = created?.id ? created : created?.data || created;
				if (Array.isArray(pendingDraft.course_ids) && pendingDraft.course_ids.length && map?.id) {
					try {
						await adminService.attachCoursesToMap(map.id, pendingDraft.course_ids);
					} catch (attachErr) {
						console.warn('Map created but courses were not attached', attachErr);
					}
				}
				showToast('Mapă creată cu Formely AI.', 'success');
				setPendingDraft(null);
				onMapGenerated?.(map);
			}
		} catch (error) {
			showToast(error?.response?.data?.error || error?.message || 'Nu am putut aplica propunerea.', 'error');
		} finally {
			setIsApplying(false);
		}
	};

	const submitPrompt = async (promptText) => {
		if (isGenerating) return;
		if (!isAiEnabled()) {
			notifyAiComingSoon(showToast);
			return;
		}
		if (!aiAllowed) {
			notifyAiPlanLocked(showToast);
			return;
		}

		const intent = mode === 'workspace'
			? detectAiWorkspaceIntent(promptText, {
				...pageContext,
				courseId: currentCourseId || pageContext.courseId,
				testId: currentTestId || pageContext.testId,
				mapId: currentMapId || pageContext.mapId,
			})
			: null;
		const runMode = intent === 'edit_course'
			? 'assist'
			: (intent === 'create_course' ? 'create' : mode);

		if (mode === 'workspace' && ['answer', 'test', 'edit_test', 'map', 'edit_map'].includes(intent)) {
			const userMessage = { role: 'user', content: promptText.trim() };
			setMessages((prev) => [...prev, userMessage, { role: 'assistant', content: '…' }]);
			setInput('');
			setIsGenerating(true);
			setPendingDraft(null);
			try {
				let streamed = '';
				const history = messages.map((m) => ({ role: m.role, content: m.content }));
				if (intent === 'answer') {
					await openaiService.streamCourseGeneration(
						promptText.trim(),
						history,
						null,
						(chunk) => {
							if (!chunk) return;
							streamed += chunk;
							finishAssistantMessage(streamed);
						},
						null,
						{ type: 'tutor', mode: 'admin_tutor' }
					);
					if (!streamed.trim()) {
						finishAssistantMessage('Nu am putut genera un răspuns. Încearcă să reformulezi.');
					}
					return;
				}

				if (intent === 'test' || intent === 'edit_test') {
					const editingTest = intent === 'edit_test' && currentTestId;
					const testPrompt = editingTest
						? `${promptText.trim()}\n\nEditezi testul ID ${currentTestId}. Răspunde JSON cu title, description și questions. Dacă cererea e o adăugare, propune întrebările noi plus cele esențiale din context.`
						: promptText.trim();
					await openaiService.streamTestGeneration(
						testPrompt,
						history,
						currentCourseId,
						(chunk) => {
							if (!chunk) return;
							streamed += chunk;
							finishAssistantMessage(streamed);
						}
					);
					const parsed = extractJsonFromText(streamed);
					const questions = mapAiTestQuestions(parsed?.questions);
					if (!parsed?.title || questions.length === 0) {
						finishAssistantMessage(streamed.trim() || 'Nu am putut pregăti un test valid. Adaugă mai multe detalii.');
						return;
					}
					setPendingDraft({
						kind: 'test',
						action: editingTest ? 'update' : 'create',
						title: parsed.title,
						description: parsed.description || '',
						questions,
					});
					finishAssistantMessage(
						editingTest
							? `Am pregătit ${questions.length} întrebări pentru testul deschis. Verifică sumarul și apasă Aplică.`
							: `Am pregătit ciorna testului „${parsed.title}” (${questions.length} întrebări). Aplic doar după confirmare.`
					);
					return;
				}

				const editingMap = intent === 'edit_map' && currentMapId;
				const mapPrompt = `${promptText.trim()}\n\n${editingMap
					? `Editezi mapa ID ${currentMapId}. `
					: ''}Dacă cererea este o mapă de cursuri, răspunde doar JSON valid: {"response_type":"map","name":"...","description":"...","course_ids":[]}. Folosește ID-uri de curs doar dacă le știi din context.`;
				await openaiService.streamCourseGeneration(
					mapPrompt,
					history,
					null,
					(chunk) => {
						if (!chunk) return;
						streamed += chunk;
						finishAssistantMessage(streamed);
					},
					null,
					{ type: 'tutor', mode: 'admin_tutor' }
				);
				const parsed = extractJsonFromText(streamed);
				const mapName = String(parsed?.name || parsed?.title || '').trim();
				if (!mapName) {
					finishAssistantMessage(streamed.trim() || 'Spune-mi numele mapei ca să o pregătesc.');
					return;
				}
				setPendingDraft({
					kind: 'map',
					action: editingMap ? 'update' : 'create',
					name: mapName,
					description: parsed.description || null,
					course_ids: Array.isArray(parsed.course_ids) ? parsed.course_ids : [],
				});
				finishAssistantMessage(
					editingMap
						? `Am pregătit actualizarea mapei „${mapName}”. Aplic doar după confirmare.`
						: `Am pregătit mapa „${mapName}”. Aplic doar după confirmare.`
				);
			} catch (error) {
				console.error('Formely AI workspace error:', error);
				finishAssistantMessage(error?.response?.data?.error || error?.message || 'A apărut o eroare.');
			} finally {
				setIsGenerating(false);
			}
			return;
		}

		const briefPayload = mode === 'workspace' ? null : getGuidedBriefPayload();
		const basePrompt = buildCourseCreationPromptFromBrief(briefPayload, promptText);
		if (!basePrompt?.trim()) return;

		const attachmentNote = buildAttachmentNote(attachedDocuments);
		const promptWithAttachments = `${basePrompt.trim()}${attachmentNote}`;
		const userMessage = { role: 'user', content: promptWithAttachments };
		setMessages(prev => [...prev, userMessage]);
		setInput('');
		setIsGenerating(true);
		setGeneratedPlan(null);
		setPendingDraft(null);
		let waitingHintTimer = null;
		let firstChunkReceived = false;

		try {
			let assistantResponse = '';
			let rawResponse = '';
			let buildModeDetected = false;
			const assistantMessage = {
				role: 'assistant',
				content: runMode === 'create'
					? '⚙️ Generez cursul. Dacă îmi lipsesc detalii, te întreb pe rând.'
					: '',
			};
			setMessages(prev => [...prev, assistantMessage]);

			if (runMode === 'create') {
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

			console.log(runMode === 'assist' ? 'Starting builder diff stream...' : 'Starting course generation stream...');

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
				if (runMode === 'create' || runMode === 'assist') {
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
						const phase = runMode === 'assist'
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
						mode: runMode === 'assist' ? 'builder_diff' : 'guided_creation:full',
						courseId: currentCourseId,
						initialCourseId: currentCourseId,
						selectedModuleId: selectedModuleId ?? null,
						selectedLessonId: selectedLessonId ?? null,
						selectedLessonDraft: selectedLessonDraft ?? null,
						attachments: attachedDocuments,
						guided_brief: briefPayload,
					}
				);

			if (streamResult?.content && !assistantResponse) {
				if (runMode === 'create') {
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

			if (runMode === 'assist') {
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
					const applyHandler = onApplyPlan || (currentCourseId
						? (nextPlan) => applyAiCoursePlan(currentCourseId, nextPlan)
						: null);
					const shouldAutoApply = autoApplyPlan && applyHandler && hasOperations && !needsClarification;
					if (shouldAutoApply) {
						const result = await applyHandler(plan);
						setGeneratedPlan(null);
						setMessages(prev => {
							const newMessages = [...prev];
							newMessages[newMessages.length - 1] = {
								...newMessages[newMessages.length - 1],
								content: `✅ Am aplicat ${result?.appliedSteps ?? 'modificările'} în curs.`,
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
					showToast('Formely AI a raspuns, dar nu am putut interpreta un plan JSON valid.', 'warning');
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
				const wasExisting = Boolean(currentCourseId);
				setCurrentCourseId(courseId);
				setPendingCreatedCourse({ id: courseId, created: !wasExisting, plan: parsedCourse });
				const modulePreview = summarizeCoursePlan(parsedCourse);
				const previewLines = modulePreview.length
					? modulePreview.map((mod) => `• ${mod.title}${mod.lessons.length ? ` (${mod.lessons.length} lecții)` : ''}`).join('\n')
					: '';
				setMessages(prev => [...prev, {
					role: 'assistant',
					content: `Am pregătit o ciornă. Verifică structura mai jos, apoi deschide-o în builder.\n\nID curs: ${courseId}${previewLines ? `\n\n${previewLines}` : ''}`,
				}]);
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
					: looksLikePartialJson(trimmedSourceText)
						? 'Formely AI a generat un răspuns incomplet. Încearcă un curs mai mic (2 module x 2 lecții) sau apasă din nou după câteva secunde.'
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

	const handleDirectExport = async () => {
		if (isGenerating) return;
		if (!isAiEnabled()) {
			notifyAiComingSoon(showToast);
			return;
		}
		if (!canUseAiFeature(user, 'ai_stats')) {
			notifyAiPlanLocked(showToast);
			return;
		}

		const exportPrompt = input.trim();
		if (exportPrompt.length < 3) {
			showToast('Scrie ce date vrei în export.', 'warning');
			return;
		}

		setMessages(prev => [
			...prev,
			{ role: 'user', content: `Export Excel: ${exportPrompt}` },
			{ role: 'assistant', content: '⚙️ Pregătesc exportul Excel...\nTe rog să aștepți.' },
		]);
		setInput('');
		setIsGenerating(true);
		setIsDirectExporting(true);

		try {
			const exportData = await adminService.generateStatisticsExportWithAi({
				prompt: exportPrompt,
			});

			const rows = buildStructuredExcelRows({
				sheetLabel: exportData.title || 'Export Formely AI',
				periodFrom: exportData.filters_applied?.date_from || '',
				periodTo: exportData.filters_applied?.date_to || '',
				kpiEntries: exportData.kpis?.length ? exportData.kpis : null,
				extraMeta: [
					['Tip raport', exportData.dataset_label || exportData.dataset || '—'],
					['Cerere', exportPrompt],
					['Rezumat Formely AI', exportData.summary || ''],
				],
				tableHeaders: exportData.headers || [],
				tableRows: exportData.rows || [],
			});

			downloadStructuredExcel(
				statisticsExcelFilename(exportData.filename_slug || exportData.dataset || 'volt-export'),
				exportData.title || 'Export Formely AI',
				rows
			);

			setMessages(prev => {
				const next = [...prev];
				next[next.length - 1] = {
					...next[next.length - 1],
					content: `✅ Exportul Excel a fost generat și descărcat.\n\n${exportData.title || 'Export Formely AI'}\n${exportData.row_count ?? 0} rânduri`,
				};
				return next;
			});
			showToast('Export Excel descărcat.', 'success');
		} catch (error) {
			console.error('Error generating direct export:', error);
			const message = error?.response?.data?.error || error?.message || 'Nu s-a putut genera exportul.';
			setMessages(prev => {
				const next = [...prev];
				next[next.length - 1] = {
					...next[next.length - 1],
					content: `Nu am putut genera exportul Excel: ${message}`,
				};
				return next;
			});
			showToast(message, 'error');
		} finally {
			setIsDirectExporting(false);
			setIsGenerating(false);
		}
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

	const liveStatusTitle = isDirectExporting ? 'Formely AI pregătește exportul Excel' : 'Formely AI pregătește ciorna';
	const liveStatusSubtitle = isDirectExporting
		? 'Analizez cererea, extrag datele și pregătesc fișierul.'
		: 'Verific detaliile, cer clarificări doar dacă lipsesc informații și apoi finalizez.';


	if (!isAiEnabled() || !aiAllowed) {
		if (!isAiEnabled()) {
			return null;
		}
		return (
			<div className={`ai-chat-container ${mode === 'create' ? 'ai-chat-container-create' : ''}${embed ? ' ai-chat-container-embed' : ''}`}>
				<div className="ai-chat-header">
					<div className="ai-chat-header-title-wrap">
						<h2 id={titleId}>{title}</h2>
					</div>
					{onClose && (
						<button type="button" className="ai-chat-close" onClick={onClose} aria-label="Închide">
							×
						</button>
					)}
				</div>
				<div className="ai-chat-coming-soon">
					<p>{AI_PLAN_LOCKED_MESSAGE}</p>
				</div>
			</div>
		);
	}

	return (
		<div className={`ai-chat-container ${mode === 'create' ? 'ai-chat-container-create' : ''}${embed ? ' ai-chat-container-embed' : ''}`}>
			{!embed && (
			<div className="ai-chat-header">
				<div className="ai-chat-header-title-wrap">
					<h2 id={titleId}>{title}</h2>
					{mode === 'create' && (
						<p className="ai-chat-header-subtitle">
							Rezultatul este o ciornă: structură și propuneri de lecții de verificat înainte de publicare.
						</p>
					)}
				</div>
				{onClose && (
					<button type="button" className="ai-chat-close" onClick={onClose} aria-label="Închide">
						×
					</button>
				)}
			</div>
			)}
			{mode === 'create' && !embed && (
				<div className="ai-chat-guided-brief">
					<input
						type="text"
						className="ai-chat-guided-brief-input ai-chat-guided-brief-topic"
						placeholder="Tema cursului (ex: React Native avansat)"
						value={guidedBrief.topic}
						onChange={(e) => updateGuidedBriefField('topic', e.target.value)}
						disabled={isGenerating}
					/>
					<div className="ai-chat-guided-brief-pair">
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
					</div>
					<div className="ai-chat-guided-brief-controls">
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
							<label>Lecții</label>
							<select
								value={guidedBrief.lessonSize}
								onChange={(e) => updateGuidedBriefField('lessonSize', e.target.value)}
								disabled={isGenerating}
							>
								<option value="scurt">Scurte</option>
								<option value="mediu">Medii</option>
								<option value="detaliat">Detaliate</option>
							</select>
						</div>
						<div className="ai-chat-guided-brief-row">
							<label>Module</label>
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
						placeholder="Descriere curs (opțional). Dacă lași gol, Formely AI o generează."
						value={guidedBrief.description}
						onChange={(e) => updateGuidedBriefField('description', e.target.value)}
						disabled={isGenerating}
						rows={2}
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
									<span className="ai-chat-build-title-text">{liveStatusTitle}</span>
									<span className="ai-chat-build-dots" aria-hidden="true">
										<span />
										<span />
										<span />
									</span>
								</p>
								<p className="ai-chat-build-status-subtitle">
									{liveStatusSubtitle}
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

			{(mode === 'create' || mode === 'workspace') && pendingCreatedCourse && (
				<div className="ai-chat-preview ai-chat-plan-preview">
					<h3>Ciornă pregătită</h3>
					<div className="ai-chat-preview-content">
						<p>Rezultatul trebuie revizuit înainte de publicare. Poți ajusta modulele și lecțiile în builder.</p>
						{summarizeCoursePlan(pendingCreatedCourse.plan).length > 0 ? (
							<ul>
								{summarizeCoursePlan(pendingCreatedCourse.plan).map((mod) => (
									<li key={mod.title}>
										<strong>{mod.title}</strong>
										{mod.lessons.length ? ` — ${mod.lessons.join(', ')}` : ''}
									</li>
								))}
							</ul>
						) : null}
					</div>
					<div className="ai-chat-plan-actions">
						<button
							type="button"
							className="ai-chat-btn ai-chat-btn-primary"
							onClick={() => onCourseGenerated?.(pendingCreatedCourse)}
						>
							Deschide ciorna în builder
						</button>
					</div>
				</div>
			)}

			{pendingDraft && (
				<div className="ai-chat-preview ai-chat-plan-preview">
					<h3>{pendingDraft.action === 'update' ? 'Confirmă actualizarea' : 'Confirmă crearea'}</h3>
					<div className="ai-chat-preview-content">
						{pendingDraft.kind === 'test' ? (
							<>
								<p><strong>Test:</strong> {pendingDraft.title}</p>
								<p>{pendingDraft.questions.length} întrebări vor fi salvate ca ciornă.</p>
								<ul>
									{pendingDraft.questions.slice(0, 8).map((question, index) => (
										<li key={`${question.content}-${index}`}>{question.content}</li>
									))}
								</ul>
							</>
						) : (
							<>
								<p><strong>Mapă:</strong> {pendingDraft.name}</p>
								{pendingDraft.description ? <p>{pendingDraft.description}</p> : null}
								{pendingDraft.course_ids?.length ? (
									<p>{pendingDraft.course_ids.length} cursuri vor fi atașate.</p>
								) : null}
							</>
						)}
					</div>
					<div className="ai-chat-plan-actions">
						<button
							type="button"
							className="ai-chat-btn ai-chat-btn-primary"
							onClick={applyPendingDraft}
							disabled={isApplying}
						>
							{isApplying ? 'Se aplică…' : 'Aplică'}
						</button>
						<button
							type="button"
							className="ai-chat-btn ai-chat-btn-secondary"
							onClick={() => setPendingDraft(null)}
							disabled={isApplying}
						>
							Renunță
						</button>
					</div>
				</div>
			)}

			{(mode === 'assist' || mode === 'workspace') && showPlanPreview && generatedPlan && (
				<div className="ai-chat-preview ai-chat-plan-preview">
					<h3>Confirmă modificările în curs</h3>
					<div className="ai-chat-preview-content">
						{generatedPlan.summary && <p><strong>Sumar:</strong> {generatedPlan.summary}</p>}
						{generatedPlan.clarification_question && (
							<p><strong>Întrebare:</strong> {generatedPlan.clarification_question}</p>
						)}
						<p>
							<strong>{summarizeAiPlanOperations(generatedPlan).total} operații</strong>
							{` · ${summarizeAiPlanOperations(generatedPlan).counts.create} noi · ${summarizeAiPlanOperations(generatedPlan).counts.update} actualizări · ${summarizeAiPlanOperations(generatedPlan).counts.delete} ștergeri`}
						</p>
						{summarizeAiPlanOperations(generatedPlan).counts.delete > 0 && (
							<p className="ai-chat-plan-warning"><strong>Atenție:</strong> unele elemente vor fi șterse.</p>
						)}
						<ul>
							{summarizeAiPlanOperations(generatedPlan).lines.slice(0, 10).map((line, index) => (
								<li key={`${line}-${index}`}>{line}</li>
							))}
						</ul>
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
							onClick={async () => {
								const applyHandler = onApplyPlan || (currentCourseId
									? (nextPlan) => applyAiCoursePlan(currentCourseId, nextPlan)
									: null);
								if (!applyHandler) return;
								setIsApplying(true);
								try {
									const result = await applyHandler(generatedPlan);
									setGeneratedPlan(null);
									showToast(`Formely AI a aplicat ${result?.appliedSteps ?? 'modificările'}.`, 'success');
								} catch (error) {
									showToast(error?.message || 'Nu am putut aplica modificările.', 'error');
								} finally {
									setIsApplying(false);
								}
							}}
							disabled={isApplying || !Array.isArray(generatedPlan.operations) || generatedPlan.operations.length === 0}
						>
							{isApplying ? 'Se aplică…' : 'Aplică modificările'}
						</button>
						<button
							type="button"
							className="ai-chat-btn ai-chat-btn-secondary"
							onClick={() => setGeneratedPlan(null)}
							disabled={isApplying}
						>
							Renunță
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
					placeholder={mode === 'workspace'
						? 'Creează un curs, o mapă, un test sau întreabă despre platformă…'
						: mode === 'create' ? 'Ex: vreau un curs de React pentru începători, orientat pe practică' : 'Scrie cererea ta...'}
					disabled={isGenerating}
				/>
				<button
					type="button"
					className="ai-chat-btn ai-chat-btn-export"
					onClick={handleDirectExport}
					disabled={!input.trim() || isGenerating}
					title="Exportă direct în Excel"
				>
					Excel
				</button>
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
