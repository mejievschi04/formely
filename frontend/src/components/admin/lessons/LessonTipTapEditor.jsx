import React, { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { NodeSelection } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import LessonImage from './image/LessonImageExtension.js';
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
} from '@phosphor-icons/react';
import { adminService } from '../../../services/api';
import { toImageUrl } from '../../../utils/imageUrl';
import { normalizePastedHtmlForRichText } from '../../../utils/pasteRichTextColor';
import { useToast } from '../../../contexts/ToastContextShared.js';
import LessonCallout from './callout/lessonCallout.js';
import LessonCalloutPanel from './callout/LessonCalloutPanel.jsx';
import './LessonTipTapEditor.css';
import './callout/LessonCallout.css';

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
	return {
		x: left,
		y: placeBelow ? Math.max(start.bottom, end.bottom) : top,
		placeBelow,
	};
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
			editor.chain().focus().updateAttributes('image', {
				alignment,
				...(alignment === 'full' ? { width: null } : {}),
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
			accent: current.accent || '#ffee00',
			variant: patch.variant || current.variant || 'info',
			fill: patch.fill || current.fill || 'mono',
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
					fill={editor.getAttributes('lessonCallout').fill || 'mono'}
					x={calloutPanel.x}
					y={calloutPanel.y}
					placeBelow={calloutPanel.placeBelow}
					onVariant={(variant) => applyCallout({ variant })}
					onFill={(fill) => applyCallout({ fill })}
					onClose={() => setCalloutPanel(null)}
				/>
			) : null}
		</div>
	);
};

export default LessonTipTapEditor;
