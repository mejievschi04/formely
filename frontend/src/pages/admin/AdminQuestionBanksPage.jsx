import React, { useCallback, useEffect, useState } from 'react';
import {
  Archive,
  FolderPlus,
  Folders,
  ListChecks,
  RefreshCcw,
  Search,
} from 'lucide-react';
import Modal from '../../components/common/Modal';
import { adminService } from '../../services/api';

import { useToast } from '../../contexts/ToastContextShared.js';
import FolderCard from '../../components/admin/question-banks/FolderCard';
import QuestionCatalogByMap from '../../components/admin/question-banks/QuestionCatalogByMap';

import { useAuth } from '../../contexts/AuthContextShared.js';
import './AdminQuestionBanksPage.css';

const AdminQuestionBanksPage = ({ embedded = false }) => {
  const { canMutateInAdminArea } = useAuth();
  const { success, error } = useToast();
  const [hubTab, setHubTab] = useState('catalog');
  const [loading, setLoading] = useState(false);
  const [folders, setFolders] = useState([]);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ title: '', description: '' });
  const [createLoading, setCreateLoading] = useState(false);
  const [catalogTick, setCatalogTick] = useState(0);

  const fetchFolders = useCallback(async (query = '') => {
    setLoading(true);
    try {
      const normalizedQuery = String(query || '').trim();
      const data = await adminService.getQuestionBanks(normalizedQuery ? { search: normalizedQuery } : {});
      setFolders(Array.isArray(data) ? data : []);
    } catch {
      error('Nu am putut încărca folderele.');
    } finally {
      setLoading(false);
    }
  }, [error]);

  const loadFolders = useCallback(() => fetchFolders(search), [fetchFolders, search]);

  useEffect(() => {
    fetchFolders('');
  }, [fetchFolders]);

  useEffect(() => {
    const id = setTimeout(() => fetchFolders(search), 250);
    return () => clearTimeout(id);
  }, [fetchFolders, search]);

  const totalFolderQuestions = folders.reduce((sum, folder) => sum + (Number(folder?.questions_count) || 0), 0);
  const totalStarredQuestions = folders.reduce((sum, folder) => sum + (Number(folder?.starred_questions_count) || 0), 0);

  const createFolder = async () => {
    if (!createForm.title.trim()) {
      error('Numele folderului este obligatoriu.');
      return;
    }
    setCreateLoading(true);
    try {
      await adminService.createQuestionBank({
        title: createForm.title.trim(),
        description: createForm.description.trim() || null,
      });
      success('Folder creat.');
      setCreateOpen(false);
      setCreateForm({ title: '', description: '' });
      await loadFolders();
    } catch (e) {
      error(e?.response?.data?.error || 'Nu am putut crea folderul.');
    } finally {
      setCreateLoading(false);
    }
  };

  const renderFolderContent = () => (
    <>
      <div className="qb-panel-header">
        <div className="qb-search-field">
          <Search size={18} aria-hidden />
          <label className="qb-sr-only" htmlFor="qb-folder-search">
            Caută foldere
          </label>
          <input
            id="qb-folder-search"
            className="admin-form-input qb-search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Caută folder"
          />
        </div>
        {canMutateInAdminArea ? (
          <button type="button" className="lms-btn-primary qb-action-button" onClick={() => setCreateOpen(true)}>
            <FolderPlus size={18} aria-hidden />
            Folder nou
          </button>
        ) : null}
      </div>

      <section className="qb-folder-list" aria-label="Lista folderelor">
        {loading ? (
          <div className="qb-catalog-loading qb-catalog-loading--inline">
            <span className="qb-spinner" aria-hidden />
            Se încarcă folderele...
          </div>
        ) : folders.length ? (
          folders.map((folder) => <FolderCard key={folder.id} folder={folder} />)
        ) : (
          <div className="qb-empty">
            <Archive size={30} aria-hidden />
            <p className="qb-empty-title">Nu există foldere pentru filtrul curent</p>
            <p className="qb-empty-hint">Creează un folder reutilizabil pentru întrebări.</p>
          </div>
        )}
      </section>
    </>
  );

  return (
    <div className={`qb-page qb-page-v2 ${embedded ? 'qb-page-embedded' : ''}`}>
      <div className="qb-shell">
        <header className="qb-page-hero">
          <div className="qb-page-hero-text">
            <p className="qb-page-eyebrow">Bibliotecă evaluare</p>
            <h1>Întrebări</h1>
            <p className="qb-page-lead">
              Catalogul grupează întrebările pe mape, apoi pe testele din cursurile fiecărei mape.
            </p>
          </div>
          <div className="qb-hero-actions">
            <button
              type="button"
              className={`qb-tab-button ${hubTab === 'catalog' ? 'is-active' : ''}`}
              onClick={() => setHubTab('catalog')}
            >
              <ListChecks size={18} aria-hidden />
              Catalog
            </button>
            <button
              type="button"
              className={`qb-tab-button ${hubTab === 'folders' ? 'is-active' : ''}`}
              onClick={() => setHubTab('folders')}
            >
              <Folders size={18} aria-hidden />
              Foldere
            </button>
          </div>
        </header>

        <section className="qb-overview-grid" aria-label="Rezumat întrebări">
          <div className="qb-overview-item">
            <Folders size={18} aria-hidden />
            <div>
              <strong>{loading ? '...' : folders.length}</strong>
              <span>foldere</span>
            </div>
          </div>
          <div className="qb-overview-item">
            <Archive size={18} aria-hidden />
            <div>
              <strong>{loading ? '...' : totalFolderQuestions}</strong>
              <span>întrebări în foldere</span>
            </div>
          </div>
          <div className="qb-overview-item">
            <ListChecks size={18} aria-hidden />
            <div>
              <strong>{totalStarredQuestions}</strong>
              <span>marcate cu stea</span>
            </div>
          </div>
          <button
            type="button"
            className="qb-overview-refresh"
            onClick={hubTab === 'folders' ? loadFolders : () => setCatalogTick((t) => t + 1)}
          >
            <RefreshCcw size={18} aria-hidden />
            Actualizează
          </button>
        </section>

        <main className="qb-workspace">
          {hubTab === 'folders' ? renderFolderContent() : <QuestionCatalogByMap key={catalogTick} />}
        </main>

        <Modal isOpen={createOpen && canMutateInAdminArea} onClose={() => !createLoading && setCreateOpen(false)}>
          <div className="qb-modal">
            <h3>Folder nou</h3>
            <label htmlFor="qb-new-folder-title">Nume</label>
            <input
              id="qb-new-folder-title"
              className="admin-form-input"
              value={createForm.title}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, title: e.target.value }))}
            />
            <label htmlFor="qb-new-folder-description">Descriere</label>
            <textarea
              id="qb-new-folder-description"
              className="admin-form-input"
              rows={3}
              value={createForm.description}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, description: e.target.value }))}
            />
            <div className="qb-modal-actions">
              <button type="button" className="lms-btn-secondary" onClick={() => setCreateOpen(false)} disabled={createLoading}>
                Anulează
              </button>
              <button type="button" className="lms-btn-primary" onClick={createFolder} disabled={createLoading}>
                {createLoading ? 'Se salvează...' : 'Creează'}
              </button>
            </div>
          </div>
        </Modal>
      </div>
    </div>
  );
};

export default AdminQuestionBanksPage;
