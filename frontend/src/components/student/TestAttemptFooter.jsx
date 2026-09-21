import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import './TestAttemptFooter.css';

export default function TestAttemptFooter({
    currentIndex,
    total,
    onNavigate,
    onSubmit,
    submitting = false,
    canSubmit = true,
    canGoBack = true,
    canGoNext = true,
    submitted = false,
    backTo,
    children,
}) {
    const footerRef = useRef(null);

    useEffect(() => {
        const viewport = window.visualViewport;
        if (!viewport) return undefined;
        const update = () => {
            const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
            footerRef.current?.style.setProperty('--keyboard-inset', `${Math.round(inset)}px`);
        };
        viewport.addEventListener('resize', update);
        viewport.addEventListener('scroll', update);
        update();
        return () => {
            viewport.removeEventListener('resize', update);
            viewport.removeEventListener('scroll', update);
        };
    }, []);

    const showSubmit = !submitted && total > 0 && currentIndex === total - 1;
    const showLeaveAfterSubmit = Boolean(submitted && backTo);

    return (
        <footer ref={footerRef} className={`test-attempt-footer${showSubmit ? ' test-attempt-footer--submit' : ''}`}>
            {!submitted && total > 0 && <nav className="test-attempt-footer-navigation" aria-label="Navigare întrebări">
                <button type="button" className="test-attempt-nav-btn" aria-label="Întrebarea anterioară"
                    disabled={submitting || currentIndex === 0 || !canGoBack} onClick={() => onNavigate(currentIndex - 1)}>
                    <CaretLeft size={28} weight="bold" aria-hidden />
                </button>
                <span className="test-attempt-footer-q-count" aria-live="polite">{currentIndex + 1} / {total}</span>
                <button type="button" className="test-attempt-nav-btn" aria-label="Întrebarea următoare"
                    disabled={submitting || currentIndex >= total - 1 || !canGoNext} onClick={() => onNavigate(currentIndex + 1)}>
                    <CaretRight size={28} weight="bold" aria-hidden />
                </button>
            </nav>}
            <div className="test-attempt-footer-submit">
                {showSubmit && <button type="button"
                    className="lms-btn-primary" disabled={submitting || !canSubmit} onClick={onSubmit}>
                    {submitting ? 'Se trimite…' : 'Trimite testul'}
                </button>}
                {children}
                {showLeaveAfterSubmit && (
                    <Link to={backTo} className="lms-btn-primary test-attempt-back-btn">Înapoi la curs</Link>
                )}
            </div>
        </footer>
    );
}
