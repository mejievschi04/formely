import React, { useRef, useEffect, useLayoutEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
	CaretLeft,
	CaretRight,
	ChatCircleText,
	Circle,
	ClipboardText,
	Code,
	Eraser,
	FilePdf,
	Image,
	Link,
	ListBullets,
	ListNumbers,
	PaintBucket,
	Palette,
	TextAlignCenter,
	TextAlignLeft,
	TextAlignRight,
	TextB,
	TextItalic,
	TextStrikethrough,
	TextT,
	TextUnderline,
	VideoCamera,
} from '@phosphor-icons/react';
import { useToast } from '../contexts/ToastContext';
import { logger } from '../utils/logger';
import { estimatePdfContentPreviewHeight } from '../utils/pdfTextExtractor';
import { getPdfPageCount, slicePdfFileByRange } from '../utils/pdfRangeUtils';
import { toImageUrl } from '../utils/imageUrl';
import { adminService } from '../services/api';
import './RichTextEditor.css';

/** Paletă culori pentru text/fundal - o singură sursă pentru afișare corectă */
const RTE_COLOR_PALETTE = [
	'var(--formely-white)', '#ffcc00', '#ffd700', '#ffff00',
	'#ffffff', '#cccccc', '#999999', '#666666', '#000000',
	'#ff6b6b', '#ff5252', '#ff1744', '#d32f2f',
	'#4ade80', '#22c55e', '#10b981', '#059669',
	'#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8',
	'#a78bfa', '#8b5cf6', '#7c3aed', '#6d28d9',
	'#f472b6', '#ec4899', '#db2777', '#be185d',
];

const RTE_CALLOUT_TYPES = [
	{ id: 'soft', label: 'Round' },
	{ id: 'glow', label: 'Capsule' },
	{ id: 'outline', label: 'Cut' },
	{ id: 'stripe', label: 'Ribbon' },
	{ id: 'glass', label: 'Glass' },
	{ id: 'lifted', label: 'Panel' },
	{ id: 'bracket', label: 'Bracket' },
	{ id: 'note', label: 'Sticky Note' },
	{ id: 'neon', label: 'Neon 3D' },
	{ id: 'folded', label: 'Folded Card' },
	{ id: 'spotlight', label: 'Spotlight' },
];

const RteIcon = ({ name }) => {
	switch (name) {
		case 'expand':
			return <CaretRight size={18} weight="bold" aria-hidden="true" />;
		case 'collapse':
			return <CaretLeft size={18} weight="bold" aria-hidden="true" />;
		case 'h1':
			return <TextT size={18} weight="bold" aria-hidden="true" />;
		case 'h2':
			return <TextT size={18} weight="regular" aria-hidden="true" />;
		case 'paragraph':
			return <TextT size={18} weight="duotone" aria-hidden="true" />;
		case 'bold':
			return <TextB size={18} weight="bold" aria-hidden="true" />;
		case 'italic':
			return <TextItalic size={18} weight="bold" aria-hidden="true" />;
		case 'underline':
			return <TextUnderline size={18} weight="bold" aria-hidden="true" />;
		case 'strike':
			return <TextStrikethrough size={18} weight="bold" aria-hidden="true" />;
		case 'list-ul':
			return <ListBullets size={18} weight="bold" aria-hidden="true" />;
		case 'list-ol':
			return <ListNumbers size={18} weight="bold" aria-hidden="true" />;
		case 'align-left':
			return <TextAlignLeft size={18} weight="bold" aria-hidden="true" />;
		case 'align-center':
			return <TextAlignCenter size={18} weight="bold" aria-hidden="true" />;
		case 'align-right':
			return <TextAlignRight size={18} weight="bold" aria-hidden="true" />;
		case 'callout':
			return <ChatCircleText size={18} weight="duotone" aria-hidden="true" />;
		case 'link':
			return <Link size={18} weight="bold" aria-hidden="true" />;
		case 'image':
			return <Image size={18} weight="duotone" aria-hidden="true" />;
		case 'video':
			return <VideoCamera size={18} weight="duotone" aria-hidden="true" />;
		case 'code':
			return <Code size={18} weight="bold" aria-hidden="true" />;
		case 'pdf':
			return <FilePdf size={18} weight="duotone" aria-hidden="true" />;
		case 'text-color':
			return <Palette size={18} weight="duotone" aria-hidden="true" />;
		case 'bg-color':
			return <PaintBucket size={18} weight="duotone" aria-hidden="true" />;
		case 'clear':
			return <Eraser size={18} weight="duotone" aria-hidden="true" />;
		case 'paste':
			return <ClipboardText size={18} weight="duotone" aria-hidden="true" />;
		default:
			return <Circle size={8} weight="fill" aria-hidden="true" />;
	}
};

const RTE_PDF_IFRAME_PAD = 40;
const RTE_IMAGE_MIN_WIDTH = 20;
const RTE_IMAGE_MAX_WIDTH = 100;

function isLikelyPdfIframeSrc(src) {
	if (!src || typeof src !== 'string') return false;
	const base = src.split('#')[0].toLowerCase();
	if (base.endsWith('.pdf') || base.includes('.pdf?')) return true;
	if (base.startsWith('data:') && base.includes('application/pdf')) return true;
	return false;
}

function getRtePdfViewport(figure) {
	const first = figure.firstElementChild;
	if (first?.getAttribute?.('data-rte-pdf-viewport') === '1') return first;
	if (first?.tagName === 'DIV' && first.querySelector('iframe')) return first;
	return figure.querySelector('[data-rte-pdf-viewport]') || figure.querySelector('div');
}

function findRtePdfFigure(target, editorRoot) {
	let node = target;
	while (node && node !== editorRoot) {
		if (node.nodeType === 1 && node.tagName === 'FIGURE') {
			if (node.getAttribute('data-rte-pdf') === '1') return node;
			const iframe = node.querySelector('iframe');
			if (iframe && isLikelyPdfIframeSrc(iframe.getAttribute('src') || '')) return node;
		}
		node = node.parentElement;
	}
	return null;
}

function readRtePdfFigureLayout(figure) {
	const vhAttr = figure.getAttribute('data-viewport-height');
	const ctAttr = figure.getAttribute('data-crop-top');
	let viewportHeight = vhAttr ? parseInt(vhAttr, 10) : NaN;
	let cropTop = ctAttr ? parseInt(ctAttr, 10) : NaN;
	const viewport = getRtePdfViewport(figure);
	if (!Number.isFinite(viewportHeight) && viewport?.style?.height) {
		const m = String(viewport.style.height).match(/^(\d+(?:\.\d+)?)px$/);
		if (m) viewportHeight = Math.round(parseFloat(m[1]));
	}
	if (!Number.isFinite(viewportHeight)) viewportHeight = 400;
	if (!Number.isFinite(cropTop)) {
		const mt = viewport?.querySelector('iframe')?.style?.marginTop;
		const m = mt && String(mt).match(/^-?(\d+(?:\.\d+)?)px$/);
		cropTop = m ? Math.round(parseFloat(m[1])) : 0;
	}
	return { viewportHeight, cropTop };
}

function applyRtePdfFigureLayout(figure, viewportHeight, cropTop) {
	const vh = Math.max(80, Math.min(6000, Math.round(Number(viewportHeight) || 400)));
	const ct = Math.max(0, Math.min(2000, Math.round(Number(cropTop) || 0)));
	const viewport = getRtePdfViewport(figure);
	const iframe = viewport?.querySelector('iframe');
	if (!viewport || !iframe) return false;
	viewport.style.width = viewport.style.width || '100%';
	viewport.style.overflow = 'hidden';
	viewport.style.position = viewport.style.position || 'relative';
	viewport.style.height = `${vh}px`;
	iframe.style.height = `${vh + RTE_PDF_IFRAME_PAD + ct}px`;
	iframe.style.marginTop = `${-ct}px`;
	if (!iframe.style.marginLeft) iframe.style.marginLeft = '-80px';
	if (!iframe.style.marginRight) iframe.style.marginRight = '-80px';
	if (!iframe.style.width) iframe.style.width = 'calc(100% + 160px)';
	figure.setAttribute('data-rte-pdf', '1');
	figure.setAttribute('data-viewport-height', String(vh));
	figure.setAttribute('data-crop-top', String(ct));
	viewport.setAttribute('data-rte-pdf-viewport', '1');
	if (!figure.getAttribute('title')) {
		figure.setAttribute('title', 'Dublu-click: mânere pentru mărime și decupare (Esc = închide)');
	}
	return true;
}

function findEditableImage(target, editorRoot) {
	let node = target;
	while (node && node !== editorRoot) {
		if (node.nodeType === 1 && node.tagName === 'IMG') {
			return node;
		}
		node = node.parentElement;
	}
	return target?.tagName === 'IMG' ? target : null;
}

function readImageWidthPercent(img) {
	if (!img) return 100;
	const inlineWidth = img.style.width?.trim();
	if (inlineWidth?.endsWith('%')) {
		const parsed = parseFloat(inlineWidth);
		if (Number.isFinite(parsed)) {
			return Math.max(RTE_IMAGE_MIN_WIDTH, Math.min(RTE_IMAGE_MAX_WIDTH, parsed));
		}
	}

	if (img.parentElement) {
		const parentWidth = img.parentElement.clientWidth;
		const imageWidth = img.clientWidth;
		if (parentWidth > 0 && imageWidth > 0) {
			const percent = (imageWidth / parentWidth) * 100;
			if (Number.isFinite(percent)) {
				return Math.max(RTE_IMAGE_MIN_WIDTH, Math.min(RTE_IMAGE_MAX_WIDTH, Math.round(percent)));
			}
		}
	}

	return 100;
}

function applyImageLayout(img, widthPercent) {
	if (!img) return;
	const safeWidth = Math.max(RTE_IMAGE_MIN_WIDTH, Math.min(RTE_IMAGE_MAX_WIDTH, Math.round(Number(widthPercent) || 100)));
	img.style.width = `${safeWidth}%`;
	img.style.maxWidth = '100%';
	img.style.height = 'auto';
	img.style.display = 'block';
	img.style.borderRadius = '8px';
	img.style.margin = '1rem auto';
	img.setAttribute('data-rte-resizable-image', '1');
}

/** 'crop' = marginea de sus (decupare); 'height' = înălțime vizibilă (margine jos / laterale) */
function attachPdfLayoutPointerDrag(figure, kind, startClientY, onCommit) {
	const { viewportHeight: startH, cropTop: startC } = readRtePdfFigureLayout(figure);
	const ctx = { startY: startClientY, startH, startC };
	const onMove = (ev) => {
		const dy = ev.clientY - ctx.startY;
		if (kind === 'crop') {
			const nc = Math.max(0, Math.min(2000, Math.round(ctx.startC + dy)));
			applyRtePdfFigureLayout(figure, ctx.startH, nc);
		} else {
			const nh = Math.max(80, Math.min(6000, Math.round(ctx.startH + dy)));
			applyRtePdfFigureLayout(figure, nh, ctx.startC);
		}
	};
	const onUp = () => {
		window.removeEventListener('pointermove', onMove);
		window.removeEventListener('pointerup', onUp);
		window.removeEventListener('pointercancel', onUp);
		onCommit();
	};
	window.addEventListener('pointermove', onMove);
	window.addEventListener('pointerup', onUp);
	window.addEventListener('pointercancel', onUp);
}

const RichTextEditor = ({ value, onChange, onBlur, placeholder, style, toolbarVariant = 'full', courseId = null, showSideTools = true }) => {
	const { warning: showWarning, error: showError } = useToast();
	const editorRef = useRef(null);
	const savedSelectionRef = useRef(null);
	const [isFocused, setIsFocused] = useState(false);
	const [internalValue, setInternalValue] = useState(value || '');
	const [showColorPicker, setShowColorPicker] = useState(false);
	const [showLinkDialog, setShowLinkDialog] = useState(false);
	const [showCalloutDialog, setShowCalloutDialog] = useState(false);
	const [calloutPicker, setCalloutPicker] = useState({ open: false, x: 0, y: 0 });
	const [showPdfUpload, setShowPdfUpload] = useState(false);
	const [contextMenu, setContextMenu] = useState({ open: false, x: 0, y: 0 });
	const [colorType, setColorType] = useState('foreground'); // 'foreground' or 'background'
	const [linkUrl, setLinkUrl] = useState('');
	const [selectedColor, setSelectedColor] = useState('var(--formely-white)');
	const [selectedCalloutColor, setSelectedCalloutColor] = useState('var(--formely-white)');
	const [selectedCalloutType, setSelectedCalloutType] = useState('soft');
	const [pdfFile, setPdfFile] = useState(null);
	const [pdfFileName, setPdfFileName] = useState('');
	const [pdfTotalPages, setPdfTotalPages] = useState(0);
	const [pdfStartPage, setPdfStartPage] = useState(1);
	const [pdfEndPage, setPdfEndPage] = useState(1);
	const [uploadingPdf, setUploadingPdf] = useState(false);
	const [sideToolsExpanded, setSideToolsExpanded] = useState(false);
	const fileInputRef = useRef(null);
	const imageInputRef = useRef(null);
	const [pdfEditHost, setPdfEditHost] = useState(null);
	const [imageEditHost, setImageEditHost] = useState(null);
	const [imageWidthPercent, setImageWidthPercent] = useState(100);

	const getApiFriendlyError = (error, fallbackMessage) => {
		const data = error?.response?.data;
		if (typeof data?.message === 'string' && data.message.trim()) return data.message;
		if (data?.errors && typeof data.errors === 'object') {
			const firstField = Object.keys(data.errors)[0];
			const firstError = firstField ? data.errors[firstField]?.[0] : null;
			if (typeof firstError === 'string' && firstError.trim()) return firstError;
		}
		if (typeof error?.message === 'string' && error.message.trim()) return error.message;
		return fallbackMessage;
	};

	useEffect(() => {
		if (!contextMenu.open) return undefined;
		const closeMenu = () => setContextMenu((prev) => ({ ...prev, open: false }));
		const handleEscape = (e) => {
			if (e.key === 'Escape') {
				closeMenu();
			}
		};
		window.addEventListener('click', closeMenu);
		window.addEventListener('keydown', handleEscape);
		return () => {
			window.removeEventListener('click', closeMenu);
			window.removeEventListener('keydown', handleEscape);
		};
	}, [contextMenu.open]);

	useEffect(() => {
		if (!calloutPicker.open) return undefined;
		const closePicker = () => setCalloutPicker((prev) => ({ ...prev, open: false }));
		const handleEscape = (e) => {
			if (e.key === 'Escape') {
				closePicker();
			}
		};
		window.addEventListener('click', closePicker);
		window.addEventListener('keydown', handleEscape);
		return () => {
			window.removeEventListener('click', closePicker);
			window.removeEventListener('keydown', handleEscape);
		};
	}, [calloutPicker.open]);

	// Initialize editor content
	useEffect(() => {
		if (editorRef.current && !editorRef.current.innerHTML && value) {
			editorRef.current.innerHTML = value;
			setInternalValue(value);
		}
	}, []);

	// Sincronizare din props când părintele schimbă valoarea (ex. altă lecție). Builder-ul nu mai rescrie `value` la fiecare fetch de structură.
	useEffect(() => {
		if (!editorRef.current) return;
		if (value === undefined) return;
		const currentContent = editorRef.current.innerHTML;
		if (currentContent !== value) {
			editorRef.current.innerHTML = value || '';
			setInternalValue(value || '');
		}
	}, [value]);

	const handleInput = (e) => {
		const newValue = e.target.innerHTML;
		setInternalValue(newValue);
		if (onChange) {
			onChange(newValue);
		}
	};

	const syncEditorFromDom = () => {
		const ed = editorRef.current;
		if (!ed) return;
		const newValue = ed.innerHTML;
		setInternalValue(newValue);
		if (onChange) onChange(newValue);
	};

	const openPdfLayoutEditor = (figure) => {
		if (!figure || !editorRef.current?.contains(figure)) return;
		setPdfEditHost(figure);
	};

	const openImageLayoutEditor = useCallback((img) => {
		if (!img || !editorRef.current?.contains(img)) return;
		setImageEditHost(img);
		setImageWidthPercent(readImageWidthPercent(img));
	}, []);

	const handleEditorDoubleClick = (e) => {
		const editor = editorRef.current;
		if (!editor) return;
		const img = findEditableImage(e.target, editor);
		if (img) {
			e.preventDefault();
			e.stopPropagation();
			openImageLayoutEditor(img);
			return;
		}
		const figure = findRtePdfFigure(e.target, editor);
		if (!figure) return;
		e.preventDefault();
		e.stopPropagation();
		openPdfLayoutEditor(figure);
	};

	const closePdfInlineEdit = useCallback(() => {
		const ed = editorRef.current;
		if (ed) {
			const newValue = ed.innerHTML;
			setInternalValue(newValue);
			if (onChange) onChange(newValue);
		}
		setPdfEditHost(null);
	}, [onChange]);

	const closeImageInlineEdit = useCallback(() => {
		syncEditorFromDom();
		setImageEditHost(null);
	}, []);

	useEffect(() => {
		if (!pdfEditHost) return undefined;
		const onKey = (e) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				closePdfInlineEdit();
			}
		};
		const onDown = (e) => {
			if (pdfEditHost.contains(e.target)) return;
			closePdfInlineEdit();
		};
		window.addEventListener('keydown', onKey, true);
		document.addEventListener('mousedown', onDown, true);
		return () => {
			window.removeEventListener('keydown', onKey, true);
			document.removeEventListener('mousedown', onDown, true);
		};
	}, [pdfEditHost, closePdfInlineEdit]);

	useEffect(() => {
		if (!imageEditHost) return undefined;
		const onKey = (e) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				closeImageInlineEdit();
			}
		};
		const onDown = (e) => {
			if (imageEditHost.contains(e.target)) return;
			closeImageInlineEdit();
		};
		window.addEventListener('keydown', onKey, true);
		document.addEventListener('mousedown', onDown, true);
		return () => {
			window.removeEventListener('keydown', onKey, true);
			document.removeEventListener('mousedown', onDown, true);
		};
	}, [imageEditHost, closeImageInlineEdit]);

	useEffect(() => {
		if (pdfEditHost && !pdfEditHost.isConnected) {
			setPdfEditHost(null);
		}
	}, [value, pdfEditHost]);

	useEffect(() => {
		if (imageEditHost && !imageEditHost.isConnected) {
			setImageEditHost(null);
		}
	}, [value, imageEditHost]);

	const handlePaste = (e) => {
		e.preventDefault();
		const editor = editorRef.current;
		if (!editor) return;

		const html = e.clipboardData.getData('text/html');
		const text = e.clipboardData.getData('text/plain');
		const contentToInsert = html || text;
		if (!contentToInsert) return;

		const insertAsHtml = Boolean(html);
		const selection = window.getSelection();

		const insertAtSelection = () => {
			if (!selection || selection.rangeCount === 0) return false;
			const range = selection.getRangeAt(0);
			if (!(editor.contains(range.commonAncestorContainer) || editor === range.commonAncestorContainer)) {
				return false;
			}

			range.deleteContents();
			if (insertAsHtml) {
				const fragment = document.createRange().createContextualFragment(contentToInsert);
				const lastNode = fragment.lastChild;
				range.insertNode(fragment);
				if (lastNode) {
					range.setStartAfter(lastNode);
					range.collapse(true);
				}
			} else {
				range.insertNode(document.createTextNode(contentToInsert));
				range.collapse(false);
			}
			selection.removeAllRanges();
			selection.addRange(range);
			return true;
		};

		if (!insertAtSelection()) {
			editor.focus();
			if (insertAsHtml) {
				document.execCommand('insertHTML', false, contentToInsert);
			} else {
				document.execCommand('insertText', false, contentToInsert);
			}
		}

		// Declanșează actualizarea stării (fără asta, paste-ul nu se salvează)
		const newValue = editor.innerHTML;
		setInternalValue(newValue);
		if (onChange) onChange(newValue);
	};

	const saveSelection = () => {
		const editor = editorRef.current;
		const selection = window.getSelection();
		if (!editor || !selection || selection.rangeCount === 0) return;
		const range = selection.getRangeAt(0);
		if (editor.contains(range.commonAncestorContainer) || editor === range.commonAncestorContainer) {
			savedSelectionRef.current = range.cloneRange();
		}
	};

	const restoreSelection = () => {
		const editor = editorRef.current;
		const selection = window.getSelection();
		const savedRange = savedSelectionRef.current;
		if (!editor || !selection) return;
		editor.focus();
		if (savedRange) {
			selection.removeAllRanges();
			selection.addRange(savedRange);
		}
	};

	const handleToolMouseDown = (e) => {
		e.preventDefault();
		restoreSelection();
	};

	const execCommand = (command, value = null) => {
		restoreSelection();
		document.execCommand(command, false, value);
		editorRef.current?.focus();
		// Trigger input event to update value
		if (editorRef.current) {
			const event = new Event('input', { bubbles: true });
			editorRef.current.dispatchEvent(event);
		}
	};

	const insertNodeAtSelection = (node) => {
		restoreSelection();
		const selection = window.getSelection();
		if (selection.rangeCount > 0) {
			const range = selection.getRangeAt(0);
			range.insertNode(node);
		} else {
			editorRef.current?.appendChild(node);
		}
		if (editorRef.current) {
			const event = new Event('input', { bubbles: true });
			editorRef.current.dispatchEvent(event);
		}
	};

	const handleColorSelect = (color) => {
		setSelectedColor(color);
		if (colorType === 'foreground') {
			execCommand('foreColor', color);
		} else {
			execCommand('backColor', color);
		}
		setShowColorPicker(false);
	};

	const handleLinkInsert = () => {
		if (linkUrl.trim()) {
			let url = linkUrl.trim();
			if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('mailto:')) {
				url = 'https://' + url;
			}
			execCommand('createLink', url);
			setLinkUrl('');
			setShowLinkDialog(false);
		}
	};

	const applyCalloutBlock = useCallback((type, color) => {
		restoreSelection();
		const editor = editorRef.current;
		const selection = window.getSelection();
		if (!editor || !selection) return;

		const activeRange = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
		const startNode = activeRange?.startContainer || null;
		const existingCallout = startNode?.nodeType === 1
			? startNode.closest?.('blockquote[data-callout-box="true"]')
			: startNode?.parentElement?.closest?.('blockquote[data-callout-box="true"]');

		if (existingCallout) {
			existingCallout.setAttribute('data-callout-type', type);
			existingCallout.style.setProperty('--rte-callout-accent', color);
		} else {
			const block = document.createElement('blockquote');
			block.setAttribute('data-callout-box', 'true');
			block.setAttribute('data-callout-type', type);
			block.style.setProperty('--rte-callout-accent', color);

			const contentWrap = document.createElement('div');
			contentWrap.className = 'rte-callout-content';

			if (activeRange && !activeRange.collapsed) {
				contentWrap.appendChild(activeRange.extractContents());
			} else {
				const paragraph = document.createElement('p');
				paragraph.textContent = 'Scrie aici continutul chenarului...';
				contentWrap.appendChild(paragraph);
			}

			block.appendChild(contentWrap);

			if (activeRange) {
				activeRange.insertNode(block);
				const newRange = document.createRange();
				newRange.selectNodeContents(contentWrap);
				newRange.collapse(false);
				selection.removeAllRanges();
				selection.addRange(newRange);
				savedSelectionRef.current = newRange.cloneRange();
			} else {
				editor.appendChild(block);
			}
		}

		editor.focus();
		const event = new Event('input', { bubbles: true });
		editor.dispatchEvent(event);
	}, [restoreSelection]);

	const openCalloutPickerAt = useCallback((x, y) => {
		saveSelection();
		setCalloutPicker({ open: true, x, y });
	}, [saveSelection]);

	const handleInlineCalloutTypeChange = useCallback((type) => {
		setSelectedCalloutType(type);
		applyCalloutBlock(type, selectedCalloutColor);
	}, [applyCalloutBlock, selectedCalloutColor]);

	const handleInlineCalloutColorChange = useCallback((color) => {
		setSelectedCalloutColor(color);
		applyCalloutBlock(selectedCalloutType, color);
	}, [applyCalloutBlock, selectedCalloutType]);

	const handleEditorKeyDown = useCallback((e) => {
		if (e.key !== 'Enter' || e.shiftKey) return;
		const selection = window.getSelection();
		if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) return;

		const range = selection.getRangeAt(0);
		const startNode = range.startContainer;
		const callout = startNode?.nodeType === 1
			? startNode.closest?.('blockquote[data-callout-box="true"]')
			: startNode?.parentElement?.closest?.('blockquote[data-callout-box="true"]');
		if (!callout) return;

		const blockNode = startNode?.nodeType === 1
			? startNode.closest?.('p, div, li')
			: startNode?.parentElement?.closest?.('p, div, li');
		if (!blockNode || !callout.contains(blockNode)) return;

		const blockText = (blockNode.textContent || '').replace(/\u200B/g, '').trim();
		if (blockText !== '') return;

		e.preventDefault();

		const editor = editorRef.current;
		if (!editor) return;

		const nextParagraph = document.createElement('p');
		nextParagraph.innerHTML = '<br>';

		if (callout.nextSibling) {
			callout.parentNode.insertBefore(nextParagraph, callout.nextSibling);
		} else {
			callout.parentNode.appendChild(nextParagraph);
		}

		const exitRange = document.createRange();
		exitRange.setStart(nextParagraph, 0);
		exitRange.collapse(true);
		selection.removeAllRanges();
		selection.addRange(exitRange);
		savedSelectionRef.current = exitRange.cloneRange();

		editor.focus();
		const event = new Event('input', { bubbles: true });
		editor.dispatchEvent(event);
	}, []);

	useEffect(() => {
		if (!showCalloutDialog) return;
		const shellRect = editorRef.current?.getBoundingClientRect?.();
		const x = shellRect ? Math.min(window.innerWidth - 380, shellRect.left + 24) : 120;
		const y = shellRect ? Math.min(window.innerHeight - 420, shellRect.top + 24) : 120;
		openCalloutPickerAt(Math.max(16, x), Math.max(16, y));
		setShowCalloutDialog(false);
	}, [openCalloutPickerAt, showCalloutDialog]);

	const handlePdfSelect = async (e) => {
		const file = e.target.files[0];
		if (file) {
			if (file.type !== 'application/pdf') {
				showWarning('Te rugăm să selectezi un fișier PDF!');
				return;
			}
			if (file.size > 10 * 1024 * 1024) { // 10MB limit
				showWarning('Fișierul PDF este prea mare! Maxim 10MB.');
				return;
			}
			try {
				const pageCount = await getPdfPageCount(file);
				setPdfFile(file);
				setPdfFileName(file.name);
				setPdfTotalPages(pageCount);
				setPdfStartPage(1);
				setPdfEndPage(Math.max(1, pageCount));
			} catch (error) {
				logger.error('Error reading PDF metadata:', error);
				showError(getApiFriendlyError(error, 'Nu am putut citi paginile PDF-ului.'));
			}
		}
	};

	const handlePdfUpload = async () => {
		if (!pdfFile) return;

		setUploadingPdf(true);
		try {
			let fileToUpload = pdfFile;
			const canSlice = pdfTotalPages > 0 && (pdfStartPage > 1 || pdfEndPage < pdfTotalPages);
			if (canSlice) {
				fileToUpload = await slicePdfFileByRange(pdfFile, pdfStartPage, pdfEndPage);
			}

			let pdfUrl = '';
			if (courseId) {
				const formData = new FormData();
				formData.append('file', fileToUpload);
				formData.append('type', 'document');
				const result = await adminService.builderUploadContentFile(courseId, formData);
				const serveUrl = result?.serve_url
					|| (result?.media_asset_id ? `/api/admin/courses/${courseId}/builder/media/${result.media_asset_id}/file` : '');
				pdfUrl = serveUrl || result?.url || result?.path || '';
			} else {
				const reader = new FileReader();
				pdfUrl = await new Promise((resolve, reject) => {
					reader.onload = () => resolve(String(reader.result || ''));
					reader.onerror = reject;
					reader.readAsDataURL(fileToUpload);
				});
			}

			const normalizedUrl = toImageUrl(pdfUrl) || pdfUrl;
			if (!normalizedUrl) {
				throw new Error('Nu am primit URL pentru PDF.');
			}
			const adaptiveHeight = await estimatePdfContentPreviewHeight(fileToUpload);
			const safeViewportHeight = adaptiveHeight;

			const wrapper = document.createElement('figure');
			wrapper.style.margin = '0.85rem 0';
			wrapper.style.display = 'block';
			wrapper.style.width = '100%';

			const pdfViewport = document.createElement('div');
			pdfViewport.style.width = '100%';
			pdfViewport.style.height = `${safeViewportHeight}px`;
			pdfViewport.style.overflow = 'hidden';
			pdfViewport.style.border = 'none';
			pdfViewport.style.borderRadius = '0';
			pdfViewport.style.position = 'relative';
			pdfViewport.style.background = 'transparent';

			const iframe = document.createElement('iframe');
			iframe.src = `${normalizedUrl}#toolbar=0&navpanes=0&scrollbar=0&statusbar=0&messages=0&view=FitH`;
			iframe.style.width = 'calc(100% + 160px)';
			iframe.style.height = `${safeViewportHeight + 40}px`;
			iframe.style.marginTop = '0';
			iframe.style.marginLeft = '-80px';
			iframe.style.marginRight = '-80px';
			iframe.style.border = 'none';
			iframe.style.display = 'block';
			iframe.style.background = 'transparent';
			iframe.style.pointerEvents = 'none';
			iframe.setAttribute('scrolling', 'no');
			iframe.setAttribute('title', pdfFileName || pdfFile.name || 'Document PDF');
			pdfViewport.appendChild(iframe);
			wrapper.appendChild(pdfViewport);
			wrapper.setAttribute('data-rte-pdf', '1');
			wrapper.setAttribute('data-viewport-height', String(safeViewportHeight));
			wrapper.setAttribute('data-crop-top', '0');
			wrapper.setAttribute('title', 'Dublu-click: mânere pentru mărime și decupare (Esc = închide)');
			pdfViewport.setAttribute('data-rte-pdf-viewport', '1');
			insertNodeAtSelection(wrapper);

			if (editorRef.current) {
				editorRef.current.focus();
			}

			setPdfFile(null);
			setPdfFileName('');
			setPdfTotalPages(0);
			setPdfStartPage(1);
			setPdfEndPage(1);
			setShowPdfUpload(false);
			if (fileInputRef.current) {
				fileInputRef.current.value = '';
			}
		} catch (error) {
			logger.error('Error inserting PDF file:', error);
			showError(getApiFriendlyError(error, 'Eroare la inserarea PDF-ului. Încearcă din nou.'));
		} finally {
			setUploadingPdf(false);
		}
	};

	const insertImageByUrl = (imageUrl) => {
		if (!imageUrl) return;
		const normalizedUrl = toImageUrl(imageUrl) || imageUrl;
		const img = document.createElement('img');
		img.src = normalizedUrl;
		applyImageLayout(img, 100);
		insertNodeAtSelection(img);
	};

	const handleImageSelected = async (event) => {
		const file = event.target.files?.[0];
		if (!file) return;
		if (!file.type.startsWith('image/')) {
			showWarning('Te rugăm să selectezi un fișier imagine.');
			event.target.value = '';
			return;
		}

		try {
			if (courseId) {
				const formData = new FormData();
				formData.append('file', file);
				formData.append('type', 'image');
				const result = await adminService.builderUploadContentFile(courseId, formData);
				insertImageByUrl(result?.url || '');
			} else {
				const reader = new FileReader();
				const dataUrl = await new Promise((resolve, reject) => {
					reader.onload = () => resolve(reader.result);
					reader.onerror = reject;
					reader.readAsDataURL(file);
				});
				insertImageByUrl(String(dataUrl || ''));
			}
		} catch (error) {
			logger.error('Error uploading image for editor:', error);
			showError(getApiFriendlyError(error, 'Eroare la încărcarea imaginii.'));
		} finally {
			event.target.value = '';
		}
	};

	const insertVideoFromPrompt = () => {
		const url = prompt('Introdu URL-ul video (YouTube, Vimeo, etc.):');
		if (!url || !url.trim()) return;
		let embedUrl = url.trim();

		if (embedUrl.includes('youtube.com/watch') || embedUrl.includes('youtu.be/')) {
			const videoId = embedUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/)?.[1];
			if (videoId) embedUrl = `https://www.youtube.com/embed/${videoId}`;
		} else if (embedUrl.includes('vimeo.com/')) {
			const videoId = embedUrl.match(/vimeo\.com\/(\d+)/)?.[1];
			if (videoId) embedUrl = `https://player.vimeo.com/video/${videoId}`;
		}

		const iframe = document.createElement('iframe');
		iframe.src = embedUrl;
		iframe.style.width = '100%';
		iframe.style.height = '400px';
		iframe.style.border = 'none';
		iframe.style.borderRadius = '8px';
		iframe.style.margin = '1rem 0';
		iframe.allowFullscreen = true;

		const container = document.createElement('div');
		container.style.margin = '1rem 0';
		container.appendChild(iframe);
		insertNodeAtSelection(container);
	};

	const insertCodeFromPrompt = () => {
		const code = prompt('Introdu codul:');
		if (!code || !code.trim()) return;
		const pre = document.createElement('pre');
		pre.style.background = 'rgba(0, 0, 0, 0.3)';
		pre.style.padding = '1rem';
		pre.style.borderRadius = '8px';
		pre.style.overflow = 'auto';
		pre.style.margin = '1rem 0';
		pre.style.border = '1px solid rgba(9, 168, 107, 0.2)';

		const codeEl = document.createElement('code');
		codeEl.textContent = code.trim();
		codeEl.style.color = '#09A86B';
		codeEl.style.fontFamily = 'monospace';
		codeEl.style.fontSize = '0.9rem';
		pre.appendChild(codeEl);
		insertNodeAtSelection(pre);
	};

	const handlePastePlainFromClipboard = async () => {
		const dispatchInputUpdate = () => {
			if (editorRef.current) {
				const event = new Event('input', { bubbles: true });
				editorRef.current.dispatchEvent(event);
			}
		};

		const insertPlainText = (text) => {
			if (!text) return false;
			restoreSelection();
			editorRef.current?.focus();
			const inserted = document.execCommand('insertText', false, text);
			if (!inserted) {
				const selection = window.getSelection();
				if (!selection || selection.rangeCount === 0) return false;
				const range = selection.getRangeAt(0);
				range.deleteContents();
				range.insertNode(document.createTextNode(text));
				range.collapse(false);
				selection.removeAllRanges();
				selection.addRange(range);
			}
			dispatchInputUpdate();
			return true;
		};

		try {
			let clipboardText = null;
			if (navigator.clipboard && navigator.clipboard.readText) {
				clipboardText = await navigator.clipboard.readText();
			}
			if (insertPlainText(String(clipboardText || ''))) {
				return;
			}

			// Fallback pentru browsere care blochează accesul la clipboard din JS.
			const manualText = window.prompt('Clipboard blocat de browser. Lipește aici textul simplu (Ctrl+V):', '');
			if (manualText !== null) {
				insertPlainText(manualText);
			}
		} catch (error) {
			logger.error('Clipboard read failed:', error);
			const manualText = window.prompt('Nu am putut accesa clipboard-ul. Lipește aici textul simplu (Ctrl+V):', '');
			if (manualText !== null) {
				insertPlainText(manualText);
				return;
			}
			showWarning('Lipirea simplă a fost anulată.');
		}
	};

	const ToolbarButton = ({ onClick, icon, title, active = false, className = '' }) => (
		<button
			type="button"
			onMouseDown={handleToolMouseDown}
			onClick={onClick}
			title={title}
			className={`rte-toolbar-btn ${active ? 'active' : ''} ${className}`.trim()}
		>
			{icon}
		</button>
	);

	const sideToolGroups = [
		[
			{ key: 'h1', label: 'Titlu H1', icon: 'h1', onClick: () => execCommand('formatBlock', 'h1') },
			{ key: 'h2', label: 'Titlu H2', icon: 'h2', onClick: () => execCommand('formatBlock', 'h2') },
			{ key: 'p', label: 'Paragraf', icon: 'paragraph', onClick: () => execCommand('formatBlock', 'p') },
		],
		[
			{ key: 'bold', label: 'Aldin', icon: 'bold', onClick: () => execCommand('bold') },
			{ key: 'italic', label: 'Italic', icon: 'italic', onClick: () => execCommand('italic') },
			{ key: 'underline', label: 'Subliniat', icon: 'underline', onClick: () => execCommand('underline') },
			{ key: 'strike', label: 'Tăiat', icon: 'strike', onClick: () => execCommand('strikeThrough') },
			{ key: 'ul', label: 'Listă puncte', icon: 'list-ul', onClick: () => execCommand('insertUnorderedList') },
			{ key: 'ol', label: 'Listă numerică', icon: 'list-ol', onClick: () => execCommand('insertOrderedList') },
		],
		[
			{ key: 'left', label: 'Aliniere stânga', icon: 'align-left', onClick: () => execCommand('justifyLeft') },
			{ key: 'center', label: 'Aliniere centru', icon: 'align-center', onClick: () => execCommand('justifyCenter') },
			{ key: 'right', label: 'Aliniere dreapta', icon: 'align-right', onClick: () => execCommand('justifyRight') },
			{ key: 'link', label: 'Inserare link', icon: 'link', onClick: () => setShowLinkDialog(true) },
		],
		[
			{ key: 'tx', label: 'Culoare text', icon: 'text-color', onClick: () => { setColorType('foreground'); setShowColorPicker(true); } },
			{ key: 'bg', label: 'Culoare fundal', icon: 'bg-color', onClick: () => { setColorType('background'); setShowColorPicker(true); } },
			{ key: 'clear', label: 'Curăță format', icon: 'clear', onClick: () => execCommand('removeFormat') },
		],
	];

	return (
		<div className="rte-container" style={style}>
			{toolbarVariant !== 'side-only' && (
				<div className="rte-toolbar">
					<div className="rte-toolbar-group rte-toolbar-group-labeled">
						<span className="rte-toolbar-label" id="rte-format-label">Stil:</span>
						<select
							className="rte-toolbar-select"
							onMouseDown={handleToolMouseDown}
							onChange={(e) => {
								if (e.target.value === '') {
									execCommand('formatBlock', 'div');
								} else {
									execCommand('formatBlock', e.target.value);
								}
								e.target.value = '';
							}}
							title="Alege stilul paragrafului: titlu principal, titlu (antet), subtitlu sau paragraf normal"
							aria-labelledby="rte-format-label"
						>
							<option value="">Paragraf / Titlu</option>
							<option value="h1">Titlu principal (cel mai mare)</option>
							<option value="h2">Titlu (antet)</option>
							<option value="h3">Subtitlu</option>
							<option value="h4">Subtițior</option>
							<option value="p">Paragraf normal</option>
						</select>
					</div>

					<div className="rte-toolbar-separator" />
					<div className="rte-toolbar-group rte-toolbar-group-labeled">
						<span className="rte-toolbar-label" id="rte-text-label">Text:</span>
						<ToolbarButton onClick={() => execCommand('bold')} icon={<strong>B</strong>} title="Aldin (text gros)" />
						<ToolbarButton onClick={() => execCommand('italic')} icon={<em>I</em>} title="Italic (text înclinat)" />
						<ToolbarButton onClick={() => execCommand('underline')} icon={<u>U</u>} title="Subliniat" />
						<ToolbarButton onClick={() => execCommand('strikeThrough')} icon={<span style={{ textDecoration: 'line-through' }}>S</span>} title="Tăiat (text barat)" />
					</div>

					<div className="rte-toolbar-separator" />
					<div className="rte-toolbar-group rte-toolbar-group-labeled">
						<span className="rte-toolbar-label" id="rte-list-label">Liste:</span>
						<ToolbarButton onClick={() => execCommand('insertUnorderedList')} icon="•" title="Listă cu puncte (bullet)" />
						<ToolbarButton onClick={() => execCommand('insertOrderedList')} icon="1." title="Listă numerotată (1, 2, 3…)" />
						<ToolbarButton onClick={() => execCommand('outdent')} icon="←" title="Micșorează alinierea (indent stânga)" />
						<ToolbarButton onClick={() => execCommand('indent')} icon="→" title="Mărește alinierea (indent dreapta)" />
					</div>

					<div className="rte-toolbar-separator" />
					<div className="rte-toolbar-group rte-toolbar-group-labeled">
						<span className="rte-toolbar-label" id="rte-align-label">Aliniere:</span>
						<ToolbarButton onClick={() => execCommand('justifyLeft')} icon="L" title="Aliniere la stânga" />
						<ToolbarButton onClick={() => execCommand('justifyCenter')} icon="C" title="Aliniere la centru" />
						<ToolbarButton onClick={() => execCommand('justifyRight')} icon="R" title="Aliniere la dreapta" />
						<ToolbarButton onClick={() => execCommand('justifyFull')} icon="J" title="Aliniere pe toată lățimea (justificat)" />
					</div>

					<div className="rte-toolbar-separator" />
					<div className="rte-toolbar-group rte-toolbar-group-labeled">
						<span className="rte-toolbar-label">Mai mult:</span>
						<ToolbarButton onClick={() => execCommand('formatBlock', 'blockquote')} icon="❝" title="Citat (bloc evidențiat)" />
						<ToolbarButton
							onClick={() => setShowCalloutDialog(true)}
							icon="▣"
							title="Chenар stilizat"
						/>
						<ToolbarButton onClick={() => setShowLinkDialog(true)} icon="🔗" title="Inserare link (legătură)" />
						<ToolbarButton
							onClick={() => {
								setColorType('foreground');
								setShowColorPicker(true);
							}}
							icon="🎨"
							title="Culoare text"
						/>
						<ToolbarButton
							onClick={() => {
								setColorType('background');
								setShowColorPicker(true);
							}}
							icon="🖌️"
							title="Culoare fundal"
						/>
						<ToolbarButton onClick={() => execCommand('removeFormat')} icon="🧹" title="Șterge formatare (revine la text simplu)" />
					</div>

					<div className="rte-toolbar-separator" />
					<div className="rte-toolbar-group rte-toolbar-group-labeled">
						<span className="rte-toolbar-label">Media:</span>
						<span className="rte-toolbar-context-note">Inserare prin click dreapta pe foaie</span>
					</div>
				</div>
			)}

			{/* Hidden file input */}
			<input
				ref={fileInputRef}
				type="file"
				accept="application/pdf"
				onChange={handlePdfSelect}
				style={{ display: 'none' }}
			/>
			<input
				ref={imageInputRef}
				type="file"
				accept="image/*"
				onChange={handleImageSelected}
				style={{ display: 'none' }}
			/>

			<div className="rte-editor-shell">
				{/* Editor */}
				<div
					ref={editorRef}
					contentEditable
					className={`rte-editor ${isFocused ? 'focused' : ''}`}
					onInput={handleInput}
					onDoubleClick={handleEditorDoubleClick}
					onPaste={handlePaste}
					onContextMenu={(e) => {
						e.preventDefault();
						saveSelection();
						setContextMenu({ open: true, x: e.clientX, y: e.clientY });
					}}
					onMouseUp={saveSelection}
					onKeyDown={handleEditorKeyDown}
					onKeyUp={saveSelection}
					onFocus={() => setIsFocused(true)}
					onBlur={(e) => {
						// Trimite ultima versiune din DOM înainte de flush la părinte (formatări din toolbar, paste etc. pot să nu fi declanșat încă onInput).
						syncEditorFromDom();
						setIsFocused(false);
						saveSelection();
						if (onBlur) onBlur(e);
					}}
					data-placeholder={placeholder}
					suppressContentEditableWarning
				/>

				{showSideTools && (
					<div className={`rte-side-tools ${sideToolsExpanded ? 'is-expanded' : ''}`} aria-label="Panou vertical de editare text">
						<button
							type="button"
							className="rte-side-tools-toggle"
							onMouseDown={handleToolMouseDown}
							onClick={() => setSideToolsExpanded((current) => !current)}
							title={sideToolsExpanded ? 'Restrânge panoul' : 'Extinde panoul cu denumiri'}
						>
							<span className="rte-side-tool-icon"><RteIcon name={sideToolsExpanded ? 'collapse' : 'expand'} /></span>
							{sideToolsExpanded && <span className="rte-side-tool-label">Instrumente</span>}
						</button>
						{sideToolGroups.map((group, groupIndex) => (
							<React.Fragment key={`group-${groupIndex}`}>
								{group.map((item) => (
									<button
										key={item.key}
										type="button"
										className="rte-side-tool-btn-modern"
										onMouseDown={handleToolMouseDown}
										onClick={item.onClick}
										title={item.label}
									>
										<span className="rte-side-tool-icon"><RteIcon name={item.icon} /></span>
										{sideToolsExpanded && <span className="rte-side-tool-label">{item.label}</span>}
									</button>
								))}
								{groupIndex < sideToolGroups.length - 1 ? <span className="rte-side-tool-separator" aria-hidden="true" /> : null}
							</React.Fragment>
						))}
					</div>
				)}
			</div>

			{contextMenu.open && (
				<div
					className="rte-context-menu"
					style={{ top: contextMenu.y, left: contextMenu.x }}
					onClick={(e) => e.stopPropagation()}
				>
					<button
						type="button"
						onMouseDown={handleToolMouseDown}
						onClick={() => {
							imageInputRef.current?.click();
							setContextMenu((prev) => ({ ...prev, open: false }));
						}}
					>
						<span className="rte-context-menu-icon"><RteIcon name="image" /></span>
						<span>Imagine din fișier</span>
					</button>
					<button
						type="button"
						onMouseDown={handleToolMouseDown}
						onClick={() => {
							insertVideoFromPrompt();
							setContextMenu((prev) => ({ ...prev, open: false }));
						}}
					>
						<span className="rte-context-menu-icon"><RteIcon name="video" /></span>
						<span>Video (link)</span>
					</button>
					<button
						type="button"
						onMouseDown={handleToolMouseDown}
						onClick={() => {
							setShowPdfUpload(true);
							fileInputRef.current?.click();
							setContextMenu((prev) => ({ ...prev, open: false }));
						}}
					>
						<span className="rte-context-menu-icon"><RteIcon name="pdf" /></span>
						<span>PDF din fișier</span>
					</button>
					<button
						type="button"
						onMouseDown={handleToolMouseDown}
						onClick={() => {
							openCalloutPickerAt(contextMenu.x + 12, contextMenu.y + 8);
							setContextMenu((prev) => ({ ...prev, open: false }));
						}}
					>
						<span className="rte-context-menu-icon"><RteIcon name="callout" /></span>
						<span>Chenar stilizat</span>
					</button>
					<span className="rte-context-menu-separator" aria-hidden="true" />
					<button
						type="button"
						onMouseDown={handleToolMouseDown}
						onClick={async () => {
							await handlePastePlainFromClipboard();
							setContextMenu((prev) => ({ ...prev, open: false }));
						}}
					>
						<span className="rte-context-menu-icon"><RteIcon name="paste" /></span>
						<span>Lipește text simplu</span>
					</button>
				</div>
			)}

			{/* Color Picker Modal */}
			{showColorPicker && (
				<ColorPickerModal
					palette={RTE_COLOR_PALETTE}
					selectedColor={selectedColor}
					onColorSelect={handleColorSelect}
					onClose={() => setShowColorPicker(false)}
					type={colorType}
				/>
			)}

			{/* Link Dialog Modal */}
			{showLinkDialog && (
				<LinkDialogModal
					linkUrl={linkUrl}
					setLinkUrl={setLinkUrl}
					onInsert={handleLinkInsert}
					onClose={() => {
						setShowLinkDialog(false);
						setLinkUrl('');
					}}
				/>
			)}

			{calloutPicker.open && (
				<CalloutInlinePanel
					palette={RTE_COLOR_PALETTE}
					types={RTE_CALLOUT_TYPES}
					selectedType={selectedCalloutType}
					selectedColor={selectedCalloutColor}
					position={calloutPicker}
					onTypeChange={handleInlineCalloutTypeChange}
					onColorChange={handleInlineCalloutColorChange}
					onClose={() => setCalloutPicker((prev) => ({ ...prev, open: false }))}
				/>
			)}

			{/* PDF Upload Modal */}
			{showPdfUpload && (
				<PdfUploadModal
					pdfFile={pdfFile}
					pdfFileName={pdfFileName}
					pdfTotalPages={pdfTotalPages}
					pdfStartPage={pdfStartPage}
					pdfEndPage={pdfEndPage}
					onStartPageChange={setPdfStartPage}
					onEndPageChange={setPdfEndPage}
					uploadingPdf={uploadingPdf}
					onFileSelect={() => fileInputRef.current?.click()}
					onUpload={handlePdfUpload}
					onClose={() => {
						setShowPdfUpload(false);
						setPdfFile(null);
						setPdfFileName('');
						setPdfTotalPages(0);
						setPdfStartPage(1);
						setPdfEndPage(1);
						if (fileInputRef.current) {
							fileInputRef.current.value = '';
						}
					}}
				/>
			)}

			{pdfEditHost
				? createPortal(
					<PdfInlineEditChrome figure={pdfEditHost} onSync={syncEditorFromDom} />,
					pdfEditHost,
				)
				: null}

			{imageEditHost
				? createPortal(
					<ImageInlineEditChrome
						image={imageEditHost}
						widthPercent={imageWidthPercent}
						onWidthChange={(nextWidth) => {
							setImageWidthPercent(nextWidth);
							applyImageLayout(imageEditHost, nextWidth);
							syncEditorFromDom();
						}}
					/>,
					document.body,
				)
				: null}
		</div>
	);
};

const PDF_HANDLES = [
	{ pos: 'nw', kind: 'crop', cursor: 'nwse-resize' },
	{ pos: 'n', kind: 'crop', cursor: 'ns-resize' },
	{ pos: 'ne', kind: 'crop', cursor: 'nesw-resize' },
	{ pos: 'e', kind: 'height', cursor: 'ew-resize' },
	{ pos: 'se', kind: 'height', cursor: 'nwse-resize' },
	{ pos: 's', kind: 'height', cursor: 'ns-resize' },
	{ pos: 'sw', kind: 'height', cursor: 'nesw-resize' },
	{ pos: 'w', kind: 'height', cursor: 'ew-resize' },
];

const PdfInlineEditChrome = ({ figure, onSync }) => {
	useLayoutEffect(() => {
		figure.classList.add('rte-pdf-figure--editing');
		return () => {
			figure.classList.remove('rte-pdf-figure--editing');
		};
	}, [figure]);

	const onHandleDown = (kind) => (e) => {
		e.preventDefault();
		e.stopPropagation();
		if (e.button !== 0) return;
		attachPdfLayoutPointerDrag(figure, kind, e.clientY, onSync);
	};

	return (
		<div
			className="rte-pdf-chrome"
			contentEditable={false}
			suppressContentEditableWarning
			role="presentation"
		>
			<div className="rte-pdf-chrome-hint" aria-hidden="true">
				Trage de mânere — sus: decupare, jos/laterale: înălțime · Esc sau click în afară
			</div>
			<div className="rte-pdf-chrome-frame" aria-hidden="true" />
			{PDF_HANDLES.map(({ pos, kind, cursor }) => (
				<div
					key={pos}
					className={`rte-pdf-chrome-handle rte-pdf-chrome-handle--${pos}`}
					style={{ cursor }}
					role="slider"
					tabIndex={-1}
					aria-label={kind === 'crop' ? 'Decupare sus' : 'Înălțime'}
					onPointerDown={onHandleDown(kind)}
				/>
			))}
		</div>
	);
};

const IMAGE_PRESET_WIDTHS = [25, 40, 60, 80, 100];

const ImageInlineEditChrome = ({ image, widthPercent, onWidthChange }) => {
	const [position, setPosition] = useState(null);

	useLayoutEffect(() => {
		image.classList.add('rte-image--editing');
		const updatePosition = () => {
			if (!image.isConnected) return;
			const rect = image.getBoundingClientRect();
			setPosition({
				top: Math.max(12, rect.top - 88),
				left: rect.left + rect.width / 2,
			});
		};
		updatePosition();
		window.addEventListener('resize', updatePosition);
		window.addEventListener('scroll', updatePosition, true);
		return () => {
			image.classList.remove('rte-image--editing');
			window.removeEventListener('resize', updatePosition);
			window.removeEventListener('scroll', updatePosition, true);
		};
	}, [image]);

	if (!position) {
		return null;
	}

	return (
		<div
			className="rte-image-chrome"
			contentEditable={false}
			style={{ top: position.top, left: position.left }}
		>
			<div className="rte-image-toolbar" onMouseDown={(e) => e.preventDefault()}>
				<span className="rte-image-toolbar__label">Dimensiune imagine</span>
				<input
					type="range"
					min={RTE_IMAGE_MIN_WIDTH}
					max={RTE_IMAGE_MAX_WIDTH}
					step="5"
					value={widthPercent}
					onChange={(e) => onWidthChange(Number(e.target.value))}
				/>
				<span className="rte-image-toolbar__value">{Math.round(widthPercent)}%</span>
			</div>
			<div className="rte-image-presets" onMouseDown={(e) => e.preventDefault()}>
				{IMAGE_PRESET_WIDTHS.map((preset) => (
					<button
						key={preset}
						type="button"
						className={`rte-image-preset${Math.round(widthPercent) === preset ? ' is-active' : ''}`}
						onClick={() => onWidthChange(preset)}
					>
						{preset}%
					</button>
				))}
			</div>
		</div>
	);
};

// Color Picker Modal Component
const ColorPickerModal = ({ palette = RTE_COLOR_PALETTE, selectedColor, onColorSelect, onClose, type }) => {
	const [customColor, setCustomColor] = useState(selectedColor || 'var(--formely-white)');

	useEffect(() => {
		setCustomColor(selectedColor || 'var(--formely-white)');
	}, [selectedColor]);

	const colors = Array.isArray(palette) && palette.length > 0 ? palette : RTE_COLOR_PALETTE;

	return (
		<div
			className="rte-modal-overlay"
			onClick={onClose}
			role="dialog"
			aria-modal="true"
			aria-labelledby="rte-color-picker-title"
		>
			<div
				className="rte-modal"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="rte-modal-header">
					<h3 id="rte-color-picker-title" className="rte-modal-title">
						{type === 'foreground' ? '🎨 Culoare text' : '🖌️ Culoare fundal'}
					</h3>
					<button
						type="button"
						onClick={onClose}
						className="rte-modal-close"
						aria-label="Închide"
					>
						×
					</button>
				</div>

				<div className="rte-modal-body">
					{/* Paletă culori - grid cu clase CSS pentru încărcare corectă */}
					<div style={{ marginBottom: '1.5rem' }}>
						<label className="rte-color-palette-label">
							Paletă de culori
						</label>
						{/* div cu role="button" ca să nu se aplice stilurile globale de pe button */}
						<style>{colors.map((hex, i) => 
							`.rte-color-palette-grid .rte-color-swatch.rte-swatch-idx-${i} { background-color: ${hex} !important; background: ${hex} !important; }`
						).join('\n')}</style>
						<div className="rte-color-palette-grid">
							{colors.map((hex, i) => (
								<div
									key={`${hex}-${i}`}
									role="button"
									tabIndex={0}
									className={`rte-color-swatch rte-swatch-idx-${i} ${selectedColor === hex ? 'is-selected' : ''}`}
									onClick={() => onColorSelect(hex)}
									onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onColorSelect(hex); } }}
									title={hex}
									aria-label={`Culoare ${hex}`}
								/>
							))}
						</div>
					</div>

					{/* Custom Color Input */}
					<div>
						<label style={{
							display: 'block',
							marginBottom: '0.75rem',
							color: 'rgba(255,255,255,0.7)',
							fontSize: '0.9rem',
							fontWeight: 600,
						}}>
							Culoare personalizată
						</label>
						<div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
							<input
								type="color"
								value={customColor}
								onChange={(e) => setCustomColor(e.target.value)}
								style={{
									width: '60px',
									height: '40px',
									border: '1px solid rgba(var(--formely-white-rgb), 0.3)',
									borderRadius: '8px',
									cursor: 'pointer',
									background: 'transparent',
								}}
							/>
							<input
								type="text"
								value={customColor}
								onChange={(e) => setCustomColor(e.target.value)}
								placeholder="var(--formely-white)"
								style={{
									flex: 1,
									padding: '0.75rem',
									background: 'rgba(255,255,255,0.05)',
									border: '1px solid rgba(var(--formely-white-rgb), 0.2)',
									borderRadius: '10px',
									color: '#fff',
									fontSize: '0.95rem',
								}}
							/>
							<button
								type="button"
								onClick={() => onColorSelect(customColor)}
								style={{
									padding: '0.75rem 1.5rem',
									background: 'linear-gradient(135deg, rgba(var(--formely-white-rgb), 0.2), rgba(var(--formely-white-rgb), 0.15))',
									border: '1px solid rgba(var(--formely-white-rgb), 0.4)',
									borderRadius: '10px',
									color: 'var(--formely-white)',
									fontWeight: 700,
									cursor: 'pointer',
									transition: 'all 0.3s ease',
								}}
								onMouseEnter={(e) => {
									e.currentTarget.style.background = 'linear-gradient(135deg, rgba(var(--formely-white-rgb), 0.3), rgba(var(--formely-white-rgb), 0.2))';
									e.currentTarget.style.transform = 'translateY(-2px)';
								}}
								onMouseLeave={(e) => {
									e.currentTarget.style.background = 'linear-gradient(135deg, rgba(var(--formely-white-rgb), 0.2), rgba(var(--formely-white-rgb), 0.15))';
									e.currentTarget.style.transform = 'translateY(0)';
								}}
							>
								Aplică
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};

const CalloutDialogModal = ({
	palette = RTE_COLOR_PALETTE,
	types = RTE_CALLOUT_TYPES,
	selectedType,
	selectedColor,
	onTypeChange,
	onColorChange,
	onApply,
	onClose,
}) => (
	<div
		className="rte-modal-overlay"
		onClick={onClose}
		role="dialog"
		aria-modal="true"
		aria-labelledby="rte-callout-title"
	>
		<div className="rte-modal" onClick={(e) => e.stopPropagation()}>
			<div className="rte-modal-header">
				<h3 id="rte-callout-title" className="rte-modal-title">Chenар stilizat</h3>
				<button type="button" onClick={onClose} className="rte-modal-close" aria-label="Inchide">
					X
				</button>
			</div>
			<div className="rte-modal-body">
				<div className="rte-callout-modal-section">
					<label className="rte-color-palette-label">Stil chenar</label>
					<div className="rte-callout-type-grid">
						{types.map((type) => (
							<button
								key={type.id}
								type="button"
								className={`rte-callout-type-btn ${selectedType === type.id ? 'is-selected' : ''}`}
								data-type={type.id}
								onClick={() => onTypeChange(type.id)}
							>
								<span className="rte-callout-type-btn-name">{type.label}</span>
							</button>
						))}
					</div>
				</div>
				<div className="rte-callout-modal-section">
					<label className="rte-color-palette-label">Culoare accent</label>
					<div className="rte-color-palette-grid">
						{palette.map((hex, i) => (
							<div
								key={`${hex}-${i}`}
								role="button"
								tabIndex={0}
								className={`rte-color-swatch ${selectedColor === hex ? 'is-selected' : ''}`}
								style={{ background: hex }}
								onClick={() => onColorChange(hex)}
								onKeyDown={(e) => {
									if (e.key === 'Enter' || e.key === ' ') {
										e.preventDefault();
										onColorChange(hex);
									}
								}}
								title={hex}
								aria-label={`Culoare ${hex}`}
							/>
						))}
					</div>
				</div>
				<div className="rte-callout-preview">
					<blockquote
						className="rte-callout-preview-box"
						data-callout-box="true"
						data-callout-type={selectedType}
						style={{
							'--rte-callout-accent': selectedColor,
						}}
					>
						<div className="rte-callout-content">
							<p>Preview pentru chenарul selectat.</p>
						</div>
					</blockquote>
				</div>
				<div className="rte-callout-actions">
					<button type="button" className="rte-callout-action-secondary" onClick={onClose}>Anuleaza</button>
					<button type="button" className="rte-callout-action-primary" onClick={onApply}>Aplica</button>
				</div>
			</div>
		</div>
	</div>
);

const CalloutInlinePanel = ({
	palette = RTE_COLOR_PALETTE,
	types = RTE_CALLOUT_TYPES,
	selectedType,
	selectedColor,
	position,
	onTypeChange,
	onColorChange,
	onClose,
}) => (
	<div
		className="rte-callout-inline-panel"
		style={{ top: position.y, left: position.x }}
		onClick={(e) => e.stopPropagation()}
		role="dialog"
		aria-modal="false"
		aria-label="Selector chenar"
	>
		<div className="rte-callout-inline-header">
			<div>
				<div className="rte-callout-inline-title">Chenar</div>
				<div className="rte-callout-inline-subtitle">Click direct pe stil si culoare</div>
			</div>
			<button type="button" onClick={onClose} className="rte-callout-inline-close" aria-label="Inchide">
				X
			</button>
		</div>
		<div className="rte-callout-inline-section">
			<div className="rte-callout-inline-label">Forma</div>
			<div className="rte-callout-type-grid rte-callout-type-grid-inline">
				{types.map((type) => (
					<button
						key={type.id}
						type="button"
						className={`rte-callout-type-btn ${selectedType === type.id ? 'is-selected' : ''}`}
						data-type={type.id}
						onClick={() => onTypeChange(type.id)}
					>
						<span className="rte-callout-type-btn-name">{type.label}</span>
					</button>
				))}
			</div>
		</div>
		<div className="rte-callout-inline-section">
			<div className="rte-callout-inline-label">Culoare</div>
			<div className="rte-color-palette-grid">
				{palette.map((hex, i) => (
					<div
						key={`${hex}-${i}`}
						role="button"
						tabIndex={0}
						className={`rte-color-swatch ${selectedColor === hex ? 'is-selected' : ''}`}
						style={{ background: hex }}
						onClick={() => onColorChange(hex)}
						onKeyDown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								onColorChange(hex);
							}
						}}
						title={hex}
						aria-label={`Culoare ${hex}`}
					/>
				))}
			</div>
		</div>
		<div className="rte-callout-preview rte-callout-preview-inline">
			<blockquote
				className="rte-callout-preview-box"
				data-callout-box="true"
				data-callout-type={selectedType}
				style={{ '--rte-callout-accent': selectedColor }}
			>
				<div className="rte-callout-content">
					<p>Preview live pentru chenarul selectat.</p>
				</div>
			</blockquote>
		</div>
	</div>
);

// Link Dialog Modal Component
const LinkDialogModal = ({ linkUrl, setLinkUrl, onInsert, onClose }) => {
	return (
		<div
			className="rte-modal-overlay"
			onClick={onClose}
		>
			<div
				className="rte-modal"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="rte-modal-header">
					<h3 style={{
						margin: 0,
						background: 'linear-gradient(135deg, #ffffff, var(--formely-white))',
						WebkitBackgroundClip: 'text',
						WebkitTextFillColor: 'transparent',
						backgroundClip: 'text',
						fontSize: '1.25rem',
						fontWeight: 700,
					}}>
						🔗 Inserare Link
					</h3>
					<button
						type="button"
						onClick={onClose}
						className="rte-modal-close"
					>
						×
					</button>
				</div>

				<div className="rte-modal-body">
					<div>
						<label style={{
							display: 'block',
							marginBottom: '0.75rem',
							color: 'rgba(255,255,255,0.7)',
							fontSize: '0.9rem',
							fontWeight: 600,
						}}>
							URL
						</label>
						<input
							type="text"
							value={linkUrl}
							onChange={(e) => setLinkUrl(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === 'Enter') {
									onInsert();
								}
							}}
							placeholder="https://… sau domeniu.extensie"
							autoFocus
							style={{
								width: '100%',
								padding: '1rem',
								background: 'rgba(255,255,255,0.05)',
								border: '1px solid rgba(var(--formely-white-rgb), 0.2)',
								borderRadius: '12px',
								color: '#fff',
								fontSize: '1rem',
								transition: 'all 0.3s ease',
							}}
							onFocus={(e) => {
								e.target.style.borderColor = 'rgba(var(--formely-white-rgb), 0.4)';
								e.target.style.background = 'rgba(255,255,255,0.08)';
							}}
							onBlur={(e) => {
								e.target.style.borderColor = 'rgba(var(--formely-white-rgb), 0.2)';
								e.target.style.background = 'rgba(255,255,255,0.05)';
							}}
						/>
						<div style={{
							marginTop: '0.5rem',
							color: 'rgba(255,255,255,0.6)',
							fontSize: '0.85rem',
						}}>
							💡 Poți introduce un URL complet (https://…) sau doar domeniul.
						</div>
					</div>

					<div style={{
						display: 'flex',
						gap: '1rem',
						justifyContent: 'flex-end',
						marginTop: '1.5rem',
					}}>
						<button
							type="button"
							onClick={onClose}
							style={{
								padding: '0.75rem 1.5rem',
								background: 'rgba(255,255,255,0.05)',
								border: '1px solid rgba(255,255,255,0.15)',
								borderRadius: '10px',
								color: '#fff',
								fontWeight: 600,
								cursor: 'pointer',
								transition: 'all 0.3s ease',
							}}
							onMouseEnter={(e) => {
								e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
								e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)';
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
								e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
							}}
						>
							Anulează
						</button>
						<button
							type="button"
							onClick={onInsert}
							disabled={!linkUrl.trim()}
							style={{
								padding: '0.75rem 1.5rem',
								background: linkUrl.trim()
									? 'linear-gradient(135deg, rgba(var(--formely-white-rgb), 0.2), rgba(var(--formely-white-rgb), 0.15))'
									: 'rgba(255,255,255,0.05)',
								border: linkUrl.trim()
									? '1px solid rgba(var(--formely-white-rgb), 0.4)'
									: '1px solid rgba(255,255,255,0.1)',
								borderRadius: '10px',
								color: linkUrl.trim() ? 'var(--formely-white)' : 'rgba(255,255,255,0.5)',
								fontWeight: 700,
								cursor: linkUrl.trim() ? 'pointer' : 'not-allowed',
								transition: 'all 0.3s ease',
							}}
							onMouseEnter={(e) => {
								if (linkUrl.trim()) {
									e.currentTarget.style.background = 'linear-gradient(135deg, rgba(var(--formely-white-rgb), 0.3), rgba(var(--formely-white-rgb), 0.2))';
									e.currentTarget.style.borderColor = 'rgba(var(--formely-white-rgb), 0.5)';
									e.currentTarget.style.transform = 'translateY(-2px)';
								}
							}}
							onMouseLeave={(e) => {
								if (linkUrl.trim()) {
									e.currentTarget.style.background = 'linear-gradient(135deg, rgba(var(--formely-white-rgb), 0.2), rgba(var(--formely-white-rgb), 0.15))';
									e.currentTarget.style.borderColor = 'rgba(var(--formely-white-rgb), 0.4)';
									e.currentTarget.style.transform = 'translateY(0)';
								}
							}}
						>
							Inserare
						</button>
					</div>
				</div>
			</div>
		</div>
	);
};

// PDF Upload Modal Component
const PdfUploadModal = ({
	pdfFile,
	pdfFileName,
	pdfTotalPages,
	pdfStartPage,
	pdfEndPage,
	onStartPageChange,
	onEndPageChange,
	uploadingPdf,
	onFileSelect,
	onUpload,
	onClose,
}) => {
	const totalPages = Math.max(0, Number(pdfTotalPages || 0));
	const safeStart = Math.max(1, Math.min(Number(pdfStartPage || 1), totalPages || 1));
	const safeEnd = Math.max(safeStart, Math.min(Number(pdfEndPage || safeStart), totalPages || safeStart));
	const isPartialRange = totalPages > 0 && (safeStart > 1 || safeEnd < totalPages);

	return (
		<div
			className="rte-modal-overlay"
			onClick={onClose}
		>
			<div
				className="rte-modal"
				onClick={(e) => e.stopPropagation()}
				style={{ maxWidth: '600px' }}
			>
				<div className="rte-modal-header">
					<h3 style={{
						margin: 0,
						background: 'linear-gradient(135deg, #ffffff, var(--formely-white))',
						WebkitBackgroundClip: 'text',
						WebkitTextFillColor: 'transparent',
						backgroundClip: 'text',
						fontSize: '1.25rem',
						fontWeight: 700,
					}}>
						📄 Încarcă PDF original
					</h3>
					<button
						type="button"
						onClick={onClose}
						className="rte-modal-close"
					>
						×
					</button>
				</div>

				<div className="rte-modal-body">
					{/* File Selection Area */}
					{!pdfFile ? (
						<div
							onClick={onFileSelect}
							style={{
								border: '2px dashed rgba(var(--formely-white-rgb), 0.3)',
								borderRadius: '16px',
								padding: '3rem 2rem',
								textAlign: 'center',
								cursor: 'pointer',
								transition: 'all 0.3s ease',
								background: 'rgba(var(--formely-white-rgb), 0.05)',
							}}
							onMouseEnter={(e) => {
								e.currentTarget.style.borderColor = 'rgba(var(--formely-white-rgb), 0.5)';
								e.currentTarget.style.background = 'rgba(var(--formely-white-rgb), 0.1)';
								e.currentTarget.style.transform = 'translateY(-2px)';
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.borderColor = 'rgba(var(--formely-white-rgb), 0.3)';
								e.currentTarget.style.background = 'rgba(var(--formely-white-rgb), 0.05)';
								e.currentTarget.style.transform = 'translateY(0)';
							}}
						>
							<div style={{ fontSize: '4rem', marginBottom: '1rem' }}>📄</div>
							<div style={{
								color: 'var(--formely-white)',
								fontSize: '1.1rem',
								fontWeight: 700,
								marginBottom: '0.5rem',
							}}>
								Click pentru a selecta PDF
							</div>
							<div style={{
								color: 'rgba(255,255,255,0.6)',
								fontSize: '0.9rem',
							}}>
								Maxim 10MB · PDF-ul va fi inserat ca document vizibil în lecție
							</div>
						</div>
					) : (
						<div style={{
							padding: '1.5rem',
							background: 'rgba(var(--formely-white-rgb), 0.1)',
							border: '1px solid rgba(var(--formely-white-rgb), 0.3)',
							borderRadius: '16px',
							marginBottom: '1.5rem',
						}}>
							<div style={{
								display: 'flex',
								alignItems: 'center',
								gap: '1rem',
								marginBottom: '1rem',
							}}>
								<div style={{ fontSize: '2.5rem' }}>📄</div>
								<div style={{ flex: 1 }}>
									<div style={{
										color: 'var(--formely-white)',
										fontWeight: 700,
										marginBottom: '0.25rem',
									}}>
										{pdfFileName}
									</div>
									<div style={{
										color: 'rgba(255,255,255,0.6)',
										fontSize: '0.85rem',
									}}>
										{(pdfFile.size / 1024 / 1024).toFixed(2)} MB
									</div>
								</div>
								<button
									type="button"
									onClick={onFileSelect}
									style={{
										padding: '0.5rem 1rem',
										background: 'rgba(255,255,255,0.05)',
										border: '1px solid rgba(255,255,255,0.15)',
										borderRadius: '8px',
										color: '#fff',
										cursor: 'pointer',
										fontSize: '0.85rem',
										transition: 'all 0.3s ease',
									}}
									onMouseEnter={(e) => {
										e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
										e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)';
									}}
									onMouseLeave={(e) => {
										e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
										e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
									}}
								>
									Schimbă
								</button>
							</div>

							<div style={{
								padding: '0.85rem',
								background: 'rgba(255,255,255,0.04)',
								border: '1px solid rgba(255,255,255,0.1)',
								borderRadius: '10px',
							}}>
								<div style={{
									color: 'rgba(255,255,255,0.82)',
									fontSize: '0.85rem',
									marginBottom: '0.65rem',
								}}>
									Taie PDF după pagini ({totalPages || 0} pagini detectate)
								</div>
								<div style={{
									display: 'flex',
									gap: '0.75rem',
									alignItems: 'center',
									flexWrap: 'wrap',
								}}>
									<label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem' }}>
										De la
										<input
											type="number"
											min={1}
											max={Math.max(1, totalPages || 1)}
											value={safeStart}
											onChange={(e) => onStartPageChange(Number(e.target.value || 1))}
											style={{ marginLeft: '0.45rem', width: '76px' }}
										/>
									</label>
									<label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem' }}>
										Până la
										<input
											type="number"
											min={safeStart}
											max={Math.max(safeStart, totalPages || safeStart)}
											value={safeEnd}
											onChange={(e) => onEndPageChange(Number(e.target.value || safeStart))}
											style={{ marginLeft: '0.45rem', width: '76px' }}
										/>
									</label>
									<div style={{
										color: isPartialRange ? 'var(--formely-white)' : 'rgba(255,255,255,0.55)',
										fontSize: '0.8rem',
										fontWeight: 600,
									}}>
										{isPartialRange ? `Se va insera doar intervalul ${safeStart}-${safeEnd}.` : 'Se va insera PDF-ul complet.'}
									</div>
								</div>
							</div>
						</div>
					)}

					<div style={{
						display: 'flex',
						gap: '1rem',
						justifyContent: 'flex-end',
					}}>
						<button
							type="button"
							onClick={onClose}
							style={{
								padding: '0.75rem 1.5rem',
								background: 'rgba(255,255,255,0.05)',
								border: '1px solid rgba(255,255,255,0.15)',
								borderRadius: '10px',
								color: '#fff',
								fontWeight: 600,
								cursor: 'pointer',
								transition: 'all 0.3s ease',
							}}
							onMouseEnter={(e) => {
								e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
								e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)';
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
								e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
							}}
						>
							Anulează
						</button>
						<button
							type="button"
							onClick={onUpload}
							disabled={!pdfFile || uploadingPdf}
							style={{
								padding: '0.75rem 1.5rem',
								background: pdfFile && !uploadingPdf
									? 'linear-gradient(135deg, rgba(var(--formely-white-rgb), 0.2), rgba(var(--formely-white-rgb), 0.15))'
									: 'rgba(255,255,255,0.05)',
								border: pdfFile && !uploadingPdf
									? '1px solid rgba(var(--formely-white-rgb), 0.4)'
									: '1px solid rgba(255,255,255,0.1)',
								borderRadius: '10px',
								color: pdfFile && !uploadingPdf ? 'var(--formely-white)' : 'rgba(255,255,255,0.5)',
								fontWeight: 700,
								cursor: pdfFile && !uploadingPdf ? 'pointer' : 'not-allowed',
								transition: 'all 0.3s ease',
								display: 'inline-flex',
								alignItems: 'center',
								gap: '0.5rem',
							}}
							onMouseEnter={(e) => {
								if (pdfFile && !uploadingPdf) {
									e.currentTarget.style.background = 'linear-gradient(135deg, rgba(var(--formely-white-rgb), 0.3), rgba(var(--formely-white-rgb), 0.2))';
									e.currentTarget.style.borderColor = 'rgba(var(--formely-white-rgb), 0.5)';
									e.currentTarget.style.transform = 'translateY(-2px)';
								}
							}}
							onMouseLeave={(e) => {
								if (pdfFile && !uploadingPdf) {
									e.currentTarget.style.background = 'linear-gradient(135deg, rgba(var(--formely-white-rgb), 0.2), rgba(var(--formely-white-rgb), 0.15))';
									e.currentTarget.style.borderColor = 'rgba(var(--formely-white-rgb), 0.4)';
									e.currentTarget.style.transform = 'translateY(0)';
								}
							}}
						>
							{uploadingPdf ? (
								<>
									<span>⏳</span>
									<span>Se încarcă...</span>
								</>
							) : (
								<>
									<span>✅</span>
									<span>Inserează PDF original</span>
								</>
							)}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
};

export default RichTextEditor;
