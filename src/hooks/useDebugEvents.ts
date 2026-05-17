import { useEffect, useRef } from 'react'
import { onDapEvent, dapSendRequest } from '../lib/ipc'
import { useDebugStore } from '../stores/debugStore'
import { logError } from '../lib/logger'

export function useDebugEvents() {
  const initializedRef = useRef(false)

  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true

    let unlisten: (() => void) | undefined

    ;(async () => {
      unlisten = await onDapEvent((event, sessionId, body) => {
        const store = useDebugStore.getState()

        switch (event) {
          case 'stopped': {
            store.setRunning(false)
            store.setStoppedReason(body?.reason || 'unknown')

            // Fetch threads
            dapSendRequest(sessionId, 'threads', {}).then((res) => {
              if (res?.threads) {
                useDebugStore.getState().setThreads(res.threads)
                const threadId = res.threads[0]?.id
                if (threadId) {
                  useDebugStore.getState().setActiveThread(threadId)
                  // Fetch stack trace
                  dapSendRequest(sessionId, 'stackTrace', {
                    threadId,
                    startFrame: 0,
                    levels: 20,
                  }).then((sr) => {
                    if (sr?.stackFrames) {
                      useDebugStore.getState().setStackFrames(sr.stackFrames)
                      // Fetch variables for top frame
                      const top = sr.stackFrames[0]
                      if (top?.id !== undefined) {
                        dapSendRequest(sessionId, 'scopes', { frameId: top.id }).then((scr) => {
                          if (scr?.scopes) {
                            scr.scopes.forEach((scope: any) => {
                              if (scope.variablesReference > 0) {
                                dapSendRequest(sessionId, 'variables', { variablesReference: scope.variablesReference }).then((vr) => {
                                  if (vr?.variables) {
                                    useDebugStore.getState().setVariables(`scope:${scope.name}`, vr.variables)
                                  }
                                })
                              }
                            })
                          }
                        })
                      }
                    }
                  })
                }
              }
            }).catch((err) => logError('useDebugEvents', 'DAP threads request failed', err))
            break
          }

          case 'continued': {
            store.setRunning(true)
            store.setStoppedReason('')
            break
          }

          case 'output': {
            if (body?.output) {
              const category = body.category || 'stdout'
              store.addConsoleOutput(body.output, category)
            }
            break
          }

          case 'terminated':
          case 'exited': {
            store.reset()
            break
          }

          case 'breakpoint': {
            if (body?.reason === 'changed') {
              // Forward breakpoint verification info
              store.setRunning(false)
              store.setStoppedReason('breakpoint')
            }
            break
          }
        }
      })
    })()

    return () => {
      unlisten?.()
      initializedRef.current = false
    }
  }, [])
}
