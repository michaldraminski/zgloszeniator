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

  await selectFiles(page, 'Dodaj zgłoszenie, wyniki lub zaproszenie', [previousEntryPath]);
  await expect(page.getByText('Wczytane pliki historyczne')).toBeVisible();
  await expect(page.getByText(/Poprzednie zgłoszenie — previous-entry\.lef/)).toBeVisible();
  await selectFiles(page, 'Dodaj zgłoszenie, wyniki lub zaproszenie', [resultsPath]);
  await expect(page.getByText(/Poprzednie zgłoszenie — previous-entry\.lef/)).toBeVisible();
  await expect(page.getByText(/Wyniki — results\.lef/)).toBeVisible();
  await expect(page.getByText(/Czasy z poprzednich zgłoszeń: 1 · Ważne czasy z wyników: 1/)).toBeVisible();
  const athleteCheckbox = page.getByRole('checkbox', { name: /Swimmer, Example \(2012\)/ });
  await expect(athleteCheckbox).toBeVisible();
  await athleteCheckbox.check();
  const entryMinutesInput = page.getByRole('textbox', { name: 'Minuty — 50m SF — Swimmer, Example', exact: true });
  await expect(entryMinutesInput).toHaveValue('00');

  await page.getByRole('button', { name: 'Usuń z historii: results.lef' }).click();
  await expect(page.getByText(/Wyniki — results\.lef/)).toHaveCount(0);
  await expect(entryMinutesInput).toHaveValue('00');

  await selectFiles(page, 'Dodaj zgłoszenie, wyniki lub zaproszenie', [resultsPath]);
  await expect(page.getByText(/Wyniki — results\.lef/)).toBeVisible();

  const minutesInput = page.getByRole('textbox', { name: 'Minuty — 50m SF — Swimmer, Example', exact: true });
  const secondsInput = page.getByRole('textbox', { name: 'Sekundy — 50m SF — Swimmer, Example', exact: true });
  const centisecondsInput = page.getByRole('textbox', { name: 'Setne sekundy — 50m SF — Swimmer, Example', exact: true });
  await expect(minutesInput).toHaveValue('00');
  await expect(secondsInput).toHaveValue('29');
  await expect(centisecondsInput).toHaveValue('90');
  await expect(page.getByText(/Wynik · results\.lef/)).toBeVisible();
  await secondsInput.press('Home');
  await secondsInput.press('4');
  await expect(secondsInput).toHaveValue('49');
  await secondsInput.press('Home');
  await secondsInput.press('2');
  await expect(secondsInput).toHaveValue('29');
  await secondsInput.fill('77');
  await expect(page.locator('.time-field').getByText('Uzupełnij poprawnie minuty, sekundy i setne sekundy.')).toBeVisible();
  await secondsInput.fill('02');
  await minutesInput.fill('1');
  await centisecondsInput.fill('34');
  await expect(page.locator('.time-field').getByText('Uzupełnij poprawnie minuty, sekundy i setne sekundy.')).toHaveCount(0);

  await page.getByLabel('Nazwa klubu').fill('Synthetic Club');
  await page.getByRole('link', { name: 'Podsumowanie' }).click();
  await expect(page).toHaveURL(/#submission-summary$/);
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('region', { name: 'Podsumowanie zgłoszenia' })).toBeVisible();
  await expect(page.locator('.app-header')).not.toBeVisible();
  const pdf = await page.pdf({ printBackground: true });
  const pdfText = new TextDecoder('latin1').decode(pdf);
  const pdfPages = [...pdfText.matchAll(/\/Type\s*\/Page\b/g)].length;
  expect(pdfPages).toBe(1);
  await page.emulateMedia({ media: 'screen' });
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

    const nextMinutesInput = nextPage.getByRole('textbox', { name: 'Minuty — 50m SF — Swimmer, Example', exact: true });
    const nextSecondsInput = nextPage.getByRole('textbox', { name: 'Sekundy — 50m SF — Swimmer, Example', exact: true });
    const nextCentisecondsInput = nextPage.getByRole('textbox', { name: 'Setne sekundy — 50m SF — Swimmer, Example', exact: true });
    await expect(nextMinutesInput).toHaveValue('01');
    await expect(nextSecondsInput).toHaveValue('02');
    await expect(nextCentisecondsInput).toHaveValue('34');
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

test('starts a new meet while preserving imported history', async ({ browser }, testInfo) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto('/');
    await expect(page.getByRole('status').filter({ hasText: 'Zmiany zapisane lokalnie' })).toBeVisible();
    await selectFiles(page, 'Wybierz zaproszenie (.lxf lub .lef)', [invitationPath]);
    await expect(page.getByRole('heading', { name: 'Synthetic Meet' })).toBeVisible();
    await selectFiles(page, 'Dodaj zgłoszenie, wyniki lub zaproszenie', [previousEntryPath]);

    await page.getByRole('button', { name: 'Nowe zgłoszenie' }).click();
    await expect(page.getByText(/Bieżące zaproszenie i wybory zostaną wyczyszczone/)).toBeVisible();
    await page.getByRole('button', { name: 'Rozpocznij nowe zgłoszenie' }).click();

    await expect(page.getByRole('heading', { name: 'Synthetic Meet' })).toHaveCount(0);
    await expect(page.getByText(/Zaproszenie — invitation\.lef/)).toBeVisible();
    await expect(page.getByText(/Poprzednie zgłoszenie — previous-entry\.lef/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Zawodnicy i zgłoszenie' })).toHaveCount(0);

    const newInvitationXml = (await readFile(invitationPath, 'utf8'))
      .replaceAll('Synthetic Meet', 'Synthetic Next Meet')
      .replaceAll('synthetic-event-1', 'next-event-1')
      .replaceAll('synthetic-relay-event', 'next-relay-event');
    const newInvitationPath = testInfo.outputPath('next-invitation-new-flow.lef');
    await import('node:fs/promises').then(({ writeFile }) => writeFile(newInvitationPath, newInvitationXml));
    await selectFiles(page, 'Wybierz zaproszenie (.lxf lub .lef)', [newInvitationPath]);
    await expect(page.getByRole('heading', { name: 'Synthetic Next Meet' })).toBeVisible();
    await expect(page.getByText(/Poprzednie zgłoszenie — previous-entry\.lef/)).toBeVisible();
  } finally {
    await context.close();
  }
});
