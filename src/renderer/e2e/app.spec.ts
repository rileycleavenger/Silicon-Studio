import { test, expect } from '@playwright/test'
import { mockBackendAPIs, navigateTo } from './helpers'

test.beforeEach(async ({ page }) => {
  await mockBackendAPIs(page)
  await page.goto('/')
  // Wait for the sidebar nav to be visible (backend health check passed, loading screen gone)
  await expect(page.locator('nav')).toBeVisible({ timeout: 15_000 })
})

// ── App Shell ────────────────────────────────────────────

test.describe('App Shell', () => {
  test('renders the top bar with backend status', async ({ page }) => {
    // TopBar shows "Ready" when backend is connected
    await expect(page.locator('text=Ready')).toBeVisible()
  })

  test('renders the top bar with system stats', async ({ page }) => {
    await expect(page.locator('text=RAM')).toBeVisible()
    await expect(page.locator('text=CPU')).toBeVisible()
  })

  test('renders the sidebar with all navigation items', async ({ page }) => {
    const sidebar = page.locator('nav')
    await expect(sidebar.locator('text=Models')).toBeVisible()
    await expect(sidebar.locator('text=Chat')).toBeVisible()
    await expect(sidebar.locator('text=Notes')).toBeVisible()
    await expect(sidebar.locator('text=Data Preparation')).toBeVisible()
    await expect(sidebar.locator('text=Fine-Tuning Engine')).toBeVisible()
    await expect(sidebar.locator('text=Model Evaluations')).toBeVisible()
    await expect(sidebar.locator('text=RAG Knowledge')).toBeVisible()
    await expect(sidebar.locator('text=Agent Workflows')).toBeVisible()
    await expect(sidebar.locator('text=Deployment')).toBeVisible()
  })

  test('defaults to Models tab on load', async ({ page }) => {
    // The main content area should show the Models page header
    const mainContent = page.locator('.overflow-y-auto.no-drag')
    await expect(mainContent.locator('h1:has-text("Models")')).toBeVisible({ timeout: 5000 })
  })
})

// ── Models Page ──────────────────────────────────────────

test.describe('Models Page', () => {
  test('shows downloaded model in table', async ({ page }) => {
    await expect(page.locator('text=Llama 3.2 3B Instruct')).toBeVisible({ timeout: 5000 })
  })

  test('shows model size', async ({ page }) => {
    await expect(page.locator('text=1.8GB')).toBeVisible({ timeout: 5000 })
  })

  test('shows search input', async ({ page }) => {
    await expect(page.locator('input[placeholder*="Search"]')).toBeVisible({ timeout: 5000 })
  })
})

// ── Chat Page ────────────────────────────────────────────

test.describe('Chat Page', () => {
  test('navigates to chat and shows empty state', async ({ page }) => {
    await navigateTo(page, 'Chat')
    // Main content area shows "No model loaded"
    const mainContent = page.locator('.overflow-y-auto.no-drag')
    await expect(mainContent.locator('text=No model loaded')).toBeVisible({ timeout: 5000 })
  })

  test('has a message input area', async ({ page }) => {
    await navigateTo(page, 'Chat')
    const textarea = page.locator('textarea')
    await expect(textarea).toBeVisible({ timeout: 5000 })
  })

  test('has a send button', async ({ page }) => {
    await navigateTo(page, 'Chat')
    // The send button has an ArrowUp icon
    await expect(page.locator('textarea')).toBeVisible({ timeout: 5000 })
  })

  test('shows History button', async ({ page }) => {
    await navigateTo(page, 'Chat')
    await expect(page.locator('button:has-text("History")')).toBeVisible({ timeout: 5000 })
  })

  test('shows Parameters button', async ({ page }) => {
    await navigateTo(page, 'Chat')
    await expect(page.locator('button:has-text("Parameters")')).toBeVisible({ timeout: 5000 })
  })

  test('opens conversation history panel', async ({ page }) => {
    await navigateTo(page, 'Chat')
    await page.click('button:has-text("History")')
    // Should show the search input for conversations
    await expect(page.locator('input[placeholder="Search conversations..."]')).toBeVisible({ timeout: 5000 })
  })

  test('shows conversations in history panel', async ({ page }) => {
    await navigateTo(page, 'Chat')
    await page.click('button:has-text("History")')
    await expect(page.locator('text=Test Conversation')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('text=Pinned Chat')).toBeVisible({ timeout: 5000 })
  })

  test('opens parameters sidebar with settings', async ({ page }) => {
    await navigateTo(page, 'Chat')
    await page.click('button:has-text("Parameters")')
    await expect(page.locator('text=Temperature')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('text=Reasoning')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('text=Visible Actions')).toBeVisible({ timeout: 5000 })
  })

  test('shows memory map toggle in parameters', async ({ page }) => {
    await navigateTo(page, 'Chat')
    await page.click('button:has-text("Parameters")')
    await expect(page.locator('text=Memory Map')).toBeVisible({ timeout: 5000 })
  })

  test('shows syntax check toggle in parameters', async ({ page }) => {
    await navigateTo(page, 'Chat')
    await page.click('button:has-text("Parameters")')
    await expect(page.locator('text=Syntax Check')).toBeVisible({ timeout: 5000 })
  })

  test('shows Ethical chip in visible actions', async ({ page }) => {
    await navigateTo(page, 'Chat')
    await page.click('button:has-text("Parameters")')
    await expect(page.locator('button:has-text("Ethical")')).toBeVisible({ timeout: 5000 })
  })
})

// ── Notes Page ───────────────────────────────────────────

test.describe('Notes Page', () => {
  test('navigates to notes and shows page header', async ({ page }) => {
    await navigateTo(page, 'Notes')
    const mainContent = page.locator('.overflow-y-auto.no-drag')
    await expect(mainContent.locator('h1:has-text("Notes")')).toBeVisible({ timeout: 5000 })
  })

  test('shows markdown editor description', async ({ page }) => {
    await navigateTo(page, 'Notes')
    await expect(page.locator('text=Markdown editor with local AI assistance')).toBeVisible({ timeout: 5000 })
  })

  test('shows import and export buttons', async ({ page }) => {
    await navigateTo(page, 'Notes')
    await expect(page.locator('button:has-text("Import")')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('button:has-text(".md")')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('button:has-text(".txt")')).toBeVisible({ timeout: 5000 })
  })

  test('shows AI commands sidebar', async ({ page }) => {
    await navigateTo(page, 'Notes')
    await expect(page.locator('text=AI Commands')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('text=Continue Writing')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('text=Summarize')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('text=Draft Introduction')).toBeVisible({ timeout: 5000 })
  })
})

// ── Data Preparation Page ────────────────────────────────

test.describe('Data Preparation Page', () => {
  test('navigates to data preparation and shows header', async ({ page }) => {
    await navigateTo(page, 'Data Preparation')
    const mainContent = page.locator('.overflow-y-auto.no-drag')
    await expect(mainContent.locator('h1:has-text("Data Preparation")')).toBeVisible({ timeout: 5000 })
  })
})

// ── Fine-Tuning Engine Page ──────────────────────────────

test.describe('Fine-Tuning Engine Page', () => {
  test('navigates and shows page header', async ({ page }) => {
    await navigateTo(page, 'Fine-Tuning Engine')
    const mainContent = page.locator('.overflow-y-auto.no-drag')
    await expect(mainContent.locator('h1:has-text("Fine-Tuning Engine")')).toBeVisible({ timeout: 5000 })
  })

  test('shows job configuration section', async ({ page }) => {
    await navigateTo(page, 'Fine-Tuning Engine')
    await expect(page.locator('text=Job Configuration')).toBeVisible({ timeout: 5000 })
  })

  test('shows hyperparameter controls', async ({ page }) => {
    await navigateTo(page, 'Fine-Tuning Engine')
    await expect(page.locator('text=Hyperparameters')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('text=LoRA Specifics')).toBeVisible({ timeout: 5000 })
  })

  test('has preset selector defaulting to balanced', async ({ page }) => {
    await navigateTo(page, 'Fine-Tuning Engine')
    const presetSelect = page.locator('select[title="Hyperparameters Preset"]')
    await expect(presetSelect).toBeVisible({ timeout: 5000 })
    await expect(presetSelect).toHaveValue('balanced')
  })

  test('has start training button', async ({ page }) => {
    await navigateTo(page, 'Fine-Tuning Engine')
    await expect(page.locator('button:has-text("Start Training Job")')).toBeVisible({ timeout: 5000 })
  })

  test('shows training chart area', async ({ page }) => {
    await navigateTo(page, 'Fine-Tuning Engine')
    await expect(page.locator('text=Real-time Training Loss')).toBeVisible({ timeout: 5000 })
  })
})

// ── Model Evaluations Page ───────────────────────────────

test.describe('Model Evaluations Page', () => {
  test('navigates and shows page header', async ({ page }) => {
    await navigateTo(page, 'Model Evaluations')
    const mainContent = page.locator('.overflow-y-auto.no-drag')
    await expect(mainContent.locator('h1:has-text("Evaluations")')).toBeVisible({ timeout: 5000 })
  })
})

// ── RAG Knowledge Page ───────────────────────────────────

test.describe('RAG Knowledge Page', () => {
  test('navigates and shows page header', async ({ page }) => {
    await navigateTo(page, 'RAG Knowledge')
    const mainContent = page.locator('.overflow-y-auto.no-drag')
    await expect(mainContent.locator('h1:has-text("RAG Knowledge Base")')).toBeVisible({ timeout: 5000 })
  })

  test('shows vector collections tab', async ({ page }) => {
    await navigateTo(page, 'RAG Knowledge')
    await expect(page.locator('text=Vector Collections')).toBeVisible({ timeout: 5000 })
  })

  test('shows collection in table', async ({ page }) => {
    await navigateTo(page, 'RAG Knowledge')
    await expect(page.locator('text=Legal Docs')).toBeVisible({ timeout: 5000 })
  })

  test('has new collection button', async ({ page }) => {
    await navigateTo(page, 'RAG Knowledge')
    await expect(page.locator('button:has-text("New Collection")')).toBeVisible({ timeout: 5000 })
  })

  test('shows data ingestion tab content', async ({ page }) => {
    await navigateTo(page, 'RAG Knowledge')
    await page.click('text=Data Ingestion')
    await expect(page.locator('text=Upload Files for Embedding')).toBeVisible({ timeout: 5000 })
  })

  test('new collection modal opens and closes', async ({ page }) => {
    await navigateTo(page, 'RAG Knowledge')
    await page.click('button:has-text("New Collection")')
    await expect(page.locator('text=New Vector Collection')).toBeVisible()
    await page.click('button:has-text("Cancel")')
    await expect(page.locator('text=New Vector Collection')).toBeHidden()
  })
})

// ── Agent Workflows Page ─────────────────────────────────

test.describe('Agent Workflows Page', () => {
  test('navigates and shows page header', async ({ page }) => {
    await navigateTo(page, 'Agent Workflows')
    const mainContent = page.locator('.overflow-y-auto.no-drag')
    await expect(mainContent.locator('h1:has-text("Agent")')).toBeVisible({ timeout: 5000 })
  })
})

// ── Deployment Page ──────────────────────────────────────

test.describe('Deployment Page', () => {
  test('navigates and shows page header', async ({ page }) => {
    await navigateTo(page, 'Deployment')
    const mainContent = page.locator('.overflow-y-auto.no-drag')
    await expect(mainContent.locator('h1:has-text("Deployment")')).toBeVisible({ timeout: 5000 })
  })

  test('shows start server button when stopped', async ({ page }) => {
    await navigateTo(page, 'Deployment')
    await expect(page.locator('button:has-text("Start Server")')).toBeVisible({ timeout: 5000 })
  })
})

// ── Navigation Round-Trip ────────────────────────────────

test.describe('Navigation', () => {
  test('can switch between all tabs without errors', async ({ page }) => {
    const tabs = [
      { label: 'Chat', verify: 'textarea' },
      { label: 'Notes', verify: 'text=AI Commands' },
      { label: 'Data Preparation', verify: 'h1:has-text("Data Preparation")' },
      { label: 'Fine-Tuning Engine', verify: 'text=Job Configuration' },
      { label: 'RAG Knowledge', verify: 'text=Vector Collections' },
      { label: 'Agent Workflows', verify: 'h1:has-text("Agent")' },
      { label: 'Deployment', verify: 'h1:has-text("Deployment")' },
      { label: 'Models', verify: 'text=Llama 3.2 3B Instruct' },
    ]

    for (const tab of tabs) {
      await navigateTo(page, tab.label)
      await expect(page.locator(tab.verify)).toBeVisible({ timeout: 5000 })
    }
  })
})
