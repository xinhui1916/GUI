import { create } from 'zustand'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
  id: string
  type: ToastType
  title: string
  message?: string
  duration: number
}

interface ToastStore {
  toasts: Toast[]
  addToast: (t: Omit<Toast, 'id'> & { id?: string }) => string
  removeToast: (id: string) => void
}

let nextId = 0

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (t) => {
    const id = t.id ?? `toast-${++nextId}`
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }))
    return id
  },
  removeToast: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  },
}))
