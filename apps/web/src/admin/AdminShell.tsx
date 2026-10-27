import { LayoutDashboard, LogOut, ExternalLink, Palette, LayoutTemplate, SlidersHorizontal, BookOpen, GraduationCap, Sparkles, Activity, Flag, ClipboardCheck } from 'lucide-react';
import { useState } from 'react';

import { BrandMark } from '@/components/brand/BrandMark';
import { useAdminContent } from './AdminContext';
import { AdminDocumentTitle } from './AdminApp';
import { AdminDashboard } from './pages/AdminDashboard';
import { AdminBranding } from './pages/AdminBranding';
import { AdminTemplates } from './pages/AdminTemplates';
import { AdminEngineering } from './pages/AdminEngineering';
import { AdminGlossary } from './pages/AdminGlossary';
import { AdminTour } from './pages/AdminTour';
import { AdminDrift } from './pages/AdminDrift';
import { AdminFeatures } from './pages/AdminFeatures';
import { AdminFeedback } from './pages/AdminFeedback';
import { AdminReview } from './pages/AdminReview';

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, description: 'Overview and storage status.' },
  { id: 'branding', label: 'Branding', icon: Palette, description: 'App name, title, logo and disclaimers.' },
  { id: 'templates', label: 'Templates', icon: LayoutTemplate, description: 'Building starting points.' },
  { id: 'engineering', label: 'Engineering', icon: SlidersHorizontal, description: 'Editable assumptions and limits.' },
  { id: 'glossary', label: 'Glossary', icon: BookOpen, description: 'Plain-language definitions.' },
  { id: 'tour', label: 'Tour & welcome', icon: GraduationCap, description: 'Guided tour and welcome gate.' },
  { id: 'drift', label: 'Drift bands', icon: Sparkles, description: 'Drift display bands and colours.' },
  { id: 'features', label: 'Features', icon: Flag, description: 'Capability toggles and limits.' },
  { id: 'feedback', label: 'Feedback', icon: ClipboardCheck, description: 'Saved SUS responses.' },
  { id: 'review', label: 'Assumptions review', icon: Activity, description: 'Placeholder review tracking.' },
];

const SECTION_INFO = Object.fromEntries(NAV.map((item) => [item.id, item]));

export function AdminShell({
  path,
  navigate,
  onLogout,
}: {
  path: string;
  navigate: (to: string) => void;
  onLogout: () => void;
}) {
  const { content, notice, clearNotice } = useAdminContent();
  const section = (path.replace(/^\/admin\/?/, '').split('/')[0] || 'dashboard').toLowerCase();
  const current = SECTION_INFO[section] ?? SECTION_INFO.dashboard;
  const [search, setSearch] = useState('');
  const filteredNav = NAV.filter((item) => item.label.toLowerCase().includes(search.trim().toLowerCase()));

  function go(id: string) {
    navigate(id === 'dashboard' ? '/admin' : `/admin/${id}`);
    window.scrollTo(0, 0);
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <AdminDocumentTitle />
      <div className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col gap-4 p-4 lg:flex-row lg:items-start lg:p-6">
        <div className="lg:hidden">
          <label className="mb-2 block text-sm font-medium" htmlFor="admin-section-picker">
            Section
          </label>
          <select
            id="admin-section-picker"
            value={section}
            onChange={(event) => go(event.target.value)}
            className="h-10 w-full rounded-app border border-line bg-surface px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {NAV.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </div>

        <aside className="hidden w-full shrink-0 rounded-card border border-line bg-surface p-3 lg:sticky lg:top-6 lg:block lg:w-64 lg:self-start lg:overflow-y-auto">
          <div className="mb-4 flex items-center gap-3 px-2">
            <BrandMark />
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold">{content.branding.appName}</p>
              <p className="text-xs text-muted-foreground">Admin</p>
            </div>
          </div>

          <label className="mb-2 block px-2 text-xs font-medium text-muted-foreground" htmlFor="admin-nav-search">
            Find a section
          </label>
          <input
            id="admin-nav-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search sections"
            className="mb-3 h-9 w-full rounded-app border border-line bg-background px-3 text-sm"
          />

          <nav className="flex flex-col gap-1" aria-label="Admin sections">
            {filteredNav.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">No sections found.</p>
            ) : (
              filteredNav.map((item) => {
                const Icon = item.icon;
                const active = section === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => go(item.id)}
                    aria-current={active ? 'page' : undefined}
                    className={`flex items-center gap-2 rounded-app px-3 py-2 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                      active
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground'
                    }`}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    <span>{item.label}</span>
                  </button>
                );
              })
            )}
          </nav>

          <div className="mt-auto flex flex-col gap-2 border-t border-line pt-4">
            <a
              href="/"
              className="flex items-center gap-2 rounded-app px-3 py-2 text-sm text-muted-foreground hover:bg-surface-2 hover:text-foreground transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <ExternalLink className="size-4 shrink-0" aria-hidden="true" />
              Open simulator
            </a>
            <button
              type="button"
              onClick={onLogout}
              className="flex items-center gap-2 rounded-app px-3 py-2 text-sm text-muted-foreground hover:bg-surface-2 hover:text-foreground transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <LogOut className="size-4 shrink-0" aria-hidden="true" />
              Sign out
            </button>
          </div>

          <div className="mt-3 border-t border-line pt-3">
            <div className="flex items-center gap-2.5 px-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary ring-1 ring-primary/20">
                AD
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">Administrator</p>
                <p className="truncate text-xs text-muted-foreground">admin@quakestudio.local</p>
              </div>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          {notice ? (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-app border border-primary/30 bg-primary/10 px-4 py-3 text-sm">
              <span>{notice}</span>
              <button type="button" onClick={clearNotice} className="text-muted-foreground hover:text-foreground">
                Dismiss
              </button>
            </div>
          ) : null}

          <header className="mb-6">
            <h1 className="text-2xl font-semibold">{current.label}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{current.description}</p>
          </header>

          {renderPage(section)}
        </main>
      </div>
    </div>
  );
}

function renderPage(section: string) {
  switch (section) {
    case 'branding':
      return <AdminBranding />;
    case 'templates':
      return <AdminTemplates />;
    case 'engineering':
      return <AdminEngineering />;
    case 'glossary':
      return <AdminGlossary />;
    case 'tour':
      return <AdminTour />;
    case 'drift':
      return <AdminDrift />;
    case 'features':
      return <AdminFeatures />;
    case 'feedback':
      return <AdminFeedback />;
    case 'review':
      return <AdminReview />;
    default:
      return <AdminDashboard />;
  }
}
