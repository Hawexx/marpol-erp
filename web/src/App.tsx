import { Suspense, lazy, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import {
  Avatar,
  BusyIndicator,
  FlexBox,
  IllustratedMessage,
  Menu,
  MenuItem,
  ShellBar,
  ShellBarBranding,
  ShellBarItem,
  SideNavigation,
  SideNavigationItem,
} from '@ui5/webcomponents-react';
import { useAuth } from './auth/AuthContext.js';
import { NotificationProvider } from './components/NotificationProvider.js';
import { StatusTicker } from './components/StatusTicker.js';
import ErrorBoundary from './components/ErrorBoundary.js';
import { useAppTheme } from './theme/ThemeContext.js';
import type { ModuleKey } from './api/types.js';
import LoginPage from './pages/LoginPage.js';
import ChangePasswordDialog from './pages/ChangePasswordDialog.js';

/*
 * Sekmeler talep uzerine yuklenir. Onceden tum sayfalar tek pakette
 * geldigi icin ilk acilista butun ekranlar birden indiriliyordu.
 */
const OrderCreatePage = lazy(() => import('./pages/OrderCreatePage.js'));
const OrderListPage = lazy(() => import('./pages/OrderListPage.js'));
const FlangePage = lazy(() => import('./pages/FlangePage.js'));
const FabricPage = lazy(() => import('./pages/FabricPage.js'));
const RecipePage = lazy(() => import('./pages/RecipePage.js'));
const WorkflowPage = lazy(() => import('./pages/WorkflowPage.js'));
const UsersPage = lazy(() => import('./pages/UsersPage.js'));
const AuditPage = lazy(() => import('./pages/AuditPage.js'));
const PlanningPage = lazy(() => import('./pages/PlanningPage.js'));
const MachinePage = lazy(() => import('./pages/MachinePage.js'));
const StockPage = lazy(() => import('./pages/StockPage.js'));

interface NavEntry {
  route: string;
  text: string;
  icon: string;
  module: ModuleKey;
}

/** Sol menu - sistemin 6 ana sekmesi + yetkilendirme paneli. */
const NAV: NavEntry[] = [
  {
    route: '/uretim-emri-olustur',
    text: 'Üretim Emri Oluşturma',
    icon: 'add-document',
    module: 'URETIM_EMRI_OLUSTUR',
  },
  { route: '/uretim-emirleri', text: 'Üretim Emirleri', icon: 'sales-order-item', module: 'URETIM_EMIRLERI' },
  { route: '/flanslar', text: 'Flanş Çeşitleri', icon: 'circle-task-2', module: 'FLANS' },
  { route: '/kumaslar', text: 'Kumaş Çeşitleri', icon: 'grid', module: 'KUMAS' },
  { route: '/receteler', text: 'Kimyasal Reçete', icon: 'lab', module: 'KIMYASAL_RECETE' },
  { route: '/proses-semalari', text: 'İş Akışı / Proses', icon: 'process', module: 'IS_AKISI' },
  { route: '/makineler', text: 'Makineler', icon: 'machine', module: 'IS_AKISI' },
  { route: '/planlama', text: 'Üretim Planlama', icon: 'business-objects-experience', module: 'URETIM_EMIRLERI' },
  { route: '/yetkilendirme', text: 'Yetkilendirme Paneli', icon: 'shield', module: 'YETKILENDIRME' },
  { route: '/stok', text: 'Stok Takibi', icon: 'inventory', module: 'STOK' },
  { route: '/denetim', text: 'Denetim Kaydı', icon: 'history', module: 'DENETIM' },
];

function PageLoading() {
  return (
    <FlexBox justifyContent="Center" alignItems="Center" style={{ padding: '4rem' }}>
      <BusyIndicator active size="M" text="Sayfa yükleniyor..." />
    </FlexBox>
  );
}

function NoAccess() {
  return (
    <IllustratedMessage
      name="UnableToLoad"
      titleText="Bu sayfaya erişim yetkiniz yok"
      subtitleText="Yetki talebiniz için sistem yöneticinize başvurun."
    />
  );
}

/** Yetkisi olmayan kullaniciya sayfayi acmaz. */
function Guard({ module, children }: { module: ModuleKey; children: React.ReactNode }) {
  const { can } = useAuth();
  return can(module) ? <>{children}</> : <NoAccess />;
}

export default function App() {
  const { user, loading, logout, can } = useAuth();
  const { theme, toggleTheme } = useAppTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pwDialogOpen, setPwDialogOpen] = useState(false);
  const avatarRef = useRef<HTMLDivElement>(null);

  if (loading) {
    return (
      <FlexBox justifyContent="Center" alignItems="Center" style={{ height: '100vh' }}>
        <BusyIndicator active size="L" text="Oturum kontrol ediliyor..." />
      </FlexBox>
    );
  }

  if (!user) return <LoginPage />;

  const visibleNav = NAV.filter((entry) => can(entry.module));
  const homeRoute = visibleNav[0]?.route ?? '/erisim-yok';

  return (
    <NotificationProvider>
      <FlexBox direction="Column" style={{ height: '100vh' }}>
        <ShellBar
          secondaryTitle={user.department ?? 'Marpol A.Ş.'}
          content={<StatusTicker />}
          branding={
            <ShellBarBranding
              logo={<img src="/marpol.svg" alt="Marpol" className="mp-shellbar__logo" />}
              onClick={() => navigate(homeRoute)}
            >
              Üretim Yönetim Sistemi
            </ShellBarBranding>
          }
          profile={
            <div ref={avatarRef}>
              <Avatar initials={initials(user.fullName)} />
            </div>
          }
          onProfileClick={() => setMenuOpen(true)}
        >
          <ShellBarItem
            icon={theme === 'dark' ? 'light-mode' : 'dark-mode'}
            text={theme === 'dark' ? 'Açık Tema' : 'Koyu Tema'}
            onClick={toggleTheme}
          />
          <ShellBarItem
            icon="employee"
            text={user.fullName}
            onClick={() => setMenuOpen(true)}
          />
        </ShellBar>

        <Menu
          open={menuOpen}
          opener={avatarRef.current ?? undefined}
          onClose={() => setMenuOpen(false)}
          onItemClick={(e) => {
            const action = (e.detail.item as HTMLElement).dataset.action;
            setMenuOpen(false);
            if (action === 'password') setPwDialogOpen(true);
            if (action === 'theme') toggleTheme();
            if (action === 'logout') logout();
          }}
        >
          <MenuItem text={user.fullName} icon="employee" disabled />
          <MenuItem text="Şifre Değiştir" icon="key" data-action="password" />
          <MenuItem
            text={theme === 'dark' ? 'Açık Temaya Geç' : 'Koyu Temaya Geç'}
            icon={theme === 'dark' ? 'light-mode' : 'dark-mode'}
            data-action="theme"
          />
          <MenuItem text="Oturumu Kapat" icon="log" data-action="logout" />
        </Menu>

        {pwDialogOpen && <ChangePasswordDialog onClose={() => setPwDialogOpen(false)} />}

        <FlexBox style={{ flex: 1, minHeight: 0 }}>
          <SideNavigation
            style={{ height: '100%' }}
            onSelectionChange={(e) => {
              const route = (e.detail.item as HTMLElement).dataset.route;
              if (route) navigate(route);
            }}
          >
            {visibleNav.map((entry) => (
              <SideNavigationItem
                key={entry.route}
                text={entry.text}
                icon={entry.icon}
                data-route={entry.route}
                selected={location.pathname === entry.route}
              />
            ))}
          </SideNavigation>

          <div style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
            {/*
              Sayfa icerigini saran hata siniri: bir ekranda olusan render
              hatasi tum uygulamayi bos ekrana dusurmesin, kabuk ve menu
              ayakta kalsin.
            */}
            <ErrorBoundary>
            <Suspense fallback={<PageLoading />}>
            <Routes>
              <Route path="/" element={<Navigate to={homeRoute} replace />} />
              <Route
                path="/uretim-emri-olustur"
                element={
                  <Guard module="URETIM_EMRI_OLUSTUR">
                    <OrderCreatePage />
                  </Guard>
                }
              />
              <Route
                path="/uretim-emri-duzenle/:id"
                element={
                  <Guard module="URETIM_EMRI_OLUSTUR">
                    <OrderCreatePage />
                  </Guard>
                }
              />
              <Route
                path="/uretim-emirleri"
                element={
                  <Guard module="URETIM_EMIRLERI">
                    <OrderListPage />
                  </Guard>
                }
              />
              <Route
                path="/flanslar"
                element={
                  <Guard module="FLANS">
                    <FlangePage />
                  </Guard>
                }
              />
              <Route
                path="/kumaslar"
                element={
                  <Guard module="KUMAS">
                    <FabricPage />
                  </Guard>
                }
              />
              <Route
                path="/receteler"
                element={
                  <Guard module="KIMYASAL_RECETE">
                    <RecipePage />
                  </Guard>
                }
              />
              <Route
                path="/proses-semalari"
                element={
                  <Guard module="IS_AKISI">
                    <WorkflowPage />
                  </Guard>
                }
              />
              <Route
                path="/yetkilendirme"
                element={
                  <Guard module="YETKILENDIRME">
                    <UsersPage />
                  </Guard>
                }
              />
              <Route
                path="/denetim"
                element={
                  <Guard module="DENETIM">
                    <AuditPage />
                  </Guard>
                }
              />
              <Route
                path="/makineler"
                element={
                  <Guard module="IS_AKISI">
                    <MachinePage />
                  </Guard>
                }
              />
              <Route
                path="/planlama"
                element={
                  <Guard module="URETIM_EMIRLERI">
                    <PlanningPage />
                  </Guard>
                }
              />
              <Route
                path="/stok"
                element={
                  <Guard module="STOK">
                    <StockPage />
                  </Guard>
                }
              />
              <Route path="*" element={<NoAccess />} />
            </Routes>
            </Suspense>
            </ErrorBoundary>
          </div>
        </FlexBox>
      </FlexBox>
    </NotificationProvider>
  );
}

function initials(fullName: string): string {
  return fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase('tr-TR') ?? '')
    .join('');
}
