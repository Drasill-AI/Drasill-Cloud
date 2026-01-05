# Drasill Legal

A lightweight VS Code-like desktop application for legal case management and document analysis, built with Electron, React, and TypeScript.

## Features

- **File Explorer**: Browse workspace folders with a tree view
- **Monaco Editor**: View text and Markdown files with syntax highlighting
- **Tabbed Interface**: Open multiple files in tabs with scroll position preservation
- **PDF Viewer**: View and analyze legal documents
- **AI Assistant**: Chat interface for legal research and document analysis
- **Command Palette**: Quick access to commands (Ctrl/Cmd+P)

## Project Structure

```
/apps/desktop/
  /main         # Electron main process
  /preload      # Preload scripts (contextBridge)
  /renderer     # React frontend (Vite)
/packages/shared  # Shared types and utilities
```

## Prerequisites

- Node.js 18+ 
- npm 9+

## Installation

```bash
# Install all dependencies
npm install

# Build shared package
npm run build -w packages/shared
```

## Development

```bash
# Run in development mode with hot reload
npm run dev
```

This starts:
- Vite dev server on http://localhost:5173
- Electron app with hot reload

## Building

```bash
# Build all packages
npm run build
```

## Packaging

```bash
# Create installer for current platform
npm run package

# Create Windows installer
npm run package:win -w apps/desktop

# Create macOS installer
npm run package:mac -w apps/desktop
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + Shift + O` | Open Workspace Folder |
| `Ctrl/Cmd + P` | Command Palette |
| `Ctrl/Cmd + W` | Close Current Tab |

## Architecture

### IPC Communication

The renderer process never directly accesses the filesystem. All file operations go through IPC:

- `selectWorkspace()` - Opens folder picker dialog
- `readDir(path)` - Lists directory contents
- `readFile(path)` - Reads file content
- `stat(path)` - Gets file/directory stats

### State Management

Uses Zustand for lightweight state management:
- Workspace path and tree
- Open tabs and active tab
- File contents cache
- View states for Monaco editor

### Security

- `contextIsolation: true`
- `nodeIntegration: false`
- All filesystem access through preload scripts

## License

MIT
