import { Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Layout } from '@/components/layout'
import { useSettings } from '@/lib/settings'
import { useTheme } from '@/hooks/use-theme'
import { LoginPage } from '@/pages/login'
import { DecksPage } from '@/pages/decks'
import { StudyPage } from '@/pages/study'
import { EditorPage } from '@/pages/editor'
import { BrowsePage } from '@/pages/browse'
import { StatsPage } from '@/pages/stats'
import { SettingsPage } from '@/pages/settings'

export function App() {
  useTheme()
  const { token, theme } = useSettings()
  return (
    <TooltipProvider>
      <Toaster richColors position="top-center" theme={theme} />
      <Routes>
        <Route path="/login" element={token ? <Navigate to="/" replace /> : <LoginPage />} />
        <Route element={token ? <Layout /> : <Navigate to="/login" replace />}>
          <Route index element={<DecksPage />} />
          <Route path="study/:deckId" element={<StudyPage />} />
          <Route path="add" element={<EditorPage />} />
          <Route path="edit/:noteId" element={<EditorPage />} />
          <Route path="browse" element={<BrowsePage />} />
          <Route path="stats" element={<StatsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </TooltipProvider>
  )
}
