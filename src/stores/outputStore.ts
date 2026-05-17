import { create } from 'zustand'

export interface OutputEntry {
  id: string
  channel: string
  text: string
  time: string
}

interface OutputStore {
  entries: OutputEntry[]
  appendOutput: (channel: string, text: string) => void
  clearOutput: (channel?: string) => void
}

let counter = 0

export const useOutputStore = create<OutputStore>((set) => ({
  entries: [],
  appendOutput: (channel, text) => {
    const now = new Date()
    const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`
    set((s) => ({
      entries: [...s.entries, { id: `out-${++counter}`, channel, text, time }],
    }))
  },
  clearOutput: (channel) => {
    set((s) => ({
      entries: channel ? s.entries.filter(e => e.channel !== channel) : [],
    }))
  },
}))
