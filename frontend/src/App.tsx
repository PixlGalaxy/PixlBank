import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AppConfigProvider } from './context/AppConfigContext';
import { I18nProvider } from './i18n/I18nContext';
import { AuthProvider } from './context/AuthContext';
import { AutoSignOutProvider } from './context/AutoSignOutContext';
import { PrivacyProvider } from './context/PrivacyContext';
import { ProtectedRoute, AdminRoute } from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/home/HomePage';
import UserManagerPage from './pages/manager/UserManagerPage';
import BorrowerPage from './pages/manager/BorrowerPage';
import AdminPage from './pages/admin/AdminPage';
import SettingsPage from './pages/settings/SettingsPage';

const App = () => (
  <BrowserRouter>
    <PrivacyProvider>
      <AppConfigProvider>
        {/* Auth wraps I18n/Theme: language and appearance are account data, so they need the signed-in user. */}
        <AuthProvider>
          <I18nProvider>
            <ThemeProvider>
              <AutoSignOutProvider>
                <Routes>
                  <Route path="/login" element={<LoginPage />} />

                  <Route element={<ProtectedRoute />}>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route path="/profile" element={<Navigate to="/settings?section=account" replace />} />

                    <Route element={<AdminRoute />}>
                      <Route path="/users-manager" element={<UserManagerPage />} />
                      <Route path="/users-manager/:userId" element={<BorrowerPage />} />
                      <Route path="/admin" element={<AdminPage />} />
                    </Route>
                  </Route>

                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </AutoSignOutProvider>
            </ThemeProvider>
          </I18nProvider>
        </AuthProvider>
      </AppConfigProvider>
    </PrivacyProvider>
  </BrowserRouter>
);

export default App;
