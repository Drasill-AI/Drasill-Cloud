# Drasill Finance

A modern desktop application for lending deal flow management and underwriting, built with Electron, React, and TypeScript.

## Features

### Document Management
- **File Explorer**: Browse local or OneDrive workspace folders with a tree view
- **PDF Viewer**: Full PDF viewing with search, zoom, and page navigation
- **Word Document Support**: View .docx files with proper formatting
- **Monaco Editor**: View and edit text files with syntax highlighting
- **Tabbed Interface**: Open multiple files in tabs with state preservation

### Deal Pipeline Management
- **Deal Tracking**: Create, update, and manage lending deals through pipeline stages
- **Activity Logging**: Track calls, emails, meetings, notes, and documents for each deal
- **Pipeline Analytics**: Visual dashboard with deal counts, values, and stage breakdowns
- **CSV Import/Export**: Bulk import deals from CSV or export your pipeline

### AI-Powered Assistant
- **RAG-based Search**: Hybrid BM25 + vector search across indexed documents
- **Natural Language Interface**: Ask questions about your deals and documents
- **Citation Support**: AI responses include clickable citations to source documents
- **Tool Calling**: AI can add activities, update deal stages, and retrieve schematics

### Cloud Integration
- **OneDrive Support**: Connect to OneDrive and work with cloud documents
- **Workspace Persistence**: Automatically restores your last workspace on startup

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
- OpenAI API key (for AI features)

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
| `Ctrl/Cmd + J` | Toggle Bottom Panel |
| `Ctrl/Cmd + /` | Focus Chat Input |
| `Ctrl/Cmd + Tab` | Next Tab |
| `Ctrl/Cmd + Shift + Tab` | Previous Tab |
| `Ctrl/Cmd + 1-9` | Switch to Tab by Number |

## Architecture

### IPC Communication

The renderer process never directly accesses the filesystem. All file operations go through IPC:

- `selectWorkspace()` - Opens folder picker dialog
- `readDir(path)` - Lists directory contents
- `readFile(path)` - Reads file content
- `stat(path)` - Gets file/directory stats
- `createFile()`, `createFolder()`, `renameFile()` - File operations
- OneDrive APIs for cloud document access

### State Management

Uses Zustand for lightweight state management:
- Workspace path and tree
- Open tabs and active tab
- File contents cache
- View states for Monaco editor
- Deal and activity data
- RAG indexing state

### Security

- `contextIsolation: true`
- `nodeIntegration: false`
- All filesystem access through preload scripts

## License

MIT
