# Claude Code Desktop

A native desktop GUI for Claude Code, powered by Tauri 2 + React 19.

## Features

- **Multi-session chat** — Create and switch between multiple conversations
- **Streaming responses** — Real-time streaming with SSE
- **Tool calling** — Bash, Read, Write, Glob, Grep, WebFetch, WebSearch
- **File explorer** — Browse project files in the right panel
- **Workspace awareness** — Set a project directory to give the AI full context
- **8 themes** — Ocean, Forest, Sunset, Purple, Cherry, Neon, Light, Sepia
- **Session persistence** — Conversations survive app restart

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Tauri 2 (Rust) |
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS |
| State | Zustand with persist middleware |
| API | DeepSeek (Anthropic-compatible) |
| Icons | Lucide React |

## Getting Started

### Prerequisites

- [Rust](https://rustup.rs/) (for building the Tauri shell)
- [pnpm](https://pnpm.io/) (package manager)

### Install & Run

```bash
pnpm install
pnpm tauri dev
```

### Build Installer

```bash
pnpm tauri build --debug
```

The MSI installer will be at `src-tauri/target/debug/bundle/msi/`.

## Configuration

API configuration is loaded from `~/.claude/settings.json`:

```json
{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "sk-your-key",
    "ANTHROPIC_BASE_URL": "https://api.deepseek.com/anthropic",
    "ANTHROPIC_MODEL": "deepseek-v4-flash"
  }
}
```

## License

MIT
