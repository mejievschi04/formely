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
import { stripRichTextEditorChrome } from '../utils/richTextContent';
import { adminService } from '../services/api';
import './RichTextEditor.css';

/** Paletă culori pentru text/fundal - o singură sursă pentru afișare corectă */
const RTE_COLOR_PALETTE = [
	'#0891b2', '#22d3ee', '#0e7490', '#155e75',
	'#ffffff', '#e2e8f0', '#94a3b8', '#475569', '#0f172a',
	'#ef4444', '#f87171', '#dc2626', '#b91c1c',
	'#4ade80', '#22c55e', '#10b981', '#059669',
	'#38bdf8', '#7dd3fc', '#0284c7', '#0369a1',
	'#67e8f9', '#a5f3fc', '#cbd5e1', '#334155',
	'#64748b', '#1e293b', '#e0f2fe', '#ecfeff',
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

const IMAGE_SIZE_PRESETS = [
	{ id: 'small', label: 'Mic', percent: 33 },
	{ id: 'medium', label: 'Mediu', percent: 50 },
	{ id: 'large', label: 'Mare', percent: 75 },
	{ id: 'full', label: 'Complet', percent: 100 },
];

const IMAGE_ALIGN_OPTIONS = [
	{ id: 'left', label: 'Stânga' },
	{ id: 'center', label: 'Centru' },
	{ id: 'right', label: 'Dreapta' },
];

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

function readImageAlign(img) {
	const align = img?.getAttribute('data-rte-image-align');
	if (align === 'left' || align === 'right' || align === 'center') return align;
	return 'center';
}

function snapImageWidthPercent(percent) {
	const safe = Math.max(RTE_IMAGE_MIN_WIDTH, Math.min(RTE_IMAGE_MAX_WIDTH, Math.round(Number(percent) || 100)));
	return IMAGE_SIZE_PRESETS.reduce((best, preset) => (
		Math.abs(preset.percent - safe) < Math.abs(best.percent - safe) ? preset : best
	)).percent;
}

function applyImageLayout(img, widthPercent, align = 'center') {
	if (!img) return;
	const safeWidth = Math.max(RTE_IMAGE_MIN_WIDTH, Math.min(RTE_IMAGE_MAX_WIDTH, Math.round(Number(widthPercent) || 100)));
	const safeAlign = align === 'left' || align === 'right' ? align : 'center';
	img.style.width = `${safeWidth}%`;
	img.style.maxWidth = '100%';
	img.style.height = 'auto';
	img.style.display = 'block';
	img.style.borderRadius = '8px';
	img.style.margin = safeAlign === 'left'
		? '1rem 0'
		: safeAlign === 'right'
			? '1rem 0 1rem auto'
			: '1rem auto';
	img.setAttribute('data-rte-resizable-image', '1');
	img.setAttribute('data-rte-image-align', safeAlign);
	img.setAttribute('title', 'Click: selectează · Trage: mută · Dublu-click: setări');
}

function getCaretRangeFromPoint(clientX, clientY) {
	if (typeof document.caretRangeFromPoint === 'function') {
		return document.caretRangeFromPoint(clientX, clientY);
	}
	if (typeof document.caretPositionFromPoint === 'function') {
		const pos = document.caretPositionFromPoint(clientX, clientY);
		if (!pos) return null;
		const range = document.createRange();
		range.setStart(pos.offsetNode, pos.offset);
		range.collapse(true);
		return range;
	}
	return null;
}

function getImageMoveNode(img) {
	return img.closest('[data-rte-image-wrap="1"]') || img;
}

function placeImageAtPoint(img, clientX, clientY, editor) {
	if (!img || !editor) return false;

	const range = getCaretRangeFromPoint(clientX, clientY);
	if (!range) return false;

	const container = range.commonAncestorContainer;
	if (!(editor.contains(container) || container === editor)) return false;

	const nodeToMove = getImageMoveNode(img);
	if (nodeToMove.contains(container) || container === nodeToMove) return false;

	range.collapse(true);
	const parent = nodeToMove.parentNode;
	if (!parent) return false;

	parent.removeChild(nodeToMove);
	range.insertNode(nodeToMove);

	const selection = window.getSelection();
	if (selection) {
		const after = document.createRange();
		after.setStartAfter(nodeToMove);
		after.collapse(true);
		selection.removeAllRanges();
		selection.addRange(after);
	}

	return true;
}

function cleanPastedCssValue(value) {
	return String(value || '')
		.replace(/!important/gi, '')
		.trim();
}

function isUsefulPastedColor(value) {
	const color = cleanPastedCssValue(value);
	return Boolean(color)
		&& !/^(inherit|initial|revert|unset|currentcolor|transparent|windowtext|auto)$/i.test(color);
}

function getDeclarationColor(declarations, propertyName) {
	if (!declarations || typeof document === 'undefined') return '';
	const probe = document.createElement('span');
	probe.style.cssText = declarations;
	const parsed = cleanPastedCssValue(probe.style.getPropertyValue(propertyName));
	if (isUsefulPastedColor(parsed)) return parsed;

	const escapedProperty = propertyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const rawMatch = declarations.match(new RegExp(`(?:^|;)\\s*${escapedProperty}\\s*:\\s*([^;]+)`, 'i'));
	const raw = cleanPastedCssValue(rawMatch?.[1]);
	return isUsefulPastedColor(raw) ? raw : '';
}

function extractPastedStyleSheets(doc) {
	return Array.from(doc.querySelectorAll('style'))
		.map((styleTag) => styleTag.textContent || '')
		.join('\n')
		.replace(/<!--|-->/g, '')
		.replace(/\/\*[\s\S]*?\*\//g, '');
}

function applyPastedCssColorRules(doc) {
	const css = extractPastedStyleSheets(doc);
	const rulePattern = /([^{}]+)\{([^{}]+)\}/g;
	let match;

	while ((match = rulePattern.exec(css)) !== null) {
		const selectors = String(match[1] || '').split(',');
		const declarations = String(match[2] || '');
		const color = getDeclarationColor(declarations, 'color')
			|| getDeclarationColor(declarations, '-webkit-text-fill-color');
		const backgroundColor = getDeclarationColor(declarations, 'background-color')
			|| getDeclarationColor(declarations, 'background');
		if (!color && !backgroundColor) continue;

		selectors.forEach((selector) => {
			const trimmedSelector = selector.trim();
			if (!trimmedSelector || trimmedSelector.startsWith('@') || /:(?!not\()/.test(trimmedSelector)) return;
			try {
				doc.body.querySelectorAll(trimmedSelector).forEach((node) => {
					if (color && !isUsefulPastedColor(node.style.getPropertyValue('color'))) {
						node.style.setProperty('color', color);
					}
					if (backgroundColor && !isUsefulPastedColor(node.style.getPropertyValue('background-color'))) {
						node.style.setProperty('background-color', backgroundColor);
					}
				});
			} catch {
				// Clipboard CSS often contains browser/editor-only selectors. Invalid selectors can be ignored safely.
			}
		});
	}
}

function collectPastedClassColorRules(doc) {
	const rulesByClass = new Map();
	const css = Array.from(doc.querySelectorAll('style'))
		.map((styleTag) => styleTag.textContent || '')
		.join('\n')
		.replace(/<!--|-->/g, '')
		.replace(/\/\*[\s\S]*?\*\//g, '');

	const rulePattern = /([^{}]+)\{([^{}]+)\}/g;
	let match;
	while ((match = rulePattern.exec(css)) !== null) {
		const selectors = String(match[1] || '').split(',');
		const declarations = String(match[2] || '');
		const color = getDeclarationColor(declarations, 'color');
		const backgroundColor = getDeclarationColor(declarations, 'background-color')
			|| getDeclarationColor(declarations, 'background');
		if (!color && !backgroundColor) continue;

		selectors.forEach((selector) => {
			const trimmedSelector = selector.trim();
			if (!/^(?:[a-z][\w-]*)?(?:\.[_a-zA-Z][\w-]*)+$/i.test(trimmedSelector)) return;
			const classMatches = trimmedSelector.match(/\.[_a-zA-Z][\w-]*/g) || [];
			classMatches.forEach((classMatch) => {
				const className = classMatch.slice(1);
				const current = rulesByClass.get(className) || {};
				rulesByClass.set(className, {
					color: current.color || color || '',
					backgroundColor: current.backgroundColor || backgroundColor || '',
				});
			});
		});
	}

	return rulesByClass;
}

function normalizePastedHtmlForRichText(html) {
	if (!html || typeof DOMParser === 'undefined') return html;
	const doc = new DOMParser().parseFromString(html, 'text/html');
	applyPastedCssColorRules(doc);
	const rulesByClass = collectPastedClassColorRules(doc);

	Array.from(doc.body.querySelectorAll('*')).forEach((node) => {
		const inlineColor = cleanPastedCssValue(node.style.getPropertyValue('color'))
			|| cleanPastedCssValue(node.style.getPropertyValue('-webkit-text-fill-color'));
		const inlineBackgroundColor = cleanPastedCssValue(node.style.getPropertyValue('background-color'));
		const fontColor = node.tagName === 'FONT' ? cleanPastedCssValue(node.getAttribute('color')) : '';

		let classColor = '';
		let classBackgroundColor = '';
		Array.from(node.classList || []).some((className) => {
			const rule = rulesByClass.get(className);
			if (!rule) return false;
			if (!classColor && rule.color) classColor = rule.color;
			if (!classBackgroundColor && rule.backgroundColor) classBackgroundColor = rule.backgroundColor;
			return classColor && classBackgroundColor;
		});

		const nextColor = isUsefulPastedColor(inlineColor)
			? inlineColor
			: (isUsefulPastedColor(fontColor) ? fontColor : classColor);
		const nextBackgroundColor = isUsefulPastedColor(inlineBackgroundColor)
			? inlineBackgroundColor
			: classBackgroundColor;

		if (isUsefulPastedColor(nextColor)) {
			node.style.setProperty('color', nextColor);
		}
		if (isUsefulPastedColor(nextBackgroundColor)) {
			node.style.setProperty('background-color', nextBackgroundColor);
		}
	});

	doc.querySelectorAll('style').forEach((styleTag) => styleTag.remove());
	return doc.body.innerHTML || html;
}

/** 'crop' = marginea de sus (decupare); 'height' = înălțime vizibilă (margine jos / laterale) */
function getClipboardImageFile(clipboardData) {
	if (!clipboardData) return null;

	const items = Array.from(clipboardData.items || []);
	const imageItem = items.find((item) => item.kind === 'file' && item.type.startsWith('image/'));
	if (imageItem) {
		return imageItem.getAsFile();
	}

	const files = Array.from(clipboardData.files || []);
	return files.find((file) => file.type.startsWith('image/')) || null;
}

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

const BASIC_FONT_OPTIONS = [
	{ label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
	{ label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
	{ label: 'Trebuchet MS', value: '"Trebuchet MS", Helvetica, sans-serif' },
	{ label: 'Georgia', value: 'Georgia, "Times New Roman", serif' },
	{ label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
	{ label: 'Courier New', value: '"Courier New", Courier, monospace' },
	{ label: 'Comic Sans MS', value: '"Comic Sans MS", "Comic Sans", cursive' },
];

const BASIC_FONT_DEFAULT = BASIC_FONT_OPTIONS[0].value;

function matchBasicFontOption(fontFamily) {
	const families = String(fontFamily || '')
		.toLowerCase()
		.split(',')
		.map((part) => part.trim().replace(/["']/g, ''));

	for (const option of BASIC_FONT_OPTIONS) {
		const primary = option.value.split(',')[0].trim().replace(/["']/g, '').toLowerCase();
		if (families.some((name) => name === primary || name.includes(primary) || primary.includes(name))) {
			return option.value;
		}
	}

	if (families.some((name) => name.includes('courier') || name.includes('monospace'))) {
		return BASIC_FONT_OPTIONS.find((option) => option.label === 'Courier New')?.value || BASIC_FONT_DEFAULT;
	}
	if (families.some((name) => name.includes('georgia') || name.includes('times') || name.includes('serif'))) {
		return BASIC_FONT_OPTIONS.find((option) => option.label === 'Georgia')?.value || BASIC_FONT_DEFAULT;
	}
	if (families.some((name) => name.includes('comic'))) {
		return BASIC_FONT_OPTIONS.find((option) => option.label === 'Comic Sans MS')?.value || BASIC_FONT_DEFAULT;
	}
	if (families.some((name) => name.includes('trebuchet'))) {
		return BASIC_FONT_OPTIONS.find((option) => option.label === 'Trebuchet MS')?.value || BASIC_FONT_DEFAULT;
	}
	if (families.some((name) => name.includes('verdana'))) {
		return BASIC_FONT_OPTIONS.find((option) => option.label === 'Verdana')?.value || BASIC_FONT_DEFAULT;
	}

	return BASIC_FONT_DEFAULT;
}

function getBasicFontAtSelection(editor) {
	if (!editor) return BASIC_FONT_DEFAULT;

	const selection = window.getSelection();
	if (!selection || selection.rangeCount === 0) {
		return matchBasicFontOption(window.getComputedStyle(editor).fontFamily);
	}

	let node = selection.anchorNode;
	if (!node || !editor.contains(node)) {
		return matchBasicFontOption(window.getComputedStyle(editor).fontFamily);
	}

	let element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
	while (element && element !== editor) {
		if (element.style?.fontFamily) {
			return matchBasicFontOption(element.style.fontFamily);
		}
		element = element.parentElement;
	}

	const base = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
	return matchBasicFontOption(window.getComputedStyle(base || editor).fontFamily);
}

const RichTextEditor = ({ value, onChange, onBlur, placeholder, style, toolbarVariant = 'full', courseId = null, showSideTools = true }) => {
	const { warning: showWarning, error: showError } = useToast();
	const editorRef = useRef(null);
	const savedSelectionRef = useRef(null);
	const skipNextValueSyncRef = useRef(false);
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
	const [selectedColor, setSelectedColor] = useState('#0891b2');
	const [selectedCalloutColor, setSelectedCalloutColor] = useState('#0891b2');
	const [selectedCalloutType, setSelectedCalloutType] = useState('soft');
	const [pdfFile, setPdfFile] = useState(null);
	const [pdfFileName, setPdfFileName] = useState('');
	const [pdfTotalPages, setPdfTotalPages] = useState(0);
	const [pdfStartPage, setPdfStartPage] = useState(1);
	const [pdfEndPage, setPdfEndPage] = useState(1);
	const [uploadingPdf, setUploadingPdf] = useState(false);
	const [sideToolsExpanded, setSideToolsExpanded] = useState(false);
	const [basicFontValue, setBasicFontValue] = useState(BASIC_FONT_DEFAULT);
	const fileInputRef = useRef(null);
	const imageInputRef = useRef(null);
	const [pdfEditHost, setPdfEditHost] = useState(null);
	const imageEditTargetRef = useRef(null);
	const imageDragRef = useRef({ img: null, moved: false });
	const selectedImageRef = useRef(null);
	const [showImageEditModal, setShowImageEditModal] = useState(false);
	const [imageEditDraft, setImageEditDraft] = useState({
		widthPercent: 100,
		align: 'center',
		previewSrc: '',
	});

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
			const cleaned = stripRichTextEditorChrome(value);
			editorRef.current.innerHTML = cleaned;
			setInternalValue(cleaned);
		}
	}, []);

	// Sincronizare din props când părintele schimbă valoarea (ex. altă lecție). Builder-ul nu mai rescrie `value` la fiecare fetch de structură.
	useEffect(() => {
		if (!editorRef.current) return;
		if (value === undefined) return;
		if (showImageEditModal) return;
		if (skipNextValueSyncRef.current) {
			skipNextValueSyncRef.current = false;
			return;
		}
		const cleaned = stripRichTextEditorChrome(value || '');
		if (editorRef.current.innerHTML !== cleaned) {
			editorRef.current.innerHTML = cleaned;
			setInternalValue(cleaned);
		}
	}, [value, showImageEditModal]);

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
		const rawValue = ed.innerHTML;
		const newValue = stripRichTextEditorChrome(rawValue);
		if (newValue !== rawValue) {
			ed.innerHTML = newValue;
		}
		setInternalValue(newValue);
		if (onChange) onChange(newValue);
	};

	const openPdfLayoutEditor = (figure) => {
		if (!figure || !editorRef.current?.contains(figure)) return;
		setPdfEditHost(figure);
	};

	const clearSelectedImage = useCallback(() => {
		const prev = selectedImageRef.current;
		if (prev?.isConnected) {
			prev.classList.remove('rte-image--selected');
		}
		selectedImageRef.current = null;
	}, []);

	const selectImage = useCallback((img) => {
		if (!img) return;
		const prev = selectedImageRef.current;
		if (prev && prev !== img && prev.isConnected) {
			prev.classList.remove('rte-image--selected');
		}
		selectedImageRef.current = img;
		img.classList.add('rte-image--selected');
	}, []);

	const openImageEditModal = useCallback((img) => {
		if (!img || !editorRef.current?.contains(img)) return;
		imageEditTargetRef.current = img;
		setImageEditDraft({
			widthPercent: snapImageWidthPercent(readImageWidthPercent(img)),
			align: readImageAlign(img),
			previewSrc: img.getAttribute('src') || '',
		});
		setShowImageEditModal(true);
	}, []);

	const applyImageEdit = () => {
		const img = imageEditTargetRef.current;
		if (img?.isConnected) {
			applyImageLayout(img, imageEditDraft.widthPercent, imageEditDraft.align);
			syncEditorFromDom();
			skipNextValueSyncRef.current = true;
			selectImage(img);
		}
		imageEditTargetRef.current = null;
		setShowImageEditModal(false);
	};

	const cancelImageEdit = () => {
		imageEditTargetRef.current = null;
		setShowImageEditModal(false);
		clearSelectedImage();
	};

	const deleteEditingImage = () => {
		const img = imageEditTargetRef.current;
		if (img?.isConnected) {
			const wrap = img.closest('[data-rte-image-wrap="1"]');
			(wrap || img).remove();
			syncEditorFromDom();
			skipNextValueSyncRef.current = true;
		}
		imageEditTargetRef.current = null;
		clearSelectedImage();
		setShowImageEditModal(false);
	};

	const handleEditorMouseDown = (e) => {
		const editor = editorRef.current;
		if (!editor || showImageEditModal || pdfEditHost || e.button !== 0) return;

		const img = findEditableImage(e.target, editor);
		if (!img) {
			clearSelectedImage();
			return;
		}

		selectImage(img);
		e.preventDefault();

		const dragState = {
			img,
			startX: e.clientX,
			startY: e.clientY,
			moved: false,
		};
		imageDragRef.current = dragState;

		const onMove = (ev) => {
			if (!imageDragRef.current.img) return;
			const dx = Math.abs(ev.clientX - dragState.startX);
			const dy = Math.abs(ev.clientY - dragState.startY);
			if (dx > 5 || dy > 5) {
				dragState.moved = true;
				imageDragRef.current.moved = true;
				dragState.img.classList.add('rte-image--dragging');
			}
		};

		const onUp = (ev) => {
			const activeImg = imageDragRef.current.img;
			const didMove = imageDragRef.current.moved;
			imageDragRef.current = { img: null, moved: false };

			if (activeImg) {
				activeImg.classList.remove('rte-image--dragging');
				if (didMove && editor.contains(activeImg) && placeImageAtPoint(activeImg, ev.clientX, ev.clientY, editor)) {
					syncEditorFromDom();
				}
			}

			window.removeEventListener('pointermove', onMove);
			window.removeEventListener('pointerup', onUp);
			window.removeEventListener('pointercancel', onUp);
		};

		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
		window.addEventListener('pointercancel', onUp);
	};

	const handleEditorDoubleClick = (e) => {
		const editor = editorRef.current;
		if (!editor) return;
		const img = findEditableImage(e.target, editor);
		if (img) {
			e.preventDefault();
			e.stopPropagation();
			imageDragRef.current = { img: null, moved: false };
			img.classList.remove('rte-image--dragging');
			selectImage(img);
			openImageEditModal(img);
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

	useEffect(() => {
		if (!showImageEditModal) return undefined;
		const onKey = (e) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				cancelImageEdit();
			}
		};
		window.addEventListener('keydown', onKey, true);
		return () => {
			window.removeEventListener('keydown', onKey, true);
		};
	}, [showImageEditModal]);

	useEffect(() => {
		const onKey = (e) => {
			if (e.key === 'Escape' && selectedImageRef.current && !showImageEditModal) {
				clearSelectedImage();
			}
		};
		window.addEventListener('keydown', onKey, true);
		return () => window.removeEventListener('keydown', onKey, true);
	}, [showImageEditModal, clearSelectedImage]);

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
		if (pdfEditHost && !pdfEditHost.isConnected) {
			setPdfEditHost(null);
		}
	}, [value, pdfEditHost]);

	const insertClipboardContent = (contentToInsert, insertAsHtml) => {
		const editor = editorRef.current;
		if (!editor || !contentToInsert) return false;
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
		return true;
	};

	const insertImageFile = async (file) => {
		if (!file) return;
		if (!file.type.startsWith('image/')) {
			showWarning('Te rugăm să selectezi un fișier imagine.');
			return;
		}

		try {
			if (courseId) {
				const formData = new FormData();
				formData.append('file', file);
				formData.append('type', 'image');
				const result = await adminService.builderUploadContentFile(courseId, formData);
				restoreSelection();
				insertImageByUrl(result?.url || '');
			} else {
				const dataUrl = await new Promise((resolve, reject) => {
					const reader = new FileReader();
					reader.onload = () => resolve(reader.result);
					reader.onerror = reject;
					reader.readAsDataURL(file);
				});
				restoreSelection();
				insertImageByUrl(String(dataUrl || ''));
			}
		} catch (error) {
			logger.error('Error uploading image for editor:', error);
			showError(getApiFriendlyError(error, 'Eroare la încărcarea imaginii.'));
		}
	};

	const handlePaste = async (e) => {
		const clipboardData = e.clipboardData;
		if (!clipboardData) return;

		const imageFile = getClipboardImageFile(clipboardData);
		if (imageFile) {
			e.preventDefault();
			saveSelection();
			await insertImageFile(imageFile);
			return;
		}

		e.preventDefault();
		const html = clipboardData.getData('text/html');
		const text = clipboardData.getData('text/plain');
		const normalizedHtml = html ? normalizePastedHtmlForRichText(html) : '';
		const contentToInsert = normalizedHtml || text;
		if (!contentToInsert) return;

		insertClipboardContent(contentToInsert, Boolean(normalizedHtml));
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

	const refreshBasicFontFromSelection = () => {
		if (toolbarVariant !== 'basic') return;
		setBasicFontValue(getBasicFontAtSelection(editorRef.current));
	};

	const handleEditorSelectionChange = () => {
		saveSelection();
		refreshBasicFontFromSelection();
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

	const handleFontSelectPointerDown = () => {
		handleEditorSelectionChange();
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
		await insertImageFile(file);
		event.target.value = '';
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
		try {
			restoreSelection();
			editorRef.current?.focus();

			if (navigator.clipboard?.read) {
				const items = await navigator.clipboard.read();
				for (const item of items) {
					if (!item.types?.includes('text/html')) continue;
					const blob = await item.getType('text/html');
					const html = await blob.text();
					const normalizedHtml = normalizePastedHtmlForRichText(html);
					if (insertClipboardContent(normalizedHtml, true)) {
						return;
					}
				}

				for (const item of items) {
					if (!item.types?.includes('text/plain')) continue;
					const blob = await item.getType('text/plain');
					const text = await blob.text();
					if (insertClipboardContent(text, false)) {
						return;
					}
				}
			}
		} catch (error) {
			logger.error('Clipboard rich read failed:', error);
		}

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

	const dispatchEditorInput = () => {
		if (!editorRef.current) return;
		const event = new Event('input', { bubbles: true });
		editorRef.current.dispatchEvent(event);
	};

	const applyBasicFontFamily = (fontFamily) => {
		restoreSelection();
		const editor = editorRef.current;
		const selection = window.getSelection();
		if (!editor || !selection || selection.rangeCount === 0) {
			editor?.focus();
			return;
		}

		const range = selection.getRangeAt(0);
		if (!editor.contains(range.commonAncestorContainer)) {
			editor.focus();
			return;
		}

		const wrapRangeWithSpan = (targetRange, span) => {
			try {
				targetRange.surroundContents(span);
				return span;
			} catch {
				const fragment = targetRange.extractContents();
				span.appendChild(fragment);
				targetRange.insertNode(span);
				return span;
			}
		};

		if (!fontFamily) {
			editor.focus();
			return;
		}

		const span = document.createElement('span');
		span.style.fontFamily = fontFamily;
		span.setAttribute('data-rte-font', '1');

		if (range.collapsed) {
			range.insertNode(span);
			const caret = document.createRange();
			caret.setStart(span, 0);
			caret.collapse(true);
			selection.removeAllRanges();
			selection.addRange(caret);
			savedSelectionRef.current = caret.cloneRange();
		} else {
			const wrapped = wrapRangeWithSpan(range, span);
			const after = document.createRange();
			after.selectNodeContents(wrapped);
			after.collapse(false);
			selection.removeAllRanges();
			selection.addRange(after);
			savedSelectionRef.current = after.cloneRange();
		}

		editor.focus();
		dispatchEditorInput();
		setBasicFontValue(fontFamily);
	};

	const handleBasicFontChange = (fontFamily) => {
		if (!fontFamily) return;
		applyBasicFontFamily(fontFamily);
	};

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
		<div className={`rte-container ${toolbarVariant === 'basic' ? 'rte-container-basic' : ''}`} style={style}>
			{toolbarVariant === 'basic' && (
				<div className="rte-toolbar rte-toolbar-basic">
					<div className="rte-toolbar-group rte-toolbar-group-labeled">
						<span className="rte-toolbar-label">Font</span>
						<select
							className="rte-toolbar-select rte-toolbar-select-basic"
							value={basicFontValue}
							onMouseDown={handleFontSelectPointerDown}
							onPointerDown={handleFontSelectPointerDown}
							onChange={(e) => {
								handleBasicFontChange(e.target.value);
							}}
							title="Fontul textului selectat sau de la cursor"
						>
							{BASIC_FONT_OPTIONS.map((option) => (
								<option
									key={option.value}
									value={option.value}
									style={{ fontFamily: option.value }}
								>
									{option.label}
								</option>
							))}
						</select>
					</div>
					<div className="rte-toolbar-separator" />
					<ToolbarButton onClick={() => execCommand('underline')} icon={<u>U</u>} title="Subliniat" />
					<ToolbarButton
						onClick={() => {
							setColorType('foreground');
							setShowColorPicker(true);
						}}
						icon="A"
						title="Culoare text"
						className="rte-toolbar-btn-color"
					/>
				</div>
			)}
			{toolbarVariant === 'full' && (
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
					onMouseDown={handleEditorMouseDown}
					onDoubleClick={handleEditorDoubleClick}
					onPaste={handlePaste}
					onContextMenu={toolbarVariant === 'basic' ? undefined : (e) => {
						e.preventDefault();
						saveSelection();
						const imageTarget = findEditableImage(e.target, editorRef.current);
						setContextMenu({
							open: true,
							x: e.clientX,
							y: e.clientY,
							imageTarget: imageTarget || null,
						});
					}}
					onMouseUp={handleEditorSelectionChange}
					onKeyDown={handleEditorKeyDown}
					onKeyUp={handleEditorSelectionChange}
					onFocus={() => {
						setIsFocused(true);
						refreshBasicFontFromSelection();
					}}
					onBlur={(e) => {
						const container = e.currentTarget.closest('.rte-container');
						const nextFocus = e.relatedTarget;
						if (nextFocus && container?.contains(nextFocus)) {
							handleEditorSelectionChange();
							return;
						}
						saveSelection();
						// Trimite ultima versiune din DOM înainte de flush la părinte (formatări din toolbar, paste etc. pot să nu fi declanșat încă onInput).
						syncEditorFromDom();
						setIsFocused(false);
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
					{contextMenu.imageTarget ? (
						<>
							<button
								type="button"
								onMouseDown={handleToolMouseDown}
								onClick={() => {
									openImageEditModal(contextMenu.imageTarget);
									setContextMenu((prev) => ({ ...prev, open: false, imageTarget: null }));
								}}
							>
								<span className="rte-context-menu-icon"><RteIcon name="image" /></span>
								<span>Setări imagine</span>
							</button>
							<span className="rte-context-menu-separator" aria-hidden="true" />
						</>
					) : null}
					<button
						type="button"
						onMouseDown={handleToolMouseDown}
						onClick={() => {
							imageInputRef.current?.click();
							setContextMenu((prev) => ({ ...prev, open: false, imageTarget: null }));
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
						<span>Lipește</span>
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

			{showImageEditModal && (
				<ImageEditModal
					draft={imageEditDraft}
					onDraftChange={setImageEditDraft}
					onApply={applyImageEdit}
					onClose={cancelImageEdit}
					onDelete={deleteEditingImage}
				/>
			)}
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

const ImageEditModal = ({ draft, onDraftChange, onApply, onClose, onDelete }) => {
	const previewAlignClass = `rte-image-preview-wrap--${draft.align}`;

	return (
		<div className="rte-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="rte-image-edit-title" onClick={onClose}>
			<div className="rte-modal rte-image-edit-modal" onClick={(e) => e.stopPropagation()}>
				<div className="rte-modal-header">
					<h3 id="rte-image-edit-title" className="rte-modal-title">Setări imagine</h3>
					<button type="button" onClick={onClose} className="rte-modal-close" aria-label="Închide">×</button>
				</div>

				<div className="rte-modal-body">
					<div className={`rte-image-preview-wrap ${previewAlignClass}`}>
						<img
							src={draft.previewSrc}
							alt="Previzualizare imagine"
							className="rte-image-preview"
							style={{ width: `${draft.widthPercent}%` }}
						/>
					</div>

					<div className="rte-image-edit-section">
						<p className="rte-image-edit-label">Dimensiune</p>
						<div className="rte-image-size-options">
							{IMAGE_SIZE_PRESETS.map((preset) => (
								<button
									key={preset.id}
									type="button"
									className={`rte-image-size-btn${draft.widthPercent === preset.percent ? ' is-active' : ''}`}
									onClick={() => onDraftChange({ ...draft, widthPercent: preset.percent })}
								>
									{preset.label}
								</button>
							))}
						</div>
					</div>

					<div className="rte-image-edit-section">
						<p className="rte-image-edit-label">Aliniere</p>
						<div className="rte-image-align-options">
							{IMAGE_ALIGN_OPTIONS.map((option) => (
								<button
									key={option.id}
									type="button"
									className={`rte-image-align-btn${draft.align === option.id ? ' is-active' : ''}`}
									onClick={() => onDraftChange({ ...draft, align: option.id })}
								>
									{option.label}
								</button>
							))}
						</div>
					</div>

					<div className="rte-image-edit-actions">
						<button type="button" className="rte-image-delete-btn" onClick={onDelete}>
							Șterge imaginea
						</button>
						<div className="rte-image-edit-actions__main">
							<button type="button" className="rte-image-modal-btn rte-image-modal-btn--secondary" onClick={onClose}>Anulează</button>
							<button type="button" className="rte-image-modal-btn rte-image-modal-btn--primary" onClick={onApply}>Aplică</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};

// Color Picker Modal Component
const ColorPickerModal = ({ palette = RTE_COLOR_PALETTE, selectedColor, onColorSelect, onClose, type }) => {
	const [customColor, setCustomColor] = useState(selectedColor || '#0891b2');

	useEffect(() => {
		setCustomColor(selectedColor || '#0891b2');
	}, [selectedColor]);

	const colors = Array.isArray(palette) && palette.length > 0 ? palette : RTE_COLOR_PALETTE;

	return (
		<div
			className="rte-modal-overlay"
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
									border: '1px solid rgba(8,145,178,0.3)',
									borderRadius: '8px',
									cursor: 'pointer',
									background: 'transparent',
								}}
							/>
							<input
								type="text"
								value={customColor}
								onChange={(e) => setCustomColor(e.target.value)}
								placeholder="#0891b2"
								style={{
									flex: 1,
									padding: '0.75rem',
									background: 'rgba(255,255,255,0.05)',
									border: '1px solid rgba(8,145,178,0.2)',
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
									background: 'linear-gradient(135deg, rgba(8,145,178,0.2), rgba(8,145,178,0.15))',
									border: '1px solid rgba(8,145,178,0.4)',
									borderRadius: '10px',
									color: '#0891b2',
									fontWeight: 700,
									cursor: 'pointer',
									transition: 'all 0.3s ease',
								}}
								onMouseEnter={(e) => {
									e.currentTarget.style.background = 'linear-gradient(135deg, rgba(8,145,178,0.3), rgba(8,145,178,0.2))';
									e.currentTarget.style.transform = 'translateY(-2px)';
								}}
								onMouseLeave={(e) => {
									e.currentTarget.style.background = 'linear-gradient(135deg, rgba(8,145,178,0.2), rgba(8,145,178,0.15))';
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
		>
			<div
				className="rte-modal"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="rte-modal-header">
					<h3 style={{
						margin: 0,
						background: 'linear-gradient(135deg, #ffffff, #0891b2)',
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
								border: '1px solid rgba(8,145,178,0.2)',
								borderRadius: '12px',
								color: '#fff',
								fontSize: '1rem',
								transition: 'all 0.3s ease',
							}}
							onFocus={(e) => {
								e.target.style.borderColor = 'rgba(8,145,178,0.4)';
								e.target.style.background = 'rgba(255,255,255,0.08)';
							}}
							onBlur={(e) => {
								e.target.style.borderColor = 'rgba(8,145,178,0.2)';
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
									? 'linear-gradient(135deg, rgba(8,145,178,0.2), rgba(8,145,178,0.15))'
									: 'rgba(255,255,255,0.05)',
								border: linkUrl.trim()
									? '1px solid rgba(8,145,178,0.4)'
									: '1px solid rgba(255,255,255,0.1)',
								borderRadius: '10px',
								color: linkUrl.trim() ? '#0891b2' : 'rgba(255,255,255,0.5)',
								fontWeight: 700,
								cursor: linkUrl.trim() ? 'pointer' : 'not-allowed',
								transition: 'all 0.3s ease',
							}}
							onMouseEnter={(e) => {
								if (linkUrl.trim()) {
									e.currentTarget.style.background = 'linear-gradient(135deg, rgba(8,145,178,0.3), rgba(8,145,178,0.2))';
									e.currentTarget.style.borderColor = 'rgba(8,145,178,0.5)';
									e.currentTarget.style.transform = 'translateY(-2px)';
								}
							}}
							onMouseLeave={(e) => {
								if (linkUrl.trim()) {
									e.currentTarget.style.background = 'linear-gradient(135deg, rgba(8,145,178,0.2), rgba(8,145,178,0.15))';
									e.currentTarget.style.borderColor = 'rgba(8,145,178,0.4)';
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
		>
			<div
				className="rte-modal"
				onClick={(e) => e.stopPropagation()}
				style={{ maxWidth: '600px' }}
			>
				<div className="rte-modal-header">
					<h3 style={{
						margin: 0,
						background: 'linear-gradient(135deg, #ffffff, #0891b2)',
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
								border: '2px dashed rgba(8,145,178,0.3)',
								borderRadius: '16px',
								padding: '3rem 2rem',
								textAlign: 'center',
								cursor: 'pointer',
								transition: 'all 0.3s ease',
								background: 'rgba(8,145,178,0.05)',
							}}
							onMouseEnter={(e) => {
								e.currentTarget.style.borderColor = 'rgba(8,145,178,0.5)';
								e.currentTarget.style.background = 'rgba(8,145,178,0.1)';
								e.currentTarget.style.transform = 'translateY(-2px)';
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.borderColor = 'rgba(8,145,178,0.3)';
								e.currentTarget.style.background = 'rgba(8,145,178,0.05)';
								e.currentTarget.style.transform = 'translateY(0)';
							}}
						>
							<div style={{ fontSize: '4rem', marginBottom: '1rem' }}>📄</div>
							<div style={{
								color: '#0891b2',
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
							background: 'rgba(8,145,178,0.1)',
							border: '1px solid rgba(8,145,178,0.3)',
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
										color: '#0891b2',
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
										color: isPartialRange ? '#0891b2' : 'rgba(255,255,255,0.55)',
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
									? 'linear-gradient(135deg, rgba(8,145,178,0.2), rgba(8,145,178,0.15))'
									: 'rgba(255,255,255,0.05)',
								border: pdfFile && !uploadingPdf
									? '1px solid rgba(8,145,178,0.4)'
									: '1px solid rgba(255,255,255,0.1)',
								borderRadius: '10px',
								color: pdfFile && !uploadingPdf ? '#0891b2' : 'rgba(255,255,255,0.5)',
								fontWeight: 700,
								cursor: pdfFile && !uploadingPdf ? 'pointer' : 'not-allowed',
								transition: 'all 0.3s ease',
								display: 'inline-flex',
								alignItems: 'center',
								gap: '0.5rem',
							}}
							onMouseEnter={(e) => {
								if (pdfFile && !uploadingPdf) {
									e.currentTarget.style.background = 'linear-gradient(135deg, rgba(8,145,178,0.3), rgba(8,145,178,0.2))';
									e.currentTarget.style.borderColor = 'rgba(8,145,178,0.5)';
									e.currentTarget.style.transform = 'translateY(-2px)';
								}
							}}
							onMouseLeave={(e) => {
								if (pdfFile && !uploadingPdf) {
									e.currentTarget.style.background = 'linear-gradient(135deg, rgba(8,145,178,0.2), rgba(8,145,178,0.15))';
									e.currentTarget.style.borderColor = 'rgba(8,145,178,0.4)';
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
