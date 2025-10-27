# Directus Migration Tool

<p align="left">
  <a href="#"><img alt="License" src="https://img.shields.io/badge/License-MIT-green.svg" /></a>
  <a href="#"><img alt="React" src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white" /></a>
  <a href="#"><img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white" /></a>
  <a href="#"><img alt="Vite" src="https://img.shields.io/badge/Vite-4.x-646CFF?logo=vite&logoColor=white" /></a>
  <a href="#"><img alt="Directus" src="https://img.shields.io/badge/Directus-Compatible-263238?logo=directus&logoColor=white" /></a>
</p>

**Standalone web application** for migrating data between Directus instances. No need to install extensions - works with any Directus setup including Directus Cloud.

> 🚀 **Transformed from Directus Module Extension to Standalone App** - Reuses 90%+ of the original codebase while providing cross-platform compatibility.

## Features ✨

- **Directus-to-Directus import 🔁**: Transfer collection data from another Directus instance into your current project
- **Preflight permission check ✅**: Test collection access before importing
- **Token validation 🛡️**: Validate admin token against the source server
- **History management 🕘**: Save and reuse domain and token inputs (localStorage)
- **Real-time status 📊**: Inline progress and concise error messages
- **Per-collection import 🧩**: Import items for a specific collection
- **Import limit option ⏱️**: Optionally limit how many items to import per run
- **File field support 🖼️**: Automatically copies single-file fields (by UUID or object) and reuses or uploads as needed
- **ID-preserving import 🔐**: Attempts to update items by the same `id`; if missing, creates with the same `id` using REST upsert to avoid duplicates
- **ZIP export/import 📦**: Export a collection to a ZIP and re-import elsewhere, including `translations.*`
- **Deep translations import 🌍**: Imports `translations` via deep writes with `deep=true`
- **Folder auto-creation 📁**: Files are placed in a collection-named folder, created if missing

### At a glance

<p align="left">
  <img alt="Import" title="Import" src="https://img.shields.io/badge/Import-From%20Directus-5E81F4?style=for-the-badge&logo=download" />
  <img alt="Validate" title="Validate Token" src="https://img.shields.io/badge/Validate-Token-27AE60?style=for-the-badge&logo=vercel" />
  <img alt="Check" title="Preflight Check" src="https://img.shields.io/badge/Preflight-Check-F39C12?style=for-the-badge&logo=checkmarx" />
</p>

## Installation 📦

### Development Setup

```bash
# Clone the repository
git clone <repository-url>
cd directus-migration-tool

# Install dependencies
npm install

# Start development server
npm run dev
```

### Production Build

```bash
# Build for production
npm run build

# Preview production build
npm run preview
```

### Deploy to Hosting

Deploy the `dist/` folder to any static hosting service:
- **Vercel**: Zero-config deployment
- **Netlify**: Drag & drop the dist folder
- **GitHub Pages**: Push to gh-pages branch
- **Self-hosted**: Any web server

## Usage ▶️

### Quick start ⚡

1. **Open the web application** in your browser (http://localhost:3000 for development)
2. **Enter Source Directus** - API URL and admin token for the source instance
3. **Enter Target Directus** - API URL and admin token for the destination instance
4. **Click "Connect & Validate"** - Test both connections and discover collections
3. (Optional) Click “Validate Token” to check the token, or “Test Collections” to quickly verify collection permissions.
4. (Optional) Enter a limit to cap the number of items imported per collection.
5. For each collection you want to import, click “Import from another Directus”.
6. Monitor the import progress and review the status/output. Any failed items will be summarized in the console.
7. (Optional) Use the "History" feature to quickly reuse previously entered domains and tokens, or the "Clear History" options to remove them.

Notes:
- Provide the token as plain string (no need to prefix with "Bearer ").
- The module normalizes tokens internally.

### File importing 🖼️

- Supported fields:
  - Single-file fields referencing Directus files by UUID (string) or object with `id`
  - Array/many-file relations are skipped (logged as `file_copy_skip`)
  - Non-UUID strings are ignored as file IDs (prevents color values like `#FFFFFF` being treated as file references)
- Reuse vs copy:
  - If a target item already has a file in a field and it matches the source by checksum (preferred) or file size/type, the existing file is reused
  - ZIP import avoids uploading the same image when it already exists in Directus files
  - When reusing, the file may be patched to set `title` (from item title, if present) and move it into the target folder
- Upload behavior:
  - Source file metadata fetched from `/files/{id}`; binary fetched from `/assets/{id}`
  - Files are uploaded to the target via `/files` with `FormData` (`file`, optional `title`, `folder`)
  - Files are placed in a folder named after the collection; the folder is auto-created if missing
  - Title source: uses the item's `title` if available, otherwise first non-empty translation `title`
  - ZIP import infers MIME type from filename to prevent "Binary Data" files
  - ZIP import never uploads control files like `items.json` or any `.json` files
- Caching:
  - Per-run cache avoids re-uploading the same source file across multiple items
  - Per-item cache prevents duplicate uploads within the same item
- Update mapping (idempotent, optional):
  - If the `directus_sync_id_map` collection exists on the target, imports update existing items mapped by source `id`; otherwise new items are created
  - ZIP import also maintains this mapping to avoid duplicates on re-import
- Permissions required:
  - Source: read `/items/{collection}`, `/files/{id}`, `/assets/{id}`
  - Target: create/update `/items/{collection}`, `/files`, `/folders`, and (optionally) read/write `directus_sync_id_map`
- Error tolerance:
  - If a file copy fails, the item import continues and the field is left unchanged; details are logged as `file_copy_error`

### Configuration ⚙️

#### Domain settings 🌐
- Recent domains are stored locally for quick reuse.

#### Authentication 🔐
- **Admin token**: Required on the source Directus to READ the collections you import.
- **Token validation**: The module verifies token usability before import.

## Security considerations 🔒

- Admin tokens are stored locally in browser storage.
- Token validation ensures proper permissions.
- Clear history options are available for sensitive data.
- Secure API communication is enforced over HTTPS.
- Imported data is not sent to third-party services; all transfers are direct between your browser and the specified Directus instances.
- Only the collections and fields you select are accessed; no other data is read or modified.
- The module does not store or transmit your data outside your environment.
- For best security, use temporary admin tokens and clear history after use.

## Development 🧰

### Prerequisites

- Node.js >= 16
- Directus Extensions SDK (`@directus/extensions-sdk`)
- TypeScript
- [Directus CLI](https://docs.directus.io/cli/) (for building and linking extensions)
- npm (Node.js package manager)

### Setup

```bash
# Install dependencies
npm install

# Build for development
npm run build

# Watch for changes
npm run dev

# Link to Directus instance
npm run link
```

### Project Structure

```
src/
├── index.ts              # Module definition
├── module.vue            # Main Vue component
├── types.ts              # Shared types
├── utils/
│   └── apiHandlers.ts    # API logic for import, validation, and sync
└── shims.d.ts            # TypeScript declaration
```

### Building

```bash
# Production build
npm run build

# Development build with watch
npm run dev
```

## Configuration

No environment variables are required. Install and enable the module in your Directus instance per normal extension flow.

### Compatibility

- Directus host: >= 11.0.0 < 16.0.0
- `@directus/extensions-sdk` peer range: >= 11 < 16

## Troubleshooting 🛠️

### Common issues

1. **Token validation fails**
   - Ensure the token is valid and the API URL is reachable over HTTPS.

2. **403 Forbidden on a collection**
   - On the source Directus, grant the token’s role READ permission on that collection (and any related collections or files).
   - On the target Directus, ensure the role can UPDATE/CREATE with explicit `id` and that the collection accepts client-provided primary keys.

3. **History not saving**
   - Check browser storage permissions; clear cache if needed.


## License 📝

MIT License - see [LICENSE](LICENSE) file for details.

## Support 💬

For issues and questions:
- Create an issue on GitHub
- Check the documentation
- Review the troubleshooting section

## Changelog 📑

See [CHANGELOG.md](CHANGELOG.md) for version history and updates. Notable:

- 1.1.0: Reworked for Directus v11+, import from Directus-only; removed legacy API import and export flows; improved token handling and preflight checks.

## Notes

- Export-to-file functionality is not currently included in this module.