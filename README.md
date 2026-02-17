# Tauri + React + Typescript

This template should help get you started developing with Tauri, React and Typescript in Vite.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## Clean Install & Run (macOS)


### 1) Install system prerequisites

```bash
brew install bun ollama poppler
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

> **Note:** `poppler` provides the `pdftoppm` command for PDF-to-image conversion (required for PDF OCR support).

Then restart terminal (or run `source "$HOME/.cargo/env"`).

### 2) Verify tools

```bash
bun --version
node -v
npm -v
rustc --version
cargo --version
ollama --version
```

### 3) Clone and enter repo

```bash
git clone <your-repo-url> invoices
cd invoices
```

### 4) Clean previous artifacts (true clean install)

```bash
rm -rf node_modules dist
rm -rf sidecar/node_modules
```

Optional: reset local app DB/settings too (destructive):

```bash
rm -rf "$HOME/Library/Application Support/com.michalhonc.invoices"
```

### 5) Install JS dependencies

```bash
npm install
cd sidecar && bun install && cd ..
```

### 6) Prepare Ollama model

```bash
ollama serve
```

Open a second terminal in repo root and run:

```bash
ollama pull gemma3:12b
```

### 7) Run the app (one command)

From repo root:

```bash
npm run dev
```

This starts:
- `ollama serve`
- sidecar backend (`bun`)
- Tauri desktop app (`tauri dev`)

### 8) First app setup

In app **Nastavení**, fill at least:
- `DIČ`
- `Číslo finančního úřadu`
- `iCloud Drive cesta k fakturám`

Default invoices folder example:

```text
~/Library/Mobile Documents/com~apple~CloudDocs/Invoices
```

### 9) Quick health check

- Sidebar should show: `Ollama připojeno`
- Click `Skenovat složky`
- Open current month and test upload/drag-drop

### Troubleshooting

- If you get `ollama: command not found` after install:

1. Ensure Homebrew is on PATH:

```bash
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"
```

2. Reinstall/check Ollama:

```bash
brew install ollama
which ollama
ollama --version
```

3. If still missing, install Ollama Desktop app from `https://ollama.com/download`, open it once, then retry `ollama serve`.

- If Ollama is already running and `npm run dev` tries to start it again, stop old Ollama process and retry.
- If Tauri fails to launch after fresh Rust install, run once:

```bash
rustup update
```

- If dependencies look corrupted, repeat steps 4 and 5.
