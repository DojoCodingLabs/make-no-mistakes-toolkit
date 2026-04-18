---
description: Launch a Qt-based visual previewer for test-suite.json files. Auto-detects the suite in the current project, ensures PySide6 is installed, and opens an interactive table with filtering, detail pane, and CSV export. Accepts an optional path as $ARGUMENTS.
priority: 30
---

# /e2e-test-preview — TestSprite Suite Visual Previewer

You are a test suite visualization helper. Your job is to find or receive a `test-suite.json`, ensure the Python Qt previewer script exists and dependencies are installed, then launch the GUI.

## Input

**Suite path:** `$ARGUMENTS`

If `$ARGUMENTS` is empty, search for `test-suite.json` in this order:
1. `./test-suite.json`
2. `./gherkin/test-suite.json`
3. `./e2e/test-suite.json`
4. `./tests/e2e/test-suite.json`

If none found, ask:

> Where is your test-suite.json? Provide the path.

If `$ARGUMENTS` is a file path, use it directly.

## Execution Steps

### Step 1: Resolve the suite path

```bash
SUITE_PATH="${resolved_path}"
SUITE_DIR="$(dirname "$SUITE_PATH")"
```

Verify the file exists and is valid JSON with `python3 -c "import json; json.load(open('$SUITE_PATH'))"`.

### Step 2: Ensure the preview script exists

Check if `${SUITE_DIR}/scripts/preview-suite.py` exists. If it does, use it as-is.

If it does NOT exist, create the directory and generate it from the embedded template (see below).

**IMPORTANT:** Always read the existing script first if it exists — it may have project-specific customizations. Only generate from template if the file is completely missing.

### Step 3: Ensure PySide6 is installed

```bash
python3 -c "import PySide6" 2>/dev/null
```

If that fails, install it:

```bash
pip install PySide6 --quiet
```

If pip install also fails, tell the user:

> PySide6 is required but could not be installed automatically.
> Try: `pip install --user PySide6` or `pipx install PySide6`

### Step 4: Launch the previewer

Run the script in the background so the user can continue working:

```bash
cd "${SUITE_DIR}" && python3 scripts/preview-suite.py "${SUITE_PATH}" &
```

Report to the user:

> Previewer launched for `{SUITE_PATH}` ({N} test cases).
> The Qt window should appear shortly. Close it when done.

### Step 5: Quick stats

Parse the JSON and print a summary line:

```
{total} cases | {use_cases} use cases | {features} features | Coverage: {happy}H {error}E {edge}EC {security}S {hitl}HITL {perf}P
```

---

## Preview Script Template

Only generate this file if `${SUITE_DIR}/scripts/preview-suite.py` does NOT already exist.

The script is a PySide6 (Qt6) desktop application that:
- Loads test-suite.json and displays all test cases in a sortable table
- Columns: ID, Use Case, Step, Title, Agent Persona, Coverage, Runners, Priority
- Color-codes rows by coverage type (green=happy, blue=HITL, red=security, yellow=edge, orange=error, gray=perf)
- Provides checkable combo-box filters on every column (multi-select)
- Shows a detail pane with Gherkin, test questions (ES/EN), runner commands, and metadata
- Exports filtered results to CSV
- Uses a hybrid dark-chrome / light-content Catppuccin-inspired palette

Generate the script by reading the reference implementation at:
- `gherkin/scripts/preview-suite.py` (if it exists in the current project)
- Or from any sibling project that has one

If no reference exists anywhere, generate the full script from first principles following these specs:
- PySide6 with Fusion style
- QMainWindow with QSplitter (table left, detail right)
- MultiColumnFilterProxy for column-level filtering
- CheckableComboBox for multi-select dropdowns
- COVERAGE_COLORS dict for row backgrounds
- CSV export via QFileDialog
- Status bar showing visible/total counts per use case
- Window title: "Test Suite Preview — {project} ({total} cases)"

The script must accept an optional CLI argument for the JSON path, defaulting to `test-suite.json` in the current directory.

---

## Usage

```bash
claude /make-no-mistakes:e2e-test-preview                          # Auto-detect in current project
claude /make-no-mistakes:e2e-test-preview gherkin/test-suite.json  # Explicit path
claude /make-no-mistakes:e2e-test-preview ~/other-project/e2e/test-suite.json  # Cross-project
```
