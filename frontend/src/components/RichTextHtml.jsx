import React from 'react';
import { normalizeRichTextMediaHtml, stripRichTextToPlain } from '../utils/richTextContent';

export default function RichTextHtml({ html, className, as: Tag = 'div', fallback = null }) {
	const normalized = normalizeRichTextMediaHtml(html);
	const plain = stripRichTextToPlain(normalized);
	if (!plain) {
		return fallback;
	}
	return <Tag className={className} dangerouslySetInnerHTML={{ __html: normalized }} />;
}
