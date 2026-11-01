import {
  Activity,
  BookOpen,
  ClipboardCheck,
  ExternalLink,
  Flag,
  GraduationCap,
  LayoutDashboard,
  LayoutTemplate,
  LogOut,
  Palette,
  SlidersHorizontal,
  Sparkles,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { placeholderCount } from '@/config/assumptionCatalogue';
import { readFeedback } from '@/feedback/feedbackStorage';
import { BrandMark } from '@/components/brand/BrandMark';
import {
  countUnpublishedChanges,
  logActivity,
  markPublished,
  readLastPublishedAt,
} from './adminActivity';
import { showNotice } from './adminToast';
import {
  adminButtonClass,
  AdminButton,
  AdminSearchInput,
  AdminThemeToggle,
  AdminTopBar,
  StatusBadge,
} from './AdminUI';
import { useAdminContent } from './AdminContext';
import { AdminDocumentTitle } from './AdminApp';
import { Toaster } from './AdminToaster';
import { AdminPageHeader } from './AdminForms';
import { swalConfirm } from './adminSwal';
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

type NavItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  description: string;
  group: string;
  badge?: { label: string; tone: 'neutral' | 'success' | 'warning' };
};

const NAV_GROUPS: { label: string; items: Omit<NavItem, 'group'>[] }[] = [
  {
    label: 'Overview',
    items: [
      {
        id: 'dashboard',
        label: 'Dashboard',
        icon: LayoutDashboard,
        description: 'What is live, what is waiting, and what needs a decision.',
      },
    ],
  },
  {
    label: 'Content',
    items: [
      {
        id: 'templates',
        label: 'Templates',
        icon: LayoutTemplate,
        description: 'Ready-made buildings users can start from.',
      },
      {
        id: 'glossary',
        label: 'Glossary',
        icon: BookOpen,
        description: 'Plain-language tooltips for the simulator.',
      },
      {
        id: 'tour',
        label: 'Tour & welcome',
        icon: GraduationCap,
        description: 'Guided tour and first-run dialog.',
      },
      {
        id: 'features',
        label: 'Features',
        icon: Flag,
        description: 'Capability toggles and simulator limits.',
      },
    ],
  },
  {
    label: 'Simulation',
    items: [
      {
        id: 'engineering',
        label: 'Engineering',
        icon: SlidersHorizontal,
        description: 'Assumptions the simulator uses.',
        badge: { label: String(placeholderCount()), tone: 'warning' },
      },
      {
        id: 'drift',
        label: 'Drift bands',
        icon: Sparkles,
        description: 'Drift thresholds and colours.',
      },
      {
        id: 'review',
        label: 'Assumptions review',
        icon: Activity,
        description: 'Track values awaiting adviser sign-off.',
        badge: { label: String(placeholderCount()), tone: 'warning' },
      },
    ],
  },
  {
    label: 'Appearance',
    items: [
      {
        id: 'branding',
        label: 'Branding',
        icon: Palette,
        description: 'App name, title, logo and disclaimers.',
      },
    ],
  },
  {
    label: 'Users',
    items: [
      {
        id: 'feedback',
        label: 'Feedback',
        icon: ClipboardCheck,
        description: 'Saved SUS responses from simulator users.',
        badge: {
          label: `${readFeedback().length} new`,
          tone: 'success',
        },
      },
    ],
  },
];

const NAV: NavItem[] = NAV_GROUPS.flatMap((group) =>
  group.items.map((item) => ({ ...item, group: group.label })),
);
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
  const { content } = useAdminContent();
  const section = (path.replace(/^\/admin\/?/, '').split('/')[0] || 'dashboard').toLowerCase();
  const current = SECTION_INFO[section] ?? SECTION_INFO.dashboard;
  const [search, setSearch] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [publishedAt, setPublishedAt] = useState<string | null>(
    () => readLastPublishedAt() ?? markPublished(),
  );
  const draftCount = countUnpublishedChanges(publishedAt);

  const query = search.trim().toLowerCase();
  const filteredGroups = NAV_GROUPS.map((group) => ({
    label: group.label,
    items: group.items.filter((item) => `${item.label} ${item.description}`.toLowerCase().includes(query)),
  })).filter((group) => group.items.length > 0);
  const noResults = query.length > 0 && filteredGroups.length === 0;

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen]);

  function go(id: string) {
    navigate(id === 'dashboard' ? '/admin' : `/admin/${id}`);
    setMobileOpen(false);
    window.scrollTo(0, 0);
  }

  function confirmLogout() {
    swalConfirm({
      title: 'Sign out of admin?',
      text: 'You can sign back in with the demo credentials.',
      confirmLabel: 'Sign out',
      tone: 'primary',
      onConfirm: onLogout,
    });
  }

  function publishChanges() {
    if (draftCount === 0) {
      showNotice('There are no unpublished changes.');
      return;
    }
    const at = markPublished();
    logActivity({
      kind: 'publish',
      title:
        draftCount === 1
          ? 'Published 1 change to the simulator'
          : `Published ${draftCount} changes to the simulator`,
      detail: 'Reload the simulator to see them',
      at,
    });
    setPublishedAt(at);
    showNotice('Published. Reload the simulator to see the changes.');
  }

  const nav = (
    <SidebarNavigation
      groups={filteredGroups}
      section={section}
      noResults={noResults}
      onNavigate={go}
      onClearSearch={() => setSearch('')}
    />
  );

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <AdminDocumentTitle />

      {/* Mobile drawer overlay */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close admin navigation"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-black/60"
          />
          <div
            id="admin-mobile-nav"
            role="dialog"
            aria-modal="true"
            aria-label="Admin navigation"
            className="absolute inset-y-0 right-0 flex w-[min(22rem,calc(100vw-2.5rem))] flex-col border-l border-line bg-surface shadow-2xl"
          >
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-4">
              <div className="flex min-w-0 items-center gap-2.5">
                <BrandMark />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{content.branding.appName}</p>
                  <p className="text-[11px] text-muted-foreground">Admin workspace</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation"
                className="grid size-8 shrink-0 place-items-center rounded-app text-muted-foreground hover:bg-surface-2 hover:text-foreground"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
            <div className="px-3 pb-3">
              <AdminSearchInput
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onClear={() => setSearch('')}
                placeholder="Find a section"
                ariaLabel="Find an admin section"
                className="w-full"
              />
            </div>
            <nav className="min-h-0 flex-1 overflow-y-auto p-2" aria-label="Admin sections">
              {nav}
            </nav>
            <div className="border-t border-line p-2">
              <a href="/" className={adminButtonClass('ghost', 'md', 'w-full justify-start')}>
                <ExternalLink className="size-4" aria-hidden="true" />
                Open simulator
              </a>
              <AdminButton
                variant="ghost"
                onClick={confirmLogout}
                icon={LogOut}
                className="w-full justify-start"
              >
                Sign out
              </AdminButton>
              <AccountRow />
            </div>
          </div>
        </div>
      ) : null}

      <div className="mx-auto flex w-full max-w-[90rem] flex-col gap-4 p-4 lg:flex-row lg:items-start lg:p-6">
        {/* Sidebar — sticky on desktop, does not scroll with page */}
        <aside className="hidden w-64 shrink-0 flex-col overflow-hidden rounded-card border border-line bg-surface lg:sticky lg:top-[5.5rem] lg:flex lg:h-[calc(100dvh-7rem)]">
          <div className="flex items-center gap-3 px-4 pb-4 pt-4">
            <BrandMark className="size-9" iconClassName="size-[18px]" />
            <div className="min-w-0">
              <p className="truncate text-base font-semibold leading-5">{content.branding.appName}</p>
              <p className="text-[11px] text-muted-foreground">Admin workspace</p>
            </div>
          </div>

          <div className="px-3 pb-3">
            <AdminSearchInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onClear={() => setSearch('')}
              placeholder="Find a section"
              ariaLabel="Find an admin section"
              className="w-full"
            />
          </div>

          <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3" aria-label="Admin sections">
            {nav}
          </nav>

          <div className="border-t border-line p-2 shrink-0">
            <a href="/" className={adminButtonClass('ghost', 'md', 'w-full justify-start')}>
              <ExternalLink className="size-4" aria-hidden="true" />
              Open simulator
            </a>
            <AdminButton
              variant="ghost"
              onClick={confirmLogout}
              icon={LogOut}
              className="w-full justify-start"
            >
              Sign out
            </AdminButton>
            <AccountRow />
          </div>
        </aside>

        {/* Main content area — full width to the right of sidebar */}
        <div className="min-w-0 flex-1">
          <AdminTopBar
            draftCount={draftCount}
            searchValue={search}
            searchPlaceholder="Search settings, text, glossary..."
            onSearchChange={(event: React.ChangeEvent<HTMLInputElement>) => setSearch(event.target.value)}
            onPublish={publishChanges}
            onPreview={() => navigate('/')}
          />

          <main className="mt-4">
            <Toaster />
            <AdminPageHeader
              title={current.label}
              description={current.description}
              eyebrow={current.group}
              actions={
                <div className="hidden lg:block">
                  <AdminThemeToggle />
                </div>
              }
            />
            {renderPage(section, go)}
          </main>
        </div>
      </div>
    </div>
  );
}

function SidebarNavigation({
  groups,
  section,
  noResults,
  onNavigate,
  onClearSearch,
}: {
  groups: { label: string; items: Omit<NavItem, 'group'>[] }[];
  section: string;
  noResults: boolean;
  onNavigate: (id: string) => void;
  onClearSearch: () => void;
}) {
  if (noResults) {
    return (
      <div className="px-3 py-8 text-center">
        <p className="text-sm font-medium">No sections found</p>
        <p className="mt-1 text-xs text-muted-foreground">Try a different word.</p>
        <AdminButton variant="ghost" size="sm" onClick={onClearSearch} className="mt-3">
          Clear search
        </AdminButton>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="px-3 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
            {group.label}
          </p>
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  aria-current={active ? 'page' : undefined}
                  title={item.description}
                  className={`flex w-full items-center gap-2.5 rounded-app px-3 py-2 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                    active
                      ? 'bg-primary/10 font-medium text-primary ring-1 ring-inset ring-primary/15'
                      : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground'
                  }`}
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{item.label}</span>
                  {item.badge ? (
                    <StatusBadge tone={item.badge.tone === 'success' ? 'live' : item.badge.tone}>
                      {item.badge.label}
                    </StatusBadge>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function AccountRow() {
  return (
    <div className="mt-2 flex items-center gap-2.5 border-t border-line px-2 pt-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary ring-1 ring-primary/20">
        AD
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium leading-5">Administrator</p>
        <p className="truncate text-[11px] text-muted-foreground">admin@quakestudio.local</p>
      </div>
    </div>
  );
}

function renderPage(section: string, go: (id: string) => void) {
  switch (section) {
    case 'branding':
      return <AdminBranding />;
    case 'templates':
      return <AdminTemplates />;
    case 'engineering':
      return <AdminEngineering onNavigate={go} />;
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
      return <AdminDashboard onNavigate={go} />;
  }
}
