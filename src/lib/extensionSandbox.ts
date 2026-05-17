/**
 * Extension Sandbox — runs extension JS in an isolated Web Worker.
 *
 * The worker receives extension code and returns registered capabilities.
 * API calls (readFile, writeFile, etc.) are proxied back to the main thread.
 */

export interface SandboxRequest {
  type: 'activate' | 'deactivate' | 'execute-command'
  code?: string
  extensionPath?: string
  command?: string
  args?: any[]
  api?: SandboxAPI
}

export interface SandboxResponse {
  type: 'activated' | 'deactivated' | 'command-result' | 'error'
  commands?: { id: string; title: string; category?: string }[]
  views?: { panelId: string; id: string; name: string }[]
  result?: any
  error?: string
}

export interface SandboxAPI {
  readFile: (path: string) => Promise<string>
  writeFile: (path: string, content: string) => Promise<void>
  showMessage: (msg: string) => void
  showError: (msg: string) => void
  executeCommand: (id: string, ...args: any[]) => Promise<any>
  log: (text: string) => void
}

/**
 * Create a sandboxed Web Worker from extension code.
 */
export function createSandbox(
  _code: string,
  api: SandboxAPI,
): { postRequest: (req: SandboxRequest) => void; terminate: () => void } {
  // Build a worker blob that exposes the extension API and runs the code
  const workerScript = `
    // Extension sandbox worker
    const __api = {
      readFile: (path) => __call('readFile', path),
      writeFile: (path, content) => __call('writeFile', path, content),
      showInformationMessage: (msg) => __call('showMessage', msg),
      showErrorMessage: (msg) => __call('showError', msg),
      executeCommand: (id, ...args) => __call('executeCommand', id, ...args),
      log: (text) => __call('log', text),
    }

    function __call(method, ...args) {
      return new Promise((resolve, reject) => {
        const id = Math.random().toString(36).slice(2)
        const handler = (e) => {
          if (e.data && e.data.__responseId === id) {
            self.removeEventListener('message', handler)
            if (e.data.error) reject(new Error(e.data.error))
            else resolve(e.data.result)
          }
        }
        self.addEventListener('message', handler)
        self.postMessage({ __method: method, __args: args, __requestId: id })
      })
    }

    const __commands = {}
    const __subscriptions = []

    const context = {
      extensionPath: '',
      subscriptions: __subscriptions,
      commands: {
        registerCommand: (id, handler) => {
          __commands[id] = handler
          self.postMessage({ __type: 'register-command', id: id })
        },
      },
      workspace: {
        readFile: (path) => __api.readFile(path),
        writeFile: (path, content) => __api.writeFile(path, content),
      },
      window: {
        showInformationMessage: (msg) => __api.showInformationMessage(msg),
        showErrorMessage: (msg) => __api.showErrorMessage(msg),
      },
    }

    self.addEventListener('message', async (e) => {
      const msg = e.data

      if (msg.__type === '__response') {
        // Forward API responses — handled by pending promises above
        return
      }

      if (msg.type === 'activate') {
        context.extensionPath = msg.extensionPath || ''
        try {
          const fn = new Function('context', msg.code || '')
          const exports = fn(context)
          if (exports && exports.activate) {
            await exports.activate(context)
          }
          // Report registered commands
          const cmdList = Object.keys(__commands).map(id => ({ id }))
          self.postMessage({ type: 'activated', commands: cmdList, __type: 'sandbox-result' })
        } catch (err) {
          self.postMessage({ type: 'error', error: err.message, __type: 'sandbox-result' })
        }
      }

      if (msg.type === 'execute-command') {
        const handler = __commands[msg.command]
        if (handler) {
          try {
            const result = await handler(...(msg.args || []))
            self.postMessage({ type: 'command-result', result, __type: 'sandbox-result', __commandId: msg.__commandId })
          } catch (err) {
            self.postMessage({ type: 'error', error: err.message, __type: 'sandbox-result', __commandId: msg.__commandId })
          }
        } else {
          self.postMessage({ type: 'error', error: 'Command not found: ' + msg.command, __type: 'sandbox-result', __commandId: msg.__commandId })
        }
      }
    })

    // Signal ready
    self.postMessage({ __type: 'sandbox-ready' })
  `

  const blob = new Blob([workerScript], { type: 'application/javascript' })
  const url = URL.createObjectURL(blob)
  const worker = new Worker(url)
  let requestId = 0

  // Forward API calls from worker to main thread
  worker.addEventListener('message', async (e) => {
    const msg = e.data

    if (msg.__type === 'sandbox-ready') return
    if (msg.__type === 'sandbox-result') return

    // Handle API method calls from worker
    if (msg.__method) {
      const method = msg.__method as keyof SandboxAPI
      const args = msg.__args || []
      try {
        let result: any
        switch (method) {
          case 'readFile':
            result = await api.readFile(args[0])
            break
          case 'writeFile':
            result = await api.writeFile(args[0], args[1])
            break
          case 'showMessage':
            result = api.showMessage(args[0])
            break
          case 'showError':
            result = api.showError(args[0])
            break
          case 'executeCommand':
            result = await api.executeCommand(args[0], ...args.slice(1))
            break
          case 'log':
            result = api.log(args[0])
            break
        }
        worker.postMessage({ __responseId: msg.__requestId, result })
      } catch (err: any) {
        worker.postMessage({ __responseId: msg.__requestId, error: err.message })
      }
      return
    }
  })

  return {
    postRequest: (req) => {
      requestId++
      worker.postMessage({ ...req, __requestId: requestId })
    },
    terminate: () => {
      worker.terminate()
      URL.revokeObjectURL(url)
    },
  }
}
