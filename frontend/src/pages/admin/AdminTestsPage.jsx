import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { adminService } from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import AdminContentItemCard from '../../components/admin/content/AdminContentItemCard';
import TestStatisticsPanel from '../../components/admin/tests/TestStatisticsPanel';
import AITestGenerateModal from '../../components/admin/tests/AITestGenerateModal';
import { canUseAiFeature } from '../../utils/aiAvailability';
import '../../styles/admin-content-list.css';
import './AdminTestsPage.css';

const normalizeTests = (raw) => (Array.isArray(raw) ? raw : []);
const normalizeTestStatus = (status) => (String(status || 'draft').toLowerCase() === 'published' ? 'published' : 'draft');

function testStatusLabel(status) {
  return normalizeTestStatus(status) === 'published' ? 'Publicat' : 'Draft';
}

function testTypeLabel(type) {
  const t = String(type || 'final').toLowerCase();
  if (t === 'practice') return 'Practică';
  if (t === 'graded') return 'Notat';
  return 'Final';
}

function buildTestMetaLine(item) {
  const questions = item.questions_count ?? item.questions?.length ?? 0;
  const parts = [
    `${questions} întrebări`,
    `${Number(item.passing_score ?? 70)}% prag`,
    item.max_attempts != null ? `${item.max_attempts} încercări` : null,
    item.time_limit_minutes ? `${item.time_limit_minutes} min` : 'Timp nelimitat',
  ].filter(Boolean);
  return parts.join(' · ');
}

export default function AdminTestsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { success: showSuccess, error: showError } = useToast();
  const { canMutateInAdminArea, user } = useAuth();
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [statsQuery, setStatsQuery] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [deleteConfirmTest, setDeleteConfirmTest] = useState(null);
  const [showAiTestModal, setShowAiTestModal] = useState(false);
  const aiTestAllowed = canUseAiFeature(user, 'ai_test_generation');

  const pageView = searchParams.get('view') === 'statistics' ? 'statistics' : 'list';
  const selectedTestId = Number(searchParams.get('testId')) || null;
  const selectedTest = useMemo(
    () => tests.find((item) => item.id === selectedTestId) || null,
    [tests, selectedTestId],
  );

  const listStats = useMemo(() => {
    const counts = { all: tests.length, draft: 0, published: 0 };
    tests.forEach((item) => {
      const status = normalizeTestStatus(item?.status);
      if (status in counts) counts[status] += 1;
    });
    return counts;
  }, [tests]);

  const loadTests = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await adminService.getTests({ per_page: 500 });
      setTests(normalizeTests(data));
    } catch (e) {
      console.error('Failed to load tests:', e);
      setTests([]);
      setError('Nu s-a putut încărca lista de teste.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTests();
  }, [loadTests]);

  const filteredTests = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = tests.map((item) => ({ ...item, status: normalizeTestStatus(item?.status) }));
    if (!needle) return rows;
    return rows.filter((row) => {
      const title = String(row?.title || '').toLowerCase();
      const description = String(row?.description || '').toLowerCase();
      return title.includes(needle) || description.includes(needle);
    });
  }, [tests, query]);

  const filteredStatsTests = useMemo(() => {
    const needle = statsQuery.trim().toLowerCase();
    if (!needle) return tests;
    return tests.filter((row) => String(row?.title || '').toLowerCase().includes(needle));
  }, [tests, statsQuery]);

  const openBuilder = (item, section = 'questions') => {
    if (!item?.id) return;
    navigate(`/admin/tests/${item.id}/builder?section=${section}`);
  };

  const setPageView = (view, testId = null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', 'tests');
      if (view === 'statistics') {
        next.set('view', 'statistics');
        if (testId) next.set('testId', String(testId));
        else next.delete('testId');
      } else {
        next.delete('view');
        next.delete('testId');
      }
      return next;
    });
  };

  const openStatistics = (item) => {
    if (!item?.id) return;
    setPageView('statistics', item.id);
  };

  const handlePublish = async (item) => {
    if (!item?.id) return;
    setBusyId(item.id);
    try {
      await adminService.publishTest(item.id);
      setTests((prev) => prev.map((row) => (
        row.id === item.id ? { ...row, status: 'published' } : row
      )));
      showSuccess('Test publicat.');
    } catch (e) {
      console.error('Failed to publish test:', e);
      showError(e?.response?.data?.message || 'Nu s-a putut publica testul.');
    } finally {
      setBusyId(null);
    }
  };

  const patchTestStatus = async (item, status) => {
    if (!item?.id) return;
    setBusyId(item.id);
    try {
      await adminService.updateTest(item.id, { status: status === 'published' ? 'published' : 'draft' });
      showSuccess(status === 'published' ? 'Test publicat.' : 'Test mutat în draft.');
      setTests((prev) => prev.map((row) => (
        row.id === item.id ? { ...row, status: status === 'published' ? 'published' : 'draft' } : row
      )));
    } catch (e) {
      console.error('Failed to update test status:', e);
      showError(e?.response?.data?.message || 'Nu s-a putut actualiza statusul.');
    } finally {
      setBusyId(null);
    }
  };

  const handleConfirmDeleteTest = async () => {
    if (!deleteConfirmTest?.id) return;
    setBusyId(deleteConfirmTest.id);
    try {
      await adminService.deleteTest(deleteConfirmTest.id);
      showSuccess('Test șters.');
      setTests((prev) => prev.filter((row) => row.id !== deleteConfirmTest.id));
      setDeleteConfirmTest(null);
    } catch (e) {
      console.error('Failed to delete test:', e);
      showError(e?.response?.data?.message || 'Nu s-a putut șterge testul.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="admin-tests-page admin-content-list-page">
      <header className="admin-content-list-header">
        <div className="admin-content-list-header__copy">
          <p className="admin-content-list-header__kicker">Conținut</p>
          <h1>Teste</h1>
          <p className="admin-content-list-header__lead">
            {pageView === 'statistics'
              ? 'Statistici detaliate per test în Formely: rezumat, elevi și analiză pe întrebări.'
              : 'Teste reutilizabile — același builder ca în cursuri, cu setări și întrebări într-un singur loc.'}
          </p>
          {pageView === 'list' ? (
            <div className="admin-content-list-stats" aria-label="Rezumat">
              <span>Total<strong>{listStats.all}</strong></span>
              <span>Draft<strong>{listStats.draft}</strong></span>
              <span>Publicate<strong>{listStats.published}</strong></span>
            </div>
          ) : null}
        </div>
      </header>

      <nav className="admin-tests-compartments" aria-label="Compartimente teste">
        <button
          type="button"
          className={`admin-tests-compartment-tab${pageView === 'list' ? ' is-active' : ''}`}
          onClick={() => setPageView('list')}
        >
          Listă teste
        </button>
        <button
          type="button"
          className={`admin-tests-compartment-tab${pageView === 'statistics' ? ' is-active' : ''}`}
          onClick={() => setPageView('statistics', selectedTestId || tests[0]?.id || null)}
        >
          Statistici
        </button>
      </nav>

      {pageView === 'statistics' ? (
        <div className="admin-tests-stats-layout">
          <aside className="admin-tests-stats-sidebar">
            <div className="admin-tests-stats-sidebar-head">
              <h2>Teste</h2>
              <p>Selectează testul pentru analiză detaliată.</p>
            </div>
            <div className="admin-tests-stats-sidebar-search">
              <input
                type="search"
                placeholder="Caută test…"
                aria-label="Caută în lista de teste"
                value={statsQuery}
                onChange={(e) => setStatsQuery(e.target.value)}
              />
            </div>
            {loading ? (
              <div className="admin-tests-stats-sidebar-empty">Se încarcă…</div>
            ) : filteredStatsTests.length === 0 ? (
              <div className="admin-tests-stats-sidebar-empty">Niciun test găsit.</div>
            ) : (
              <ul className="admin-tests-stats-sidebar-list" role="listbox" aria-label="Teste disponibile">
                {filteredStatsTests.map((item) => {
                  const status = normalizeTestStatus(item.status);
                  const isActive = item.id === selectedTestId;
                  const questions = item.questions_count ?? item.questions?.length ?? 0;
                  const attempts = item.results_count ?? 0;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        className={`admin-tests-stats-sidebar-item${isActive ? ' is-active' : ''}`}
                        onClick={() => setPageView('statistics', item.id)}
                      >
                        <span className="admin-tests-stats-sidebar-item-title">{item.title || `Test #${item.id}`}</span>
                        <span className="admin-tests-stats-sidebar-item-meta">
                          {testStatusLabel(status)} · {questions} întrebări · {attempts} încercări
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>

          <div className="admin-tests-stats-main">
            {loading ? (
              <div className="admin-content-list-empty">Se încarcă testele…</div>
            ) : tests.length === 0 ? (
              <div className="admin-content-list-empty">Niciun test disponibil pentru statistici.</div>
            ) : !selectedTestId ? (
              <div className="admin-content-list-empty">Selectează un test din lista din stânga.</div>
            ) : (
              <TestStatisticsPanel
                testId={selectedTestId}
                testTitle={(selectedTest?.title || '').trim() || 'Test'}
              />
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="admin-content-list-toolbar">
            <div className="admin-content-list-search">
              <input
                type="search"
                placeholder="Caută test..."
                aria-label="Caută teste"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            {canMutateInAdminArea && aiTestAllowed ? (
                <button
                  type="button"
                  className="admin-btn admin-btn-primary"
                  onClick={() => setShowAiTestModal(true)}
                >
                  Test cu Formely AI
                </button>
            ) : null}
          </div>

          {loading ? (
            <div className="admin-content-list-skeleton" aria-busy="true" aria-label="Se încarcă testele">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="admin-content-list-skeleton__card" />
              ))}
            </div>
          ) : error ? (
            <div className="admin-content-list-empty">{error}</div>
          ) : filteredTests.length === 0 ? (
            <div className="admin-content-list-empty">
              {tests.length === 0 ? 'Niciun test încă. Creează unul din constructorul de curs.' : 'Niciun rezultat pentru căutare.'}
            </div>
          ) : (
            <div className="admin-content-list-grid">
              {filteredTests.map((item) => {
                const status = normalizeTestStatus(item.status);
                const busy = busyId === item.id;

                const secondaryActions = [
                  { label: 'Statistici', onClick: () => openStatistics(item), disabled: busy },
                  ...(canMutateInAdminArea
                    ? [
                        { label: 'Setări', onClick: () => openBuilder(item, 'settings'), disabled: busy },
                        status === 'draft'
                          ? { label: busy ? 'Se publică…' : 'Publică', onClick: () => handlePublish(item), disabled: busy, emphasis: true }
                          : { label: 'Draft', onClick: () => patchTestStatus(item, 'draft'), disabled: busy },
                        { label: 'Șterge', onClick: () => setDeleteConfirmTest(item), disabled: busy, danger: true },
                      ]
                    : []),
                ];

                return (
                  <AdminContentItemCard
                    key={item.id}
                    title={item.title || 'Test fără titlu'}
                    badge={`Test ${testTypeLabel(item.type).toLowerCase()}`}
                    status={status}
                    statusLabel={testStatusLabel(status)}
                    metaLine={buildTestMetaLine(item)}
                    primaryAction={{
                      label: 'Deschide builder-ul',
                      onClick: () => openBuilder(item, 'questions'),
                      disabled: busy,
                    }}
                    actions={secondaryActions}
                  />
                );
              })}
            </div>
          )}
        </>
      )}

      {deleteConfirmTest ? (
        <div
          className="admin-tests-modal-overlay"
          role="presentation"
          onClick={() => !busyId && setDeleteConfirmTest(null)}
        >
          <div
            className="admin-tests-delete-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="test-delete-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="test-delete-title">Ștergi testul?</h3>
            <p className="admin-tests-delete-lead">
              <strong>{deleteConfirmTest.title || 'Test'}</strong> va fi eliminat. Legăturile din cursuri pot înceta să funcționeze.
            </p>
            <p className="admin-tests-delete-hint">Pentru a ascunde testul de elevi, mută-l în draft.</p>
            <div className="admin-tests-delete-actions">
              <button type="button" disabled={busyId} onClick={() => setDeleteConfirmTest(null)}>
                Anulează
              </button>
              <button type="button" className="is-danger-solid" disabled={busyId} onClick={handleConfirmDeleteTest}>
                {busyId ? 'Se șterge…' : 'Șterge'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showAiTestModal && aiTestAllowed ? (
        <AITestGenerateModal
          open={showAiTestModal}
          onClose={() => setShowAiTestModal(false)}
          onSaved={(test) => {
            setShowAiTestModal(false);
            loadTests();
            if (test?.id) {
              navigate(`/admin/tests/${test.id}/builder?section=questions`);
            }
          }}
        />
      ) : null}
    </div>
  );
}
