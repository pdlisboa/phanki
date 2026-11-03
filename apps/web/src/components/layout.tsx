import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { BarChart3, Layers, Plus, Search, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SyncIndicator } from './sync-indicator'

const NAV = [
  { to: '/', label: 'Decks', icon: Layers, end: true },
  { to: '/add', label: 'Adicionar', icon: Plus },
  { to: '/browse', label: 'Cartas', icon: Search },
  { to: '/stats', label: 'Estatísticas', icon: BarChart3 },
  { to: '/settings', label: 'Ajustes', icon: Settings },
]

export function Layout() {
  const studying = useLocation().pathname.startsWith('/study')
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/80 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-4">
          <NavLink to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <img src="/icon.svg" alt="" className="size-7" />
            Phanki
          </NavLink>
          <nav className="ml-6 hidden gap-1 md:flex">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  cn('rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground', isActive && 'bg-accent text-foreground')
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto">
            <SyncIndicator />
          </div>
        </div>
      </header>
      <main className={cn('mx-auto w-full max-w-5xl flex-1 px-4 py-6', !studying && 'pb-24 md:pb-6')}>
        <Outlet />
      </main>
      {!studying && (
        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => cn('flex flex-col items-center gap-1 py-2 text-[11px] text-muted-foreground', isActive && 'text-foreground')}
            >
              <n.icon className="size-5" />
              {n.label}
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  )
}
