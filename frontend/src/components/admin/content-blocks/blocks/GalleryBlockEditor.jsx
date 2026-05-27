import React, { useState } from 'react';
import {
	DndContext,
	closestCenter,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from '@dnd-kit/core';
import {
	arrayMove,
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import MediaUploader from '../../media/MediaUploader';
import MediaLibraryModal from '../../media/MediaLibraryModal';
import { toImageUrl } from '../../../../utils/imageUrl';
import { DragGripIcon } from '../../../common/DragGripIcon';

const SortableGalleryItem = ({ item, index, onRemove }) => {
	const stableId = item.id || `gallery-img-${index}`;
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id: stableId,
	});

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.6 : 1,
	};

	return (
		<div
			ref={setNodeRef}
			style={{ ...style, position: 'relative', overflow: 'hidden' }}
			className="admin-card"
		>
			<div
				className="admin-module-card-drag-handle"
				{...attributes}
				{...listeners}
				style={{
					position: 'absolute',
					top: 8,
					left: 8,
					zIndex: 2,
					cursor: 'grab',
					background: 'rgba(0,0,0,0.5)',
					color: '#fff',
					padding: '4px 8px',
					borderRadius: 6,
					fontSize: 12,
				}}
				title="Trage pentru reordonare"
			>
				<DragGripIcon size={12} />
			</div>
			<button
				type="button"
				className="lms-btn-icon va-btn-danger"
				style={{
					position: 'absolute',
					top: 8,
					right: 8,
					zIndex: 2,
				}}
				title="Elimină imagine"
				onClick={(e) => {
					e.stopPropagation();
					onRemove(index);
				}}
			>
				🗑️
			</button>
			<div style={{ aspectRatio: '1', overflow: 'hidden', borderRadius: 8 }}>
				<img
					src={toImageUrl(item.url) || item.url || ''}
					alt={item.alt || ''}
					style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
					loading="lazy"
				/>
			</div>
		</div>
	);
};

const GalleryBlockEditor = ({ courseId, block, onChange }) => {
	const [libraryOpen, setLibraryOpen] = useState(false);

	const images = Array.isArray(block?.metadata?.images) ? block.metadata.images : [];

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
	);

	const updateImages = (nextImages) => {
		const withIds = nextImages.map((img, i) => ({
			...img,
			id: img.id || `gallery-img-${Date.now()}-${i}`,
		}));
		onChange({
			metadata: { ...(block?.metadata || {}), images: withIds },
		});
	};

	const addImage = (url, asset = null) => {
		if (!url) return;
		const newItem = {
			id: `img-${Date.now()}-${Math.random().toString(36).slice(2)}`,
			url,
			alt: asset?.original_filename || '',
			caption: '',
		};
		updateImages([...images, newItem]);
	};

	const removeImage = (index) => {
		const next = images.filter((_, i) => i !== index);
		updateImages(next);
	};

	const handleDragEnd = (event) => {
		const { active, over } = event;
		if (!over?.id || active.id === over.id) return;
		const oldIndex = images.findIndex((img, i) => (img.id || `gallery-img-${i}`) === active.id);
		const newIndex = images.findIndex((img, i) => (img.id || `gallery-img-${i}`) === over.id);
		if (oldIndex === -1 || newIndex === -1) return;
		const next = arrayMove(images, oldIndex, newIndex);
		updateImages(next);
	};

	const itemIds = images.map((img, i) => img.id || `gallery-img-${i}`);

	return (
		<div style={{ display: 'grid', gap: 'var(--space-4)' }}>
			<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
				<div className="admin-settings-hint" style={{ margin: 0 }}>
					Adaugă imagini, reordonează-le prin tragere. Încarcă sau alege din biblioteca media.
				</div>
				<button
					type="button"
					className="admin-btn admin-btn-secondary"
					onClick={() => setLibraryOpen(true)}
				>
					Bibliotecă
				</button>
			</div>

			<MediaUploader
				courseId={courseId}
				accept="image/*"
				suggestedType="image"
				onUploaded={(res) => {
					const url = res?.url;
					if (url) addImage(url, res);
				}}
			/>

			{images.length > 0 ? (
				<DndContext
					sensors={sensors}
					collisionDetection={closestCenter}
					onDragEnd={handleDragEnd}
				>
					<SortableContext items={itemIds} strategy={rectSortingStrategy}>
						<div
							style={{
								display: 'grid',
								gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
								gap: 'var(--space-3)',
							}}
						>
							{images.map((item, index) => (
								<SortableGalleryItem
									key={item.id || `gallery-img-${index}`}
									item={item}
									index={index}
									onRemove={removeImage}
								/>
							))}
						</div>
					</SortableContext>
				</DndContext>
			) : (
				<div
					style={{
						padding: 'var(--space-8)',
						textAlign: 'center',
						color: 'var(--text-tertiary)',
						border: '1px dashed var(--border-primary)',
						borderRadius: 12,
					}}
				>
					Nicio imagine. Încarcă sau alege din bibliotecă.
				</div>
			)}

			<MediaLibraryModal
				open={libraryOpen}
				onClose={() => setLibraryOpen(false)}
				courseId={courseId}
				type="image"
				onSelect={(url, asset) => {
					addImage(url, asset);
					setLibraryOpen(false);
				}}
			/>
		</div>
	);
};

export default GalleryBlockEditor;
