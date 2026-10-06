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

function pastedStyleSheetText(doc) {
	return Array.from(doc.querySelectorAll('style'))
		.map((styleTag) => styleTag.textContent || '')
		.join('\n')
		.replace(/<!--|-->/g, '')
		.replace(/\/\*[\s\S]*?\*\//g, '');
}

function applyPastedCssColorRules(doc) {
	const css = pastedStyleSheetText(doc);
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
				// Clipboard CSS often contains browser-only selectors.
			}
		});
	}
}

function collectPastedClassColorRules(doc) {
	const rulesByClass = new Map();
	const css = pastedStyleSheetText(doc);
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

function elementTextColor(element) {
	if (!element || element.nodeType !== 1) return '';
	const inlineColor = cleanPastedCssValue(element.style?.getPropertyValue('color'))
		|| cleanPastedCssValue(element.style?.getPropertyValue('-webkit-text-fill-color'));
	const fontColor = element.tagName === 'FONT' ? cleanPastedCssValue(element.getAttribute('color')) : '';
	if (isUsefulPastedColor(inlineColor)) return inlineColor;
	if (isUsefulPastedColor(fontColor)) return fontColor;
	return '';
}

function wrapPastedTextWithColor(doc) {
	const textNodes = [];
	const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
	let current = walker.nextNode();
	while (current) {
		textNodes.push(current);
		current = walker.nextNode();
	}

	textNodes.forEach((textNode) => {
		if (!String(textNode.nodeValue || '').trim()) return;
		const parent = textNode.parentElement;
		if (!parent || parent.closest('style, script')) return;

		let color = '';
		let element = parent;
		while (element && element !== doc.body.parentElement) {
			color = elementTextColor(element);
			if (color) break;
			element = element.parentElement;
		}
		if (!color) return;
		if (parent.tagName === 'SPAN' && elementTextColor(parent) === color && parent.childNodes.length === 1) return;

		const span = doc.createElement('span');
		span.style.setProperty('color', color);
		parent.insertBefore(span, textNode);
		span.appendChild(textNode);
	});
}

/** Pune culoarea din pagini, Word sau browser direct pe text, ca editorul să o păstreze. */
export function normalizePastedHtmlForRichText(html) {
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

	wrapPastedTextWithColor(doc);
	doc.querySelectorAll('style').forEach((styleTag) => styleTag.remove());
	return doc.body.innerHTML || html;
}
