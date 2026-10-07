import React, { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { NodeSelection } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import LessonImage from './image/LessonImageExtension.js';
import { lessonImageWidthForLayout } from './image/lessonImageAttrs.js';
import Placeholder from '@tiptap/extension-placeholder';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import {
	ArrowClockwise,
	ArrowCounterClockwise,
	Image as ImageIcon,
	Link as LinkIcon,
	ListBullets,
	ListNumbers,
	TextAlignCenter,
	TextAlignLeft,
	TextAlignRight,
	TextB,
	TextHThree,
	TextHTwo,
	TextItalic,
	TextStrikethrough,
	TextUnderline,
	ChatCircleText,
	FilmSlate,
} from '@phosphor-icons/react';
import { adminService } from '../../../services/api';
import { toImageUrl } from '../../../utils/imageUrl';
import { normalizePastedHtmlForRichText } from '../../../utils/pasteRichTextColor';
import { useToast } from '../../../contexts/ToastContextShared.js';
import LessonCallout from './callout/lessonCallout.js';
import LessonCalloutPanel from './callout/LessonCalloutPanel.jsx';
import LessonTextColorButton from './LessonTextColorButton.jsx';
import LessonVideo from './video/lessonVideo.js';
import { resolveLessonVideo } from './video/lessonVideoSource.js';
import './LessonTipTapEditor.css';
import './callout/LessonCallout.css';
import './video/LessonVideo.css';

const CALLOUT_PANEL_HEIGHT = 260;

function calloutAnchor(editor) {
	const { from, to } = editor.state.selection;
	const start = editor.view.coordsAtPos(from);
	const end = editor.view.coordsAtPos(Math.max(from, to - 1));
	const top = Math.min(start.top, end.top);
	const left = Math.max(12, Math.min(Math.min(start.left, end.left), window.innerWidth - 352));
	// Panoul are ~260px; deasupra selecției trebuie să încapă sub bara fixă a aplicației.
	const headerHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--app-header-height')) || 64;
	const placeBelow = top < headerHeight + CALLOUT_PANEL_HEIGHT + 16;
	const y = placeBelow ? Math.max(start.bottom, end.bottom) : top;
	// Chenarul poate fi în afara ecranului (ex. ai urcat la bara de unelte peste un video mare):
	// panoul rămâne în ecran, altfel nu se mai poate folosi.
	if (placeBelow && y > window.innerHeight - CALLOUT_PANEL_HEIGHT - 16) {
		return { x: left, y: Math.max(headerHeight + CALLOUT_PANEL_HEIGHT + 16, window.innerHeight - 16), placeBelow: false };
	}
	if (!placeBelow && y > window.innerHeight - 16) {
		return { x: left, y: window.innerHeight - 16, placeBelow: false };
	}
	return { x: left, y, placeBelow };
}

function ToolbarButton({ active, disabled, label, onClick, children }) {
	return (
		<button
			type="button"
			className={`lesson-tiptap-btn${active ? ' is-active' : ''}`}
			aria-pressed={active}
			aria-label={label}
			title={label}
			disabled={disabled}
			onMouseDown={(event) => event.preventDefault()}
			onClick={onClick}
		>
			{children}
		</button>
	);
}

const LessonTipTapEditor = ({
	value = '',
	onChange,
	onBlur,
	placeholder = 'Scrie lecția aici...',
	style,
	courseId = null,
	/** async (file) => url; are prioritate față de încărcarea în curs (ex. bibliotecă) */
	uploadImage = null,
	toolbarEnd = null,
	header = null,
	/** false ascunde butonul Video (biblioteca curăță iframe-urile la salvare) */
	allowVideo = true,
}) => {
	const { warning: showWarning } = useToast();
	const fileRef = useRef(null);
	const onChangeRef = useRef(onChange);
	const onBlurRef = useRef(onBlur);
	const lastHtmlRef = useRef(value || '');
	const [calloutPanel, setCalloutPanel] = useState(null);

	useEffect(() => {
		onChangeRef.current = onChange;
		onBlurRef.current = onBlur;
	}, [onChange, onBlur]);

	const editor = useEditor({
		extensions: [
			StarterKit.configure({
				heading: { levels: [2, 3] },
				blockquote: false,
				dropcursor: { color: 'var(--text-primary)', width: 2 },
				link: {
					openOnClick: false,
					autolink: true,
					HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
				},
			}),
			TextStyle,
			Color,
			TextAlign.configure({ types: ['heading', 'paragraph'] }),
			LessonImage.configure({ inline: false, allowBase64: true }),
			LessonCallout,
			LessonVideo,
			Placeholder.configure({ placeholder }),
		],
		content: value || '',
		// bara de unelte citește starea activă la fiecare randare (TipTap 3 nu mai re-randează implicit)
		shouldRerenderOnTransaction: true,
		editorProps: {
			attributes: {
				class: 'lesson-tiptap-surface',
			},
			transformPastedHTML(html) {
				return normalizePastedHtmlForRichText(html);
			},
		},
		onUpdate: ({ editor: current }) => {
			const html = current.isEmpty ? '' : current.getHTML();
			lastHtmlRef.current = html;
			onChangeRef.current?.(html);
		},
		onBlur: () => {
			onBlurRef.current?.();
		},
		onSelectionUpdate: ({ editor: current }) => {
			const selection = current.state.selection;
			if (selection instanceof NodeSelection || selection.empty) {
				setCalloutPanel((prev) => (prev?.pinned ? prev : null));
				return;
			}
			setCalloutPanel({ pinned: false, ...calloutAnchor(current) });
		},
	});

	useEffect(() => {
		if (!editor || editor.isFocused) return;
		const next = value || '';
		if (next === lastHtmlRef.current) return;
		lastHtmlRef.current = next;
		editor.commands.setContent(next, { emitUpdate: false });
	}, [editor, value]);

	const alignBlock = (alignment) => {
		if (!editor) return;
		if (editor.isActive('image')) {
			// alinierea nu schimbă mărimea imaginii: păstrăm lățimea afișată acum
			const current = editor.getAttributes('image');
			const frame = editor.view.nodeDOM(editor.state.selection.from)?.querySelector?.('.lesson-image-frame');
			const width = lessonImageWidthForLayout({
				alignment: current.alignment,
				savedWidth: current.width,
				displayedWidth: frame?.getBoundingClientRect().width,
			});
			const img = frame?.querySelector('img');
			const ratio = img?.naturalWidth > 0 ? img.naturalHeight / img.naturalWidth : null;
			editor.chain().focus().updateAttributes('image', {
				alignment,
				width,
				height: width && ratio ? Math.max(1, Math.round(width * ratio)) : current.height,
			}).run();
			return;
		}
		editor.chain().focus().setTextAlign(alignment).run();
	};

	const alignActive = (alignment) => {
		if (!editor) return false;
		if (editor.isActive('image')) return (editor.getAttributes('image').alignment || 'center') === alignment;
		return editor.isActive({ textAlign: alignment });
	};

	const insertVideo = () => {
		if (!editor) return;
		const next = window.prompt('Linkul video-ului (YouTube, Vimeo, Loom, Google Drive sau fișier .mp4)');
		if (next === null || next.trim() === '') return;
		if (!resolveLessonVideo(next)) {
			showWarning('Linkul nu poate fi redat în lecție. Folosește un link YouTube, Vimeo, Loom, Google Drive sau un fișier .mp4 / .webm.');
			return;
		}
		editor.chain().focus().setLessonVideo(next.trim()).run();
	};

	const setLink = () => {
		if (!editor) return;
		const previous = editor.getAttributes('link').href || '';
		const next = window.prompt('Adresa linkului', previous);
		if (next === null) return;
		if (next.trim() === '') {
			editor.chain().focus().extendMarkRange('link').unsetLink().run();
			return;
		}
		editor.chain().focus().extendMarkRange('link').setLink({ href: next.trim() }).run();
	};

	const applyCallout = (patch) => {
		if (!editor) return;
		const current = editor.getAttributes('lessonCallout');
		editor.chain().focus().setLessonCallout({
			type: current.type || 'soft',
			accent: current.accent || '#1970f0',
			variant: patch.variant || current.variant || 'info',
			fill: patch.fill || current.fill || 'shadow',
		}).run();
		setCalloutPanel({ pinned: true, ...calloutAnchor(editor) });
	};

	const openCalloutPanel = () => {
		if (!editor) return;
		const selection = editor.state.selection;
		const pinned = selection instanceof NodeSelection || selection.empty;
		setCalloutPanel({ pinned, ...calloutAnchor(editor) });
	};

	const insertImageFile = async (file) => {
		if (!editor || !file) return;
		if (!file.type.startsWith('image/')) {
			showWarning('Te rugăm să selectezi un fișier imagine.');
			return;
		}
		try {
			let src = '';
			if (uploadImage) {
				const url = await uploadImage(file);
				src = toImageUrl(url || '') || url || '';
			} else if (courseId) {
				const formData = new FormData();
				formData.append('file', file);
				formData.append('type', 'image');
				const result = await adminService.builderUploadContentFile(courseId, formData);
				src = toImageUrl(result?.url || '') || result?.url || '';
			} else {
				src = await new Promise((resolve, reject) => {
					const reader = new FileReader();
					reader.onload = () => resolve(String(reader.result || ''));
					reader.onerror = reject;
					reader.readAsDataURL(file);
				});
			}
			if (src) {
				editor.chain().focus().setImage({ src, alignment: 'center' }).run();
			}
		} catch {
			showWarning('Imaginea nu a putut fi încărcată.');
		}
	};

	return (
		<div className="lesson-tiptap" style={style}>
			<div className="lesson-tiptap-toolbar" role="toolbar" aria-label="Formatare lecție">
				<div className="lesson-tiptap-toolbar-tools">
					<ToolbarButton label="Titlu" active={editor?.isActive('heading', { level: 2 })} disabled={!editor} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
						<TextHTwo size={18} weight="bold" color="currentColor" aria-hidden />
					</ToolbarButton>
					<ToolbarButton label="Subtitlu" active={editor?.isActive('heading', { level: 3 })} disabled={!editor} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
						<TextHThree size={18} weight="bold" color="currentColor" aria-hidden />
					</ToolbarButton>
					<span className="lesson-tiptap-sep" aria-hidden />
					<ToolbarButton label="Aldin" active={editor?.isActive('bold')} disabled={!editor} onClick={() => editor.chain().focus().toggleBold().run()}>
						<TextB size={18} weight="bold" color="currentColor" aria-hidden />
					</ToolbarButton>
					<ToolbarButton label="Cursiv" active={editor?.isActive('italic')} disabled={!editor} onClick={() => editor.chain().focus().toggleItalic().run()}>
						<TextItalic size={18} weight="bold" color="currentColor" aria-hidden />
					</ToolbarButton>
					<ToolbarButton label="Subliniat" active={editor?.isActive('underline')} disabled={!editor} onClick={() => editor.chain().focus().toggleUnderline().run()}>
						<TextUnderline size={18} weight="bold" color="currentColor" aria-hidden />
					</ToolbarButton>
					<ToolbarButton label="Tăiat" active={editor?.isActive('strike')} disabled={!editor} onClick={() => editor.chain().focus().toggleStrike().run()}>
						<TextStrikethrough size={18} weight="bold" color="currentColor" aria-hidden />
					</ToolbarButton>
					<LessonTextColorButton editor={editor} onOpen={() => setCalloutPanel(null)} />
					<span className="lesson-tiptap-sep" aria-hidden />
					<ToolbarButton label="Listă" active={editor?.isActive('bulletList')} disabled={!editor} onClick={() => editor.chain().focus().toggleBulletList().run()}>
						<ListBullets size={18} weight="bold" color="currentColor" aria-hidden />
					</ToolbarButton>
					<ToolbarButton label="Listă numerotată" active={editor?.isActive('orderedList')} disabled={!editor} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
						<ListNumbers size={18} weight="bold" color="currentColor" aria-hidden />
					</ToolbarButton>
					<span className="lesson-tiptap-sep" aria-hidden />
					<ToolbarButton label="Aliniere stânga" active={alignActive('left')} disabled={!editor} onClick={() => alignBlock('left')}>
						<TextAlignLeft size={18} weight="bold" color="currentColor" aria-hidden />
					</ToolbarButton>
					<ToolbarButton label="Aliniere centru" active={alignActive('center')} disabled={!editor} onClick={() => alignBlock('center')}>
						<TextAlignCenter size={18} weight="bold" color="currentColor" aria-hidden />
					</ToolbarButton>
					<ToolbarButton label="Aliniere dreapta" active={alignActive('right')} disabled={!editor} onClick={() => alignBlock('right')}>
						<TextAlignRight size={18} weight="bold" color="currentColor" aria-hidden />
					</ToolbarButton>
					<span className="lesson-tiptap-sep" aria-hidden />
					<ToolbarButton label="Link" active={editor?.isActive('link')} disabled={!editor} onClick={setLink}>
						<LinkIcon size={18} weight="bold" color="currentColor" aria-hidden />
					</ToolbarButton>
					<ToolbarButton label="Imagine" disabled={!editor} onClick={() => fileRef.current?.click()}>
						<ImageIcon size={18} weight="bold" color="currentColor" aria-hidden />
					</ToolbarButton>
					{allowVideo ? (
						<ToolbarButton label="Video" disabled={!editor} onClick={insertVideo}>
							<FilmSlate size={18} weight="bold" color="currentColor" aria-hidden />
						</ToolbarButton>
					) : null}
					<ToolbarButton label="Chenar" active={editor?.isActive('lessonCallout')} disabled={!editor} onClick={openCalloutPanel}>
						<ChatCircleText size={18} weight="bold" color="currentColor" aria-hidden />
					</ToolbarButton>
					<span className="lesson-tiptap-sep" aria-hidden />
					<ToolbarButton label="Anulează" disabled={!editor?.can().undo()} onClick={() => editor.chain().focus().undo().run()}>
						<ArrowCounterClockwise size={18} weight="bold" color="currentColor" aria-hidden />
					</ToolbarButton>
					<ToolbarButton label="Refă" disabled={!editor?.can().redo()} onClick={() => editor.chain().focus().redo().run()}>
						<ArrowClockwise size={18} weight="bold" color="currentColor" aria-hidden />
					</ToolbarButton>
				</div>
				{toolbarEnd ? <div className="lesson-tiptap-toolbar-end">{toolbarEnd}</div> : null}
			</div>
			{header ? <div className="lesson-tiptap-header">{header}</div> : null}
			<input
				ref={fileRef}
				type="file"
				accept="image/*"
				hidden
				onChange={(event) => {
					const file = event.target.files?.[0];
					event.target.value = '';
					insertImageFile(file);
				}}
			/>
			<div className="lesson-tiptap-body">
				<EditorContent editor={editor} />
			</div>
			{calloutPanel && editor ? (
				<LessonCalloutPanel
					variant={editor.getAttributes('lessonCallout').variant || null}
					fill={editor.getAttributes('lessonCallout').fill || 'shadow'}
					x={calloutPanel.x}
					y={calloutPanel.y}
					placeBelow={calloutPanel.placeBelow}
					onVariant={(variant) => applyCallout({ variant })}
					onFill={(fill) => applyCallout({ fill })}
					onRemove={editor.isActive('lessonCallout') ? () => {
						editor.chain().focus().unsetLessonCallout().run();
						setCalloutPanel(null);
					} : null}
					onClose={() => setCalloutPanel(null)}
				/>
			) : null}
		</div>
	);
};

export default LessonTipTapEditor;
