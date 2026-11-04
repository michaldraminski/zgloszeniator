import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const invitationPath = path.resolve(currentDirectory, '../../../fixtures/synthetic/invitation.lef');
const previousEntryPath = path.resolve(currentDirectory, '../../../fixtures/synthetic/previous-entry.lef');
const resultsPath = path.resolve(currentDirectory, '../../../fixtures/synthetic/results.lef');

async function selectFiles(
  page: import('@playwright/test').Page,
  label: string,
  filePaths: string[],
): Promise<void> {
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByText(label, { exact: true }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(filePaths);
}

test('creates a submission and reuses it as history for the next meet', async ({ browser, page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('status').filter({ hasText: 'Zmiany zapisane lokalnie' })).toBeVisible();

  await selectFiles(page, 'Wybierz zaproszenie (.lxf lub .lef)', [invitationPath]);
  await expect(page.getByRole('heading', { name: 'Synthetic Meet' })).toBeVisible();

  await selectFiles(page, 'Dodaj zgłoszenie, wyniki lub zaproszenie', [previousEntryPath, resultsPath]);
  await expect(page.getByText('Wczytane pliki historyczne')).toBeVisible();

  const athleteCheckbox = page.getByRole('checkbox', { name: /Swimmer, Example \(2012\)/ });
  await expect(athleteCheckbox).toBeVisible();
  await athleteCheckbox.check();

  const timeInput = page.getByRole('textbox', { name: 'Czas dla 50m SF — Swimmer' });
  await expect(timeInput).toHaveValue('00:29.90');
  await expect(page.getByText(/Wynik · results\.lef/)).toBeVisible();
  await timeInput.fill('1:02.34');

  await page.getByLabel('Nazwa klubu').fill('Synthetic Club');
  const firstDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Pobierz plik .lxf' }).click();
  const download = await firstDownloadPromise;
  expect(download.suggestedFilename()).toContain('Synthetic Club');
  const firstSubmissionPath = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(firstSubmissionPath);

  const nextInvitationXml = (await readFile(invitationPath, 'utf8'))
    .replaceAll('Synthetic Meet', 'Synthetic Next Meet')
    .replaceAll('synthetic-event-1', 'next-event-1')
    .replaceAll('synthetic-relay-event', 'next-relay-event');
  const nextInvitationPath = testInfo.outputPath('next-invitation.lef');
  await import('node:fs/promises').then(({ writeFile }) => writeFile(nextInvitationPath, nextInvitationXml));

  const nextContext = await browser.newContext();
  const nextPage = await nextContext.newPage();
  try {
    await nextPage.goto('/');
    await expect(nextPage.getByRole('status').filter({ hasText: 'Zmiany zapisane lokalnie' })).toBeVisible();
    await selectFiles(nextPage, 'Wybierz zaproszenie (.lxf lub .lef)', [nextInvitationPath]);
    await expect(nextPage.getByRole('heading', { name: 'Synthetic Next Meet' })).toBeVisible();

    await selectFiles(nextPage, 'Dodaj zgłoszenie, wyniki lub zaproszenie', [firstSubmissionPath]);
    await expect(nextPage.getByText('Poprzednie zgłoszenie —', { exact: false })).toBeVisible();
    const nextAthleteCheckbox = nextPage.getByRole('checkbox', { name: /Swimmer, Example \(2012\)/ });
    await expect(nextAthleteCheckbox).toBeVisible();
    await nextAthleteCheckbox.check();

    const nextTimeInput = nextPage.getByRole('textbox', { name: 'Czas dla 50m SF — Swimmer' });
    await expect(nextTimeInput).toHaveValue('01:02.34');
    await expect(nextPage.getByText(/Poprzednie zgłoszenie ·/)).toBeVisible();
    await nextPage.getByLabel('Nazwa klubu').fill('Synthetic Club');
    const nextDownloadPromise = nextPage.waitForEvent('download');
    await nextPage.getByRole('button', { name: 'Pobierz plik .lxf' }).click();
    const nextDownload = await nextDownloadPromise;
    expect(nextDownload.suggestedFilename()).toContain('Synthetic Club');
  } finally {
    await nextContext.close();
  }
});
