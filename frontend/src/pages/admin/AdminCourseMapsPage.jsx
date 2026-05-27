import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { MagnifyingGlass, PencilSimple, Plus, Trash } from '@phosphor-icons/react';
import { DragGripIcon } from '../../components/common/DragGripIcon';
import { adminService } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import ConfirmModal from '../../components/common/ConfirmModal';
import { useAuth } from '../../contexts/AuthContext';
import { mapFolderCardImageUrl, toImageUrl } from '../../utils/imageUrl';
import CourseMapFolderTile from '../../components/ui/CourseMapFolderTile';
import { normalizeColorInputToHex } from '../../utils/color';

const COURSE_MAP_ACCENT_COLORS = [
	'#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#8b5cf6', '#06b6d4', '#84cc16', '#f43f5e', '#0ea5e9'
];

function sortableMapId(mapId) {
	return `admin-course-map-${mapId}`;
}

function isRealMapId(id) {
	return id !== 'unassigned' && id != null;
}

function SortableAdminMapShowcase({
	map,
	index,
	canMutate,
	onOpenMap,
	onEdit,
	onDelete,
}) {
	const sid = sortableMapId(map.id);
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id: sid,
		disabled: !canMutate || !isRealMapId(map.id),
	});
	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.9 : 1,
		zIndex: isDragging ? 2 : undefined,
	};
	const accentColor = map.accent_color || COURSE_MAP_ACCENT_COLORS[index % COURSE_MAP_ACCENT_COLORS.length];
	const courseCount = map.courses_count ?? map.courses?.length ?? 0;
	const summary = map.description || `${courseCount} cursuri`;
	const subtitle =
		map.description && map.description.length > 120 ? `${map.description.slice(0, 120)}…` : summary;

	const dragHandle =
		canMutate && isRealMapId(map.id) ? (
			<span
				className="course-showcase-dnd-handle va-card-icon-btn"
				{...attributes}
				{...listeners}
				aria-label="Trage pentru a reordona mapa"
				title="Reordonare"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) => {
					e.stopPropagation();
					if (e.key === 'Enter' || e.key === ' ') e.preventDefault();
				}}
			>
				<DragGripIcon size={14} />
			</span>
		) : null;

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={`admin-course-map-showcase-wrap${canMutate && isRealMapId(map.id) ? ' admin-course-map-showcase-wrap--sortable' : ''}`}
		>
			<CourseMapFolderTile
				title={map.name || '—'}
				subtitle={subtitle}
				count={courseCount}
				color={accentColor}
				imageUrl={mapFolderCardImageUrl(map)}
				onOpen={() => onOpenMap(map)}
				ctaLabel="Deschide mapa"
				topLeftSlot={dragHandle}
				topRightSlot={
					canMutate ? (
						<>
							<div className="admin-course-map-footer-actions" onClick={(e) => e.stopPropagation()}>
								<button type="button" className="admin-course-map-edit-btn va-card-icon-btn" onClick={(e) => { e.stopPropagation(); onEdit(map); }} aria-label="Editează mapa">
									<PencilSimple size={16} weight="bold" aria-hidden />
								</button>
							</div>
							<span
								role="button"
								tabIndex={0}
								className="admin-course-map-delete-btn va-card-icon-btn va-card-icon-btn--danger"
								onClick={(e) => {
									e.stopPropagation();
									onDelete(map);
								}}
								onKeyDown={(e) => {
									if (e.key === 'Enter' || e.key === ' ') {
										e.preventDefault();
										onDelete(map);
									}
								}}
								aria-label="Șterge mapa"
							>
								<Trash size={18} weight="bold" aria-hidden />
							</span>
						</>
					) : null
				}
			/>
		</div>
	);
}

function StaticAdminMapShowcase({ map, index, canMutate, onOpenMap, onEdit, onDelete }) {
	const accentColor = map.accent_color || COURSE_MAP_ACCENT_COLORS[index % COURSE_MAP_ACCENT_COLORS.length];
	const courseCount = map.courses_count ?? map.courses?.length ?? 0;
	const summary = map.description || `${courseCount} cursuri`;
	const subtitle =
		map.description && map.description.length > 120 ? `${map.description.slice(0, 120)}…` : summary;
	return (
		<div className="admin-course-map-showcase-wrap">
			<CourseMapFolderTile
				title={map.name || '—'}
				subtitle={subtitle}
				count={courseCount}
				color={accentColor}
				imageUrl={mapFolderCardImageUrl(map)}
				onOpen={() => onOpenMap(map)}
				ctaLabel="Deschide mapa"
				topRightSlot={
					canMutate ? (
						<>
							<div className="admin-course-map-footer-actions" onClick={(e) => e.stopPropagation()}>
								<button type="button" className="admin-course-map-edit-btn va-card-icon-btn" onClick={(e) => { e.stopPropagation(); onEdit(map); }} aria-label="Editează mapa">
									<PencilSimple size={16} weight="bold" aria-hidden />
								</button>
							</div>
							<span
								role="button"
								tabIndex={0}
								className="admin-course-map-delete-btn va-card-icon-btn va-card-icon-btn--danger"
								onClick={(e) => {
									e.stopPropagation();
									onDelete(map);
								}}
								onKeyDown={(e) => {
									if (e.key === 'Enter' || e.key === ' ') {
										e.preventDefault();
										onDelete(map);
									}
								}}
								aria-label="Șterge mapa"
							>
								<Trash size={18} weight="bold" aria-hidden />
							</span>
						</>
					) : null
				}
			/>
		</div>
	);
}

const AdminCourseMapsPage = ({ embedded, onOpenMap, autoOpenCreate = false, headerActions = null }) => {
	const navigate = useNavigate();
	const { showToast } = useToast();
	const { canMutateInAdminArea, user } = useAuth();
	const isAdmin = (user?.actualRole ?? user?.role) === 'admin';
	const [maps, setMaps] = useState([]);
	const [loading, setLoading] = useState(true);
	const [searchQuery, setSearchQuery] = useState('');
	const [showCreateModal, setShowCreateModal] = useState(false);
	const [editingMap, setEditingMap] = useState(null);
	const [managingMap, setManagingMap] = useState(null);
	const [allCourses, setAllCourses] = useState([]);
	const [formName, setFormName] = useState('');
	const [formDescription, setFormDescription] = useState('');
	const [addCourseIds, setAddCourseIds] = useState([]);
	const [deleteConfirmMap, setDeleteConfirmMap] = useState(null);
	const [deleteLoading, setDeleteLoading] = useState(false);
	const [formAccent, setFormAccent] = useState(COURSE_MAP_ACCENT_COLORS[0]);
	const [formVisibility, setFormVisibility] = useState('public');
	const [coverBusy, setCoverBusy] = useState(false);
	const [pendingMapCoverFile, setPendingMapCoverFile] = useState(null);
	const [pendingMapCoverPreviewUrl, setPendingMapCoverPreviewUrl] = useState(null);
	const mapColorInputRef = useRef(null);
	const mapCoverInputRef = useRef(null);
	const [orderedMaps, setOrderedMaps] = useState([]);
	const openMapColorPicker = () => mapColorInputRef.current?.click();
	const openMapCoverPicker = () => mapCoverInputRef.current?.click();

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
	);

	const fetchMaps = useCallback(async () => {
		try {
			setLoading(true);
			const res = await adminService.getCourseMaps({
				search: searchQuery || undefined,
				per_page: 200,
				include_virtual: 1,
			});
			const list = res?.data ?? (Array.isArray(res) ? res : []);
			const arr = Array.isArray(list) ? list : [];
			setMaps(arr);
			setOrderedMaps(arr.filter((m) => m && isRealMapId(m.id)));
		} catch (err) {
			console.error('Error fetching course maps:', err);
			showToast('Nu s-au putut încărca mapele de curs', 'error');
			setMaps([]);
			setOrderedMaps([]);
		} finally {
			setLoading(false);
		}
	}, [searchQuery, showToast]);

	useEffect(() => {
		fetchMaps();
	}, [fetchMaps]);

	useEffect(() => {
		if (autoOpenCreate && canMutateInAdminArea) {
			openCreate();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [autoOpenCreate, canMutateInAdminArea]);

	useEffect(() => {
		if (!pendingMapCoverFile) {
			setPendingMapCoverPreviewUrl(null);
			return undefined;
		}
		const url = URL.createObjectURL(pendingMapCoverFile);
		setPendingMapCoverPreviewUrl(url);
		return () => URL.revokeObjectURL(url);
	}, [pendingMapCoverFile]);

	const fetchCourses = useCallback(async () => {
		try {
			const data = await adminService.getCourses({ per_page: 500 });
			setAllCourses(Array.isArray(data) ? data : (data?.data ?? []));
		} catch (e) {
			setAllCourses([]);
		}
	}, []);

	const closeCreateModal = useCallback(() => {
		setShowCreateModal(false);
		setPendingMapCoverFile(null);
		setPendingMapCoverPreviewUrl(null);
		setCoverBusy(false);
	}, []);

	const openCreate = () => {
		setEditingMap(null);
		setFormName('');
		setFormDescription('');
		setFormAccent(COURSE_MAP_ACCENT_COLORS[0]);
		setFormVisibility('public');
		setPendingMapCoverFile(null);
		setPendingMapCoverPreviewUrl(null);
		setCoverBusy(false);
		setShowCreateModal(true);
	};

	const openEdit = async (map) => {
		try {
			const full = await adminService.getCourseMap(map.id);
			setEditingMap(full);
			setFormName(full.name || '');
			setFormDescription(full.description || '');
			setFormAccent(full.accent_color || COURSE_MAP_ACCENT_COLORS[0]);
			setPendingMapCoverFile(null);
			setPendingMapCoverPreviewUrl(null);
			setCoverBusy(false);
			setAddCourseIds([]);
			fetchCourses();
			setShowCreateModal(true);
		} catch (err) {
			showToast('Nu s-a putut încărca mapa', 'error');
		}
	};

	const saveMap = async () => {
		const name = (formName || '').trim();
		if (!name) {
			showToast('Numele mapei este obligatoriu', 'error');
			return;
		}
		const normalizedAccent = normalizeColorInputToHex(formAccent, COURSE_MAP_ACCENT_COLORS[0]);
		const payload = { name, description: formDescription || null, accent_color: normalizedAccent };
		if (!editingMap && isAdmin) {
			payload.visibility = formVisibility === 'private' ? 'private' : 'public';
		}
		try {
			if (editingMap) {
				await adminService.updateCourseMap(editingMap.id, payload);
				showToast('Mapa a fost actualizată', 'success');
			} else {
				const created = await adminService.createCourseMap(payload);
				const createdId = created?.id ?? created?.data?.id ?? null;
				if (pendingMapCoverFile && createdId) {
					try {
						await adminService.uploadCourseMapCover(createdId, pendingMapCoverFile);
					} catch (coverErr) {
						console.warn('Map created but cover upload failed', coverErr);
						showToast('Mapa a fost creată, dar coperta nu s-a încărcat', 'error');
					}
				}
				showToast('Mapa a fost creată', 'success');
			}
			closeCreateModal();
			fetchMaps();
		} catch (err) {
			showToast(err?.response?.data?.message || 'Eroare la salvare', 'error');
		}
	};

	const coverPreviewSrc =
		pendingMapCoverPreviewUrl ||
		(editingMap ? toImageUrl(editingMap.cover_image_url) || editingMap.cover_image_url : null);
	const coverPreviewLabel = pendingMapCoverFile
		? 'Previzualizare nouă'
		: editingMap?.cover_image_url
			? 'Copertă curentă'
			: 'Fără copertă';

	const deleteMap = async (map) => {
		if (!map) return;
		setDeleteLoading(true);
		try {
			await adminService.deleteCourseMap(map.id);
			showToast('Mapa a fost ștearsă', 'success');
			setDeleteConfirmMap(null);
			if (managingMap?.id === map.id) setManagingMap(null);
			fetchMaps();
		} catch (err) {
			showToast(err?.response?.data?.message || 'Eroare la ștergere', 'error');
		} finally {
			setDeleteLoading(false);
		}
	};

	const handleConfirmDeleteMap = () => {
		if (deleteConfirmMap) deleteMap(deleteConfirmMap);
	};

	const openManage = async (map) => {
		try {
			const full = await adminService.getCourseMap(map.id);
			setManagingMap(full);
			setAddCourseIds([]);
			fetchCourses();
		} catch (err) {
			showToast('Nu s-a putut încărca mapa', 'error');
		}
	};

	const addCoursesToMap = async (fromEditModal = false) => {
		const mapContext = fromEditModal ? editingMap : managingMap;
		if (!mapContext || addCourseIds.length === 0) return;
		try {
			await adminService.attachCoursesToMap(mapContext.id, addCourseIds);
			showToast('Cursurile au fost adăugate', 'success');
			setAddCourseIds([]);
			const updated = await adminService.getCourseMap(mapContext.id);
			if (fromEditModal) setEditingMap(updated);
			else setManagingMap(updated);
			fetchMaps();
		} catch (err) {
			showToast('Eroare la adăugare cursuri', 'error');
		}
	};

	const removeCourseFromMap = async (courseId, fromEditModal = false) => {
		const mapContext = fromEditModal ? editingMap : managingMap;
		if (!mapContext) return;
		try {
			await adminService.detachCourseFromMap(mapContext.id, courseId);
			const updated = await adminService.getCourseMap(mapContext.id);
			if (fromEditModal) setEditingMap(updated);
			else setManagingMap(updated);
			fetchMaps();
		} catch (err) {
			showToast('Eroare la scoaterea cursului', 'error');
		}
	};

	const inMapIds = (managingMap?.courses || []).map((c) => c.id);
	const availableCourses = allCourses.filter((c) => !inMapIds.includes(c.id));
	const editMapCourseIds = (editingMap?.courses || []).map((c) => c.id);
	const availableCoursesForEdit = allCourses.filter((c) => !editMapCourseIds.includes(c.id));

	const handleOpenMapCourses = (map) => {
		if (onOpenMap) {
			onOpenMap(map);
			return;
		}
		navigate(`/admin/maps/${map.id}`);
	};

	const mapsDndEnabled = canMutateInAdminArea && !searchQuery.trim();

	const handleMapsDragEnd = async (event) => {
		if (!mapsDndEnabled) return;
		const { active, over } = event;
		if (!over || active.id === over.id) return;
		const sortableRows = orderedMaps.filter((m) => isRealMapId(m.id));
		const oldIndex = sortableRows.findIndex((m) => sortableMapId(m.id) === active.id);
		const newIndex = sortableRows.findIndex((m) => sortableMapId(m.id) === over.id);
		if (oldIndex < 0 || newIndex < 0) return;
		const next = arrayMove(sortableRows, oldIndex, newIndex);
		setOrderedMaps(next);
		try {
			await adminService.reorderCourseMaps(next.map((m) => m.id));
			setMaps(next);
			showToast('Ordinea mapelor a fost salvată', 'success');
		} catch (err) {
			showToast(err?.response?.data?.message || 'Nu s-a putut salva ordinea', 'error');
			setOrderedMaps((Array.isArray(maps) ? maps : []).filter((m) => m && isRealMapId(m.id)));
		}
	};

	return (
		<div className="admin-container">
			<div className="admin-courses-page-header">
				<div className="admin-courses-header-content">
					<div className="admin-courses-header-text">
						<h1 className="admin-courses-title">Mape curs</h1>
						<p className="admin-courses-subtitle">
							Grupează cursuri în mape (foldere) pentru organizare
						</p>
					</div>
					{canMutateInAdminArea && (
					<div className="admin-courses-header-actions">
						{headerActions}
						<button type="button" className="admin-btn-create-course" onClick={openCreate}>
							<Plus size={18} weight="bold" aria-hidden />
							Creează mapă
						</button>
					</div>
					)}
				</div>
				<div className="admin-courses-toolbar">
					<div className="admin-courses-search-wrapper">
						<div className="admin-courses-search">
							<MagnifyingGlass size={18} weight="regular" aria-hidden />
							<input
								type="text"
								placeholder="Caută mape..."
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								className="admin-courses-search-input"
								aria-label="Caută mape de curs"
							/>
						</div>
					</div>
				</div>
			</div>

			{searchQuery.trim() ? (
				<p className="admin-course-maps-dnd-hint">Golirea căutării activează reordonarea cu drag and drop.</p>
			) : null}

			{loading && maps.length === 0 ? (
				<div className="admin-courses-loading">
					<div className="va-spinner va-spinner-lg"></div>
					<p>Se încarcă mapele...</p>
				</div>
			) : maps.length === 0 ? (
				<div className="lms-empty-state">
					<p>Nu există mape de curs. Creează una pentru a grupa cursuri.</p>
					{canMutateInAdminArea && (
					<button type="button" className="lms-btn-primary" onClick={openCreate}>
						+ Creează prima mapă
					</button>
					)}
				</div>
			) : mapsDndEnabled ? (
				<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleMapsDragEnd}>
					<SortableContext
						items={orderedMaps.filter((m) => isRealMapId(m.id)).map((m) => sortableMapId(m.id))}
						strategy={rectSortingStrategy}
					>
						<div className="admin-courses-grid admin-courses-grid-maps">
							<div className="admin-courses-grid-container admin-courses-grid-container-maps">
								{orderedMaps.map((map, index) => (
									<SortableAdminMapShowcase
										key={map.id}
										map={map}
										index={index}
										canMutate={canMutateInAdminArea}
										onOpenMap={handleOpenMapCourses}
										onEdit={openEdit}
										onDelete={setDeleteConfirmMap}
									/>
								))}
							</div>
						</div>
					</SortableContext>
				</DndContext>
			) : (
				<div className="admin-courses-grid admin-courses-grid-maps">
					<div className="admin-courses-grid-container admin-courses-grid-container-maps">
						{maps.map((map, index) => (
							<StaticAdminMapShowcase
								key={map.id}
								map={map}
								index={index}
								canMutate={canMutateInAdminArea}
								onOpenMap={handleOpenMapCourses}
								onEdit={openEdit}
								onDelete={setDeleteConfirmMap}
							/>
						))}
					</div>
				</div>
			)}

			{/* Create/Edit modal – standard LMS: secțiuni clare, selector cursuri cu checkbox */}
			{showCreateModal && canMutateInAdminArea && (
				<div className="admin-modal-overlay" onClick={closeCreateModal}>
					<div className={`admin-modal admin-modal-create admin-course-map-modal ${editingMap ? 'admin-modal-lg' : ''}`} onClick={(e) => e.stopPropagation()}>
						<h2 className="admin-modal-title">{editingMap ? 'Editează mapa' : 'Mapă nouă'}</h2>
						<div className="admin-modal-body">
							<section className="admin-form-section admin-course-map-basic-section">
								<h3 className="admin-form-section-title">Informații de bază</h3>
								<label className="admin-form-label" htmlFor="course-map-name">Nume</label>
								<input
									id="course-map-name"
									type="text"
									className="admin-form-input"
									value={formName}
									onChange={(e) => setFormName(e.target.value)}
									placeholder="Titlul hărții de cursuri"
									aria-required="true"
								/>
								<label className="admin-form-label" htmlFor="course-map-desc">Descriere (opțional)</label>
								<textarea
									id="course-map-desc"
									className="admin-form-input"
									value={formDescription}
									onChange={(e) => setFormDescription(e.target.value)}
									placeholder="Descriere scurtă pentru studenți..."
									rows={3}
								/>
								<p className="admin-form-hint">Cursurile din mapă vor apărea grupat pentru studenți.</p>
								{!editingMap && isAdmin ? (
									<fieldset className="admin-course-map-visibility-fieldset">
										<legend className="admin-form-label">Vizibilitate</legend>
										<div className="admin-course-map-visibility-options">
											<label className="admin-course-map-visibility-option">
												<input
													type="radio"
													name="course-map-visibility"
													value="public"
													checked={formVisibility === 'public'}
													onChange={() => setFormVisibility('public')}
												/>
												<span>
													<strong>Publică</strong>
													<small>Vizibilă studenților în lista de mape</small>
												</span>
											</label>
											<label className="admin-course-map-visibility-option">
												<input
													type="radio"
													name="course-map-visibility"
													value="private"
													checked={formVisibility === 'private'}
													onChange={() => setFormVisibility('private')}
												/>
												<span>
													<strong>Privată</strong>
													<small>Doar în zona admin; studenții nu o văd</small>
												</span>
											</label>
										</div>
									</fieldset>
								) : null}
							</section>

							<section className="admin-form-section admin-course-map-style-section" aria-label="Aspect mapă">
								<h3 className="admin-form-section-title">Aspect</h3>
								<label className="admin-form-label">Culoare accent</label>
								<div
									className="admin-course-map-palette-preview"
									role="button"
									tabIndex={0}
									aria-label="Deschide selectorul de culori"
									title="Deschide selectorul de culori"
									style={{ cursor: 'pointer' }}
									onClick={openMapColorPicker}
									onKeyDown={(e) => {
										if (e.key === 'Enter' || e.key === ' ') {
											e.preventDefault();
											openMapColorPicker();
										}
									}}
								>
									<span
										className="admin-course-map-palette-preview-swatch"
										style={{ '--swatch-color': normalizeColorInputToHex(formAccent, COURSE_MAP_ACCENT_COLORS[0]) }}
										aria-hidden="true"
									/>
									<span className="admin-course-map-palette-preview-label">
										{normalizeColorInputToHex(formAccent, COURSE_MAP_ACCENT_COLORS[0])}
									</span>
								</div>
								<div className="admin-course-map-color-control">
									<input
										ref={mapColorInputRef}
										type="color"
										className="admin-course-map-color-input-native"
										value={normalizeColorInputToHex(formAccent, COURSE_MAP_ACCENT_COLORS[0])}
										onChange={(e) => setFormAccent(e.target.value)}
										aria-label="Alege culoarea accentului"
									/>
									<input
										type="text"
										className="admin-form-input admin-course-map-color-input"
										value={formAccent}
										onChange={(e) => setFormAccent(e.target.value)}
										placeholder="#6366f1"
										aria-label="Culoare accent în hex"
									/>
								</div>

								{!editingMap ? (
									<>
										<div className="admin-course-map-cover-card">
											<div className="admin-course-map-cover-thumb">
												{coverPreviewSrc ? (
													<img src={coverPreviewSrc} alt="" className="admin-course-map-cover-thumb-img" />
												) : (
													<div className="admin-course-map-cover-thumb-placeholder">
														<span>Fără copertă</span>
													</div>
												)}
											</div>
											<div className="admin-course-map-cover-copy">
												<div className="admin-course-map-cover-copy-head">
													<label className="admin-form-label" htmlFor="course-map-cover-create">Copertă mapă (opțional)</label>
													<span className="admin-course-map-cover-chip">{coverPreviewLabel}</span>
												</div>
												<p className="admin-form-hint" style={{ margin: 0 }}>
													Recomandat 16:9, max. 4MB. Vezi imediat miniatura înainte de salvare.
												</p>
												<div className="admin-course-map-cover-actions">
													<button
														type="button"
														className="admin-course-map-cover-button"
														onClick={openMapCoverPicker}
													>
														Alege imaginea
													</button>
													{pendingMapCoverFile ? (
														<button
															type="button"
															className="admin-course-map-cover-button admin-course-map-cover-button--ghost"
															onClick={() => setPendingMapCoverFile(null)}
														>
															Renunță
														</button>
													) : null}
												</div>
												<input
													ref={mapCoverInputRef}
													id="course-map-cover-create"
													type="file"
													accept="image/jpeg,image/png,image/gif,image/webp"
													onChange={(e) => {
														const file = e.target.files?.[0];
														e.target.value = '';
														setPendingMapCoverFile(file || null);
													}}
													className="admin-course-map-cover-input"
													hidden
												/>
											</div>
										</div>
									</>
								) : (
									<>
										<div className="admin-course-map-cover-card">
											<div className="admin-course-map-cover-thumb">
												{coverPreviewSrc ? (
													<img src={coverPreviewSrc} alt="" className="admin-course-map-cover-thumb-img" />
												) : (
													<div className="admin-course-map-cover-thumb-placeholder">
														<span>Fără copertă</span>
													</div>
												)}
											</div>
											<div className="admin-course-map-cover-copy">
												<div className="admin-course-map-cover-copy-head">
													<label className="admin-form-label" htmlFor="course-map-cover">Copertă mapă</label>
													<span className="admin-course-map-cover-chip">{coverPreviewLabel}</span>
												</div>
												<p className="admin-form-hint" style={{ margin: 0 }}>
													Recomandat 16:9, max. 4MB. Schimbarea se aplică imediat după selectare.
												</p>
												<div className="admin-course-map-cover-actions">
													<button
														type="button"
														className="admin-course-map-cover-button"
														onClick={openMapCoverPicker}
														disabled={coverBusy}
													>
														{coverBusy ? 'Se încarcă...' : 'Încarcă altă imagine'}
													</button>
													{editingMap?.cover_image_url ? (
														<button
															type="button"
															className="admin-course-map-cover-button admin-course-map-cover-button--ghost"
															disabled={coverBusy}
															onClick={async () => {
																setCoverBusy(true);
																try {
																	const updated = await adminService.deleteCourseMapCover(editingMap.id);
																	setEditingMap(updated);
																	showToast('Coperta a fost eliminată', 'success');
																	fetchMaps();
																} catch (err) {
																	showToast(err?.response?.data?.message || 'Eroare', 'error');
																} finally {
																	setCoverBusy(false);
																}
															}}
														>
															Șterge coperta
														</button>
													) : null}
												</div>
												<input
													ref={mapCoverInputRef}
													id="course-map-cover"
													type="file"
													accept="image/jpeg,image/png,image/gif,image/webp"
													disabled={coverBusy}
													onChange={async (e) => {
														const file = e.target.files?.[0];
														e.target.value = '';
														if (!file || !editingMap) return;
														setPendingMapCoverFile(file);
														setCoverBusy(true);
														try {
															const updated = await adminService.uploadCourseMapCover(editingMap.id, file);
															setEditingMap(updated);
															showToast('Coperta a fost încărcată', 'success');
															fetchMaps();
														} catch (err) {
															showToast(err?.response?.data?.message || 'Eroare la încărcarea copertei', 'error');
														} finally {
															setCoverBusy(false);
															setPendingMapCoverFile(null);
														}
													}}
													className="admin-course-map-cover-input"
													hidden
												/>
											</div>
										</div>
									</>
								)}
							</section>

							{editingMap && (
								<section className="admin-form-section admin-course-map-courses-section" aria-label="Cursuri în mapă">
									<h3 className="admin-form-section-title">Cursuri în mapă</h3>
									<div className="admin-course-map-courses-list">
										{(editingMap.courses || []).length === 0 ? (
											<p className="admin-text-muted">Niciun curs în această mapă. Selectează cursuri mai jos și apasă Adaugă.</p>
										) : (
											<ul className="admin-course-map-current-list">
												{(editingMap.courses || []).map((c) => (
													<li key={c.id} className="admin-course-map-current-item">
														<span>{c.title}</span>
														<button
															type="button"
															className="admin-course-map-remove-btn"
															onClick={() => removeCourseFromMap(c.id, true)}
															aria-label={`Scoate ${c.title} din mapă`}
														>
															Scoate
														</button>
													</li>
												))}
											</ul>
										)}
									</div>
									<label className="admin-form-label">Adaugă cursuri la mapă</label>
									<div className="admin-course-map-picker" role="group" aria-label="Selectează cursuri de adăugat">
										{availableCoursesForEdit.length === 0 ? (
											<p className="admin-text-muted">Toate cursurile sunt deja în mapă sau nu există cursuri disponibile.</p>
										) : (
											<ul className="admin-course-map-checkbox-list">
												{availableCoursesForEdit.map((c) => (
													<li key={c.id} className="admin-course-map-checkbox-item">
														<label className="admin-checkbox-label">
															<input
																type="checkbox"
																checked={addCourseIds.includes(c.id)}
																onChange={(e) => {
																	if (e.target.checked) {
																		setAddCourseIds((prev) => [...prev, c.id]);
																	} else {
																		setAddCourseIds((prev) => prev.filter((id) => id !== c.id));
																	}
																}}
															/>
															<span>{c.title}</span>
														</label>
													</li>
												))}
											</ul>
										)}
									</div>
									<button
										type="button"
										className="lms-btn-primary lms-btn-sm"
										onClick={() => addCoursesToMap(true)}
										disabled={addCourseIds.length === 0}
									>
										Adaugă cursurile selectate {addCourseIds.length > 0 && `(${addCourseIds.length})`}
									</button>
								</section>
							)}
						</div>
						<div className="admin-modal-actions">
							<button type="button" className="lms-btn-secondary" onClick={closeCreateModal}>
								Anulare
							</button>
							<button type="button" className="lms-btn-primary" onClick={saveMap} disabled={!formName?.trim()}>
								{editingMap ? 'Salvează' : 'Creează'}
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Manage courses modal */}
			{managingMap && canMutateInAdminArea && (
				<div className="admin-modal-overlay" onClick={() => setManagingMap(null)}>
					<div className="admin-modal admin-modal-create admin-modal-lg" onClick={(e) => e.stopPropagation()}>
						<h2 className="admin-modal-title">Cursuri în „{managingMap.name}”</h2>
						<div className="admin-modal-body">
							<section className="admin-form-section" aria-label="Cursuri în mapă">
								<h3 className="admin-form-section-title">Cursuri curente</h3>
								<div className="admin-course-map-courses-list">
									{(managingMap.courses || []).length === 0 ? (
										<p className="admin-text-muted">Niciun curs în această mapă. Selectează cursuri mai jos și apasă Adaugă.</p>
									) : (
										<ul className="admin-course-map-current-list">
											{(managingMap.courses || []).map((c) => (
												<li key={c.id} className="admin-course-map-current-item">
													<span>{c.title}</span>
													<button
														type="button"
														className="admin-course-map-remove-btn"
														onClick={() => removeCourseFromMap(c.id)}
														aria-label={`Scoate ${c.title} din mapă`}
													>
														Scoate
													</button>
												</li>
											))}
										</ul>
									)}
								</div>
								<label className="admin-form-label">Adaugă cursuri</label>
								<div className="admin-course-map-picker" role="group" aria-label="Selectează cursuri de adăugat">
									{availableCourses.length === 0 ? (
										<p className="admin-text-muted">Toate cursurile sunt deja în mapă.</p>
									) : (
										<ul className="admin-course-map-checkbox-list">
											{availableCourses.map((c) => (
												<li key={c.id} className="admin-course-map-checkbox-item">
													<label className="admin-checkbox-label">
														<input
															type="checkbox"
															checked={addCourseIds.includes(c.id)}
															onChange={(e) => {
																if (e.target.checked) {
																	setAddCourseIds((prev) => [...prev, c.id]);
																} else {
																	setAddCourseIds((prev) => prev.filter((id) => id !== c.id));
																}
															}}
														/>
														<span>{c.title}</span>
													</label>
												</li>
											))}
										</ul>
									)}
								</div>
								<button
									type="button"
									className="lms-btn-primary lms-btn-sm"
									onClick={addCoursesToMap}
									disabled={addCourseIds.length === 0}
								>
									Adaugă cursurile selectate {addCourseIds.length > 0 && `(${addCourseIds.length})`}
								</button>
							</section>
						</div>
						<div className="admin-modal-actions">
							<button type="button" className="lms-btn-primary" onClick={() => setManagingMap(null)}>
								Închide
							</button>
						</div>
					</div>
				</div>
			)}

			<ConfirmModal
				open={!!deleteConfirmMap}
				onClose={() => setDeleteConfirmMap(null)}
				onConfirm={handleConfirmDeleteMap}
				title="Șterge mapa"
				message={deleteConfirmMap ? `Ștergi mapa „${deleteConfirmMap.name}”? Cursurile nu sunt șterse, doar gruparea.` : ''}
				confirmLabel="Șterge"
				cancelLabel="Anulare"
				variant="danger"
				loading={deleteLoading}
			/>
		</div>
	);
};

export default AdminCourseMapsPage;
