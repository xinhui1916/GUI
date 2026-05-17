import { create } from 'zustand'

interface UiStore {
  sidebarOpen: boolean
  settingsOpen: boolean
  globalSearchOpen: boolean
  commandPaletteOpen: boolean
  zenMode: boolean
  goToFileOpen: boolean
  toggleSidebar: () => void
  openSettings: () => void
  closeSettings: () => void
  setGlobalSearchOpen: (v: boolean) => void
  setCommandPaletteOpen: (v: boolean) => void
  openCommandPalette: () => void
  setGoToFileOpen: (v: boolean) => void
  toggleZenMode: () => void
}

export const useUiStore = create<UiStore>((set) => ({
  sidebarOpen: true,
  settingsOpen: false,
  globalSearchOpen: false,
  commandPaletteOpen: false,
  zenMode: false,
  goToFileOpen: false,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
  setGlobalSearchOpen: (v) => set({ globalSearchOpen: v }),
  setCommandPaletteOpen: (v) => set({ commandPaletteOpen: v }),
  openCommandPalette: () => set({ commandPaletteOpen: true }),
  setGoToFileOpen: (v) => set({ goToFileOpen: v }),
  toggleZenMode: () => set((s) => ({ zenMode: !s.zenMode })),
}))
