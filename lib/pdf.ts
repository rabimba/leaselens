let pdfModulePromise: Promise<typeof import('pdfjs-dist')> | null = null;

async function loadPdfModule() {
  if (!pdfModulePromise) {
    pdfModulePromise = import('pdfjs-dist');
  }

  return pdfModulePromise;
}

export async function extractTextFromPdf(file: File) {
  const pdfjs = await loadPdfModule();
  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({ data });
  const document = await loadingTask.promise;
  const pages: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (pageText) {
        pages.push(`Page ${pageNumber}: ${pageText}`);
      }
    }
  } finally {
    await document.destroy();
  }

  return pages.join('\n\n').trim();
}
