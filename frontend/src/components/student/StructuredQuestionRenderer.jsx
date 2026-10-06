import React, { useEffect, useMemo } from 'react';
import {
	DndContext,
	KeyboardSensor,
	PointerSensor,
	closestCenter,
	useDroppable,
	useDraggable,
	useSensor,
	useSensors,
} from '@dnd-kit/core';
import {
	SortableContext,
	arrayMove,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DragGripIcon } from '../common/DragGripIcon';
import './StructuredQuestionRenderer.css';

const sequenceToStrings = (value) => {
	if (!Array.isArray(value)) return null;
	return value.map((item) => String(item));
};

function SortableOrderItem({ id, text, disabled }) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
	return (
		<div
			ref={setNodeRef}
			className={`student-exam-order-item${isDragging ? ' is-dragging' : ''}${disabled ? ' is-disabled' : ''}`}
			style={{ transform: CSS.Transform.toString(transform), transition }}
		>
			<button
				type="button"
				{...attributes}
				{...listeners}
				disabled={disabled}
				aria-label="Mută elementul"
				className="student-exam-order-handle"
			>
				<DragGripIcon size={16} />
			</button>
			<span className="student-exam-order-text">{text}</span>
		</div>
	);
}

function OrderingQuestion({ question, value, onChange, disabled }) {
	const items = question.ordering?.items || [];
	const itemMap = useMemo(() => new Map(items.map((item) => [String(item.id), item])), [items]);
	const defaultOrder = useMemo(() => items.map((item) => String(item.id)), [items]);
	const currentOrder = sequenceToStrings(value) || defaultOrder;
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
	);

	const orderedItems = currentOrder
		.map((id) => itemMap.get(String(id)))
		.filter(Boolean);

	useEffect(() => {
		if (!items.length) return;
		if (!Array.isArray(value) || value.length !== items.length) {
			onChange(defaultOrder);
		}
	}, [defaultOrder, items.length, onChange, value]);

	const handleDragEnd = ({ active, over }) => {
		if (!over || active.id === over.id) return;
		const oldIndex = currentOrder.indexOf(String(active.id));
		const newIndex = currentOrder.indexOf(String(over.id));
		if (oldIndex < 0 || newIndex < 0) return;
		const next = arrayMove(currentOrder, oldIndex, newIndex);
		onChange(next);
	};

	if (!items.length) {
		return (
			<div className="student-exam-structured-empty">
				Nu există elemente pentru ordonare.
			</div>
		);
	}

	return (
		<div className="student-exam-ordering">
			<div className="student-exam-structured-hint">
				Trage elementele în ordinea corectă.
			</div>
			<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
				<SortableContext items={currentOrder} strategy={verticalListSortingStrategy}>
					<div className="student-exam-ordering-list">
						{orderedItems.map((item) => (
							<SortableOrderItem
								key={item.id}
								id={String(item.id)}
								text={item.text}
								disabled={disabled}
							/>
						))}
					</div>
				</SortableContext>
			</DndContext>
		</div>
	);
}

function MatchingChip({ id, text, disabled }) {
	const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id });
	return (
		<button
			ref={setNodeRef}
			type="button"
			{...attributes}
			{...listeners}
			disabled={disabled}
			className={`student-exam-matching-chip${isDragging ? ' is-dragging' : ''}`}
			style={{ transform: CSS.Transform.toString(transform) }}
		>
			{text}
		</button>
	);
}

function MatchingSlot({ slotId, assignedId, assignedText, placeholder, disabled }) {
	const { isOver, setNodeRef } = useDroppable({ id: slotId });
	return (
		<div
			ref={setNodeRef}
			className={`student-exam-matching-slot${assignedText ? ' is-filled' : ''}${isOver ? ' is-over' : ''}`}
		>
			{assignedText ? (
				<MatchingChip id={`matching-chip-${assignedId}`} text={assignedText} disabled={disabled} />
			) : (
				<span className="student-exam-matching-placeholder">{placeholder}</span>
			)}
		</div>
	);
}

function MatchingQuestion({ question, value, onChange, disabled }) {
	const leftItems = question.matching?.leftItems || [];
	const rightItems = question.matching?.rightItems || [];
	const poolId = `matching-pool-${question.id}`;
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
	);
	const current = useMemo(() => {
		const next = Array.isArray(value) ? value.slice(0, leftItems.length) : [];
		while (next.length < leftItems.length) next.push(null);
		return next;
	}, [value, leftItems.length]);
	const { setNodeRef: setPoolNodeRef, isOver: isPoolOver } = useDroppable({ id: poolId });

	const assigned = new Set(current.filter((item) => item !== null && item !== undefined).map((item) => String(item)));
	const poolItems = rightItems.filter((item) => !assigned.has(String(item.id)));

	const handleDragEnd = ({ active, over }) => {
		if (!over) return;
		const draggedId = String(active.id).replace(/^matching-chip-/, '');
		const currentIndex = current.findIndex((item) => String(item) === draggedId);

		if (over.id === poolId) {
			if (currentIndex === -1) return;
			const next = current.slice();
			next[currentIndex] = null;
			onChange(next);
			return;
		}

		if (String(over.id).startsWith('matching-slot-')) {
			const slotIndex = Number(String(over.id).replace('matching-slot-', ''));
			if (Number.isNaN(slotIndex)) return;
			const next = current.slice();
			next.forEach((item, idx) => {
				if (String(item) === draggedId) next[idx] = null;
			});
			next[slotIndex] = draggedId;
			onChange(next);
		}
	};

	if (!leftItems.length || !rightItems.length) {
		return (
			<div className="student-exam-structured-empty">
				Nu există perechi suficiente pentru potrivire.
			</div>
		);
	}

	return (
		<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
			<div className="student-exam-structured-hint">
				Trage răspunsurile în slotul potrivit.
			</div>
			<div className="student-exam-matching">
				<div className="student-exam-matching-left">
					{leftItems.map((item, idx) => {
						const assignedId = current[idx];
						const assignedItem = rightItems.find((opt) => String(opt.id) === String(assignedId));
						return (
							<div key={item.id} className="student-exam-matching-row">
								<div className="student-exam-matching-prompt">{item.text}</div>
								<MatchingSlot
									slotId={`matching-slot-${idx}`}
									assignedId={assignedId}
									assignedText={assignedItem?.text || ''}
									placeholder="Trage răspunsul aici"
									disabled={disabled}
								/>
							</div>
						);
					})}
				</div>
				<div
					className={`student-exam-matching-pool${isPoolOver ? ' is-over' : ''}`}
					ref={setPoolNodeRef}
				>
					<div className="student-exam-matching-pool-title">Răspunsuri disponibile</div>
					<div className="student-exam-matching-pool-list">
						{poolItems.length === 0 ? (
							<span className="student-exam-matching-pool-empty">Toate răspunsurile sunt plasate.</span>
						) : null}
						{poolItems.map((item) => (
							<MatchingChip
								key={item.id}
								id={`matching-chip-${item.id}`}
								text={item.text}
								disabled={disabled}
							/>
						))}
					</div>
				</div>
			</div>
		</DndContext>
	);
}

const StructuredQuestionRenderer = ({ question, value, onChange, disabled = false }) => {
	if (question?.type === 'matching' && question?.matching) {
		return <MatchingQuestion question={question} value={value} onChange={onChange} disabled={disabled} />;
	}

	if (question?.type === 'ordering' && question?.ordering) {
		return <OrderingQuestion question={question} value={value} onChange={onChange} disabled={disabled} />;
	}

	return null;
};

export default StructuredQuestionRenderer;
