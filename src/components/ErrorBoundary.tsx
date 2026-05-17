import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="h-screen flex items-center justify-center"
          style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
        >
          <div className="text-center max-w-md px-6">
            <div
              className="text-3xl mb-4 mx-auto w-16 h-16 flex items-center justify-center rounded-full"
              style={{ background: 'rgba(239,68,68,0.1)' }}
            >
              ⚠️
            </div>
            <h2 className="text-lg font-semibold mb-2">应用出错了</h2>
            <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
              {this.state.error?.message || '发生了未知错误'}
            </p>
            <button
              onClick={this.handleReset}
              className="px-4 py-2 text-sm font-medium rounded-lg cursor-pointer transition-colors"
              style={{ background: 'var(--accent)', color: '#fff', border: 'none' }}
            >
              重试
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
