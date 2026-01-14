# Works AI GitHub Action

GitHub Action for syncing repository activity with Works work tracking.

## Features

- **Auto-detect Work IDs** - Extracts work IDs from commit messages and PR titles
- **Auto-complete on Merge** - Marks work as complete when PRs are merged
- **Progress Tracking** - Reports progress from CI/CD events
- **AGENTS.md Generation** - Retrieves work specifications for automation

## Usage

### Basic Sync (Recommended)

Add to `.github/workflows/works.yml`:

```yaml
name: Works Sync

on:
  push:
    branches: [main, develop]
  pull_request:
    types: [opened, synchronize, closed]

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: Robincyriac1/works-github-action@v1
        with:
          api-key: ${{ secrets.WORKS_API_KEY }}
          action: sync
```

### Mark Complete on PR Merge

```yaml
name: Complete Work on Merge

on:
  pull_request:
    types: [closed]

jobs:
  complete:
    if: github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    steps:
      - uses: Robincyriac1/works-github-action@v1
        with:
          api-key: ${{ secrets.WORKS_API_KEY }}
          action: complete
          summary: 'Merged PR #${{ github.event.pull_request.number }}'
```

### Report Build Progress

```yaml
name: Build Progress

on: push

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Report Start
        uses: Robincyriac1/works-github-action@v1
        with:
          action: progress
          work-id: ${{ github.event.head_commit.message }}
          progress: 25
          summary: 'Build started'

      - name: Build
        run: npm run build

      - name: Report Complete
        uses: Robincyriac1/works-github-action@v1
        with:
          action: progress
          progress: 100
          summary: 'Build complete'
```

### Get AGENTS.md for Issue

```yaml
name: Setup Agent Context

on:
  issues:
    types: [labeled]

jobs:
  setup:
    if: github.event.label.name == 'ai-agent'
    runs-on: ubuntu-latest
    steps:
      - uses: Robincyriac1/works-github-action@v1
        id: works
        with:
          action: init
          work-id: ${{ github.event.issue.number }}

      - name: Create AGENTS.md
        run: |
          echo "${{ steps.works.outputs.agents-md }}" > AGENTS.md
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `server-url` | Works server URL | No | `https://api.works.select` |
| `api-key` | API key for authentication | No | |
| `work-id` | Work ID (auto-detected if not provided) | No | |
| `action` | Action: `sync`, `complete`, `progress`, `init` | Yes | `sync` |
| `progress` | Progress percentage (for progress action) | No | |
| `summary` | Summary text | No | |
| `files` | Comma-separated list of modified files | No | |

## Outputs

| Output | Description |
|--------|-------------|
| `work-id` | The work ID that was updated |
| `status` | The new status of the work |
| `agents-md` | Generated AGENTS.md content (for init action) |

## Work ID Detection

The action automatically detects work IDs from:

1. **Commit messages**: `[cmj2r7f3e0029f7m0cgak7ccr] Fix bug`
2. **PR titles**: `[cmj2r7f3e0029f7m0cgak7ccr] Add feature`
3. **PR body**: Contains `[WORK-cmj2r7f3e0029f7m0cgak7ccr]`

Use the commit message format recommended by Works:
```
[WORK-ID] Brief description

- Detail 1
- Detail 2
```

## License

MIT
