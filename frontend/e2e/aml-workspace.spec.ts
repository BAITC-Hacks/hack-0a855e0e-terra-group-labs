import { expect, test } from '@playwright/test'

const distributor = '100000003684369100'
const boundary = '100000000404740100'

async function search(page: import('@playwright/test').Page, gid: string) {
  await page.getByTestId('gid-search').fill(gid)
  await page.getByTestId('gid-search').press('Enter')
  await expect(page.getByTestId('node-detail')).toContainText(`GID ${gid}`)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Приоритеты проверки' })).toBeVisible()
})

test('точный GID открывает роль и детерминированное объяснение', async ({ page }) => {
  await search(page, distributor)
  await expect(page.getByTestId('node-detail')).toContainText('Почему эта роль')
  await expect(page.getByTestId('node-detail')).toContainText('Приоритет проверки')
})

test('поток позволяет перейти к контрагенту', async ({ page }) => {
  await search(page, distributor)
  await page.getByRole('button', { name: /Открыть поток/ }).first().click()
  await expect(page.getByTestId('flow-detail')).toBeVisible()
  const before = await page.getByTestId('node-detail').locator('h2').textContent()
  await page.getByRole('button', { name: 'Открыть отправителя' }).click()
  await expect(page.getByTestId('node-detail').locator('h2')).not.toHaveText(before ?? '')
  await expect(page.getByRole('button', { name: '← К потоку GID' })).toBeVisible()
  await page.goBack()
  await expect(page.getByTestId('node-detail').locator('h2')).toHaveText(before ?? '')
  await expect(page.getByTestId('flow-detail')).toBeVisible()
  await page.getByRole('button', { name: 'Открыть получателя' }).click()
  await expect(page.getByRole('button', { name: '← К потоку GID' })).toBeVisible()
})

test('cluster filter обновляет граф и summary', async ({ page }) => {
  await page.getByLabel('Фильтр по кластеру').selectOption('1')
  await expect(page.getByRole('heading', { name: 'Кластер 1' })).toBeVisible()
  await expect(page.locator('.cluster-note')).toContainText('KZT внутри')
})

test('depth-4 boundary показана без terminal-утверждения', async ({ page }) => {
  await search(page, boundary)
  await expect(page.getByTestId('coverage-warning')).toContainText('граница наблюдения')
  await expect(page.getByTestId('node-detail')).not.toContainText('Кандидат в конечный узел')
})

test('discovery filters возвращают открываемые совпадения', async ({ page }) => {
  await page.getByRole('button', { name: 'Фильтры' }).click()
  await page.getByTestId('filter-role').selectOption('distributor')
  await page.getByTestId('filter-priority').fill('0.7')
  await page.getByTestId('apply-filters').click()
  const first = page.getByTestId('discovery-results').getByRole('button').first()
  await expect(first).toContainText('Распределитель')
  await first.click()
  await expect(page.getByTestId('node-detail')).toContainText('Распределитель')
})

test('Russian-first UI и cluster-level view доступны', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Сводная аналитика сети' })).toBeVisible()
  await page.getByTestId('cluster-view').click()
  await expect(page.getByRole('heading', { name: 'Структура кластеров' })).toBeVisible()
  await expect(page.getByTestId('cluster-detail')).toBeVisible()
})

test('81 стартовых клиента доступны отдельной очередью и отмечены в карточке', async ({ page }) => {
  await page.getByRole('button', { name: 'Стартовые 81' }).click()
  await expect(page.getByRole('heading', { name: 'Стартовые клиенты' })).toBeVisible()
  await expect(page.locator('.queue-row')).toHaveCount(81)
  await page.locator('.queue-row').first().click()
  await expect(page.getByTestId('node-detail')).toContainText('стартовый · ранее выявленный')
})

test('межкластерный поток открывает выделенное направление и долю seed', async ({ page }) => {
  await page.getByRole('button', { name: 'Межкластерные потоки' }).click()
  await page.locator('button.flow-table').first().click()
  await expect(page.getByTestId('cluster-flow-detail')).toContainText('выделен на графе')
  await expect(page.getByTestId('cluster-flow-detail')).toContainText('Отправитель — ранее выявленный клиент')
  await expect(page.getByLabel('Направленная сеть кластеров')).toBeVisible()
})

test('топ группы открывает кластер, а назад возвращает к межкластерному потоку', async ({ page }) => {
  await page.getByRole('button', { name: 'Кластеры', exact: true }).last().click()
  await page.locator('.cluster-leaders button').first().click()
  await expect(page.getByTestId('cluster-detail')).toBeVisible()
  await expect(page.getByLabel('Направленная сеть кластеров')).toBeVisible()
  await page.getByRole('button', { name: 'Межкластерные потоки' }).click()
  await page.locator('button.flow-table').first().click()
  const flow = page.getByTestId('cluster-flow-detail')
  await flow.getByRole('button', { name: 'Узлы отправителя' }).click()
  await expect(page.getByRole('button', { name: /К потоку К/ })).toBeVisible()
  await page.goBack()
  await expect(flow).toBeVisible()
  await flow.getByRole('button', { name: 'Узлы получателя' }).click()
  await expect(page.getByRole('button', { name: /К потоку К/ })).toBeVisible()
})

test('прямая связь со стартовым клиентом выделена в карточке', async ({ page }) => {
  const graph = await (await page.request.get('/api/graph')).json() as { nodes: { gid: string; is_seed: boolean }[]; edges: { src: string; dst: string }[] }
  const seed = new Set(graph.nodes.filter((node) => node.is_seed).map((node) => node.gid))
  const flow = graph.edges.find((edge) => seed.has(edge.src) && !seed.has(edge.dst))
  expect(flow).toBeDefined()
  await search(page, flow!.dst)
  await expect(page.locator('.seed-link-notice')).toContainText('прямая наблюдаемая связь')
  await expect(page.locator('.relation-row.seed-related').first()).toBeVisible()
})

test('AI помощник открывается рядом с доступным графом', async ({ page }) => {
  await page.getByRole('button', { name: 'AI помощник' }).click()
  await expect(page.getByTestId('assistant-panel')).toBeVisible()
  await expect(page.getByLabel('Направленная сеть транзакций')).toBeVisible()
  await expect(page.getByLabel('Вопрос по графу')).toBeVisible()
})
