import { pipeline } from '@huggingface/transformers';

import type { GemmaWorkerRequest, GemmaWorkerResponse } from '@/lib/gemma-worker-types';

type TextGenerator = {
  (
    input: Array<{ role: string; content: string }>,
    options: {
      max_new_tokens: number;
      do_sample: boolean;
    },
  ): Promise<unknown>;
  dispose?: () => Promise<void> | void;
};

let currentModelId: string | null = null;
let generator: TextGenerator | null = null;

function postWorkerMessage(message: GemmaWorkerResponse) {
  self.postMessage(message);
}

function describeProgress(info: Record<string, unknown>) {
  const status = typeof info.status === 'string' ? info.status : 'loading';
  const source = typeof info.file === 'string'
    ? info.file
    : typeof info.name === 'string'
      ? info.name
      : 'model assets';
  const progress = typeof info.progress === 'number' ? Math.round(info.progress) : undefined;

  return {
    label: `${status.replaceAll('_', ' ')}: ${source}`,
    progress,
  };
}

async function loadGenerator(modelId: string) {
  if (generator && currentModelId === modelId) {
    return generator;
  }

  if (generator && currentModelId !== modelId && 'dispose' in generator && typeof generator.dispose === 'function') {
    await generator.dispose();
  }

  postWorkerMessage({
    type: 'status',
    phase: 'loading',
    label: 'Preparing Gemma 4 for browser inference...',
  });

  generator = (await pipeline('text-generation', modelId, {
    dtype: 'q4f16',
    device: 'webgpu',
    progress_callback: (info) => {
      const { label, progress } = describeProgress(info as Record<string, unknown>);

      postWorkerMessage({
        type: 'status',
        phase: 'loading',
        label,
        progress,
      });
    },
  })) as TextGenerator;
  currentModelId = modelId;

  postWorkerMessage({
    type: 'status',
    phase: 'ready',
    label: 'Browser Gemma 4 is ready.',
    progress: 100,
  });

  return generator;
}

function extractGeneratedText(output: unknown) {
  const firstItem = Array.isArray(output) ? output[0] : output;

  if (!firstItem || typeof firstItem !== 'object') {
    throw new Error('Gemma 4 returned an unexpected response.');
  }

  const generatedText = (firstItem as { generated_text?: unknown }).generated_text;

  if (typeof generatedText === 'string') {
    return generatedText;
  }

  if (Array.isArray(generatedText)) {
    const lastMessage = generatedText[generatedText.length - 1];

    if (lastMessage && typeof lastMessage === 'object' && 'content' in lastMessage) {
      const content = (lastMessage as { content?: unknown }).content;

      if (typeof content === 'string') {
        return content;
      }

      if (Array.isArray(content)) {
        return content
          .map((part) => {
            if (typeof part === 'string') {
              return part;
            }

            if (part && typeof part === 'object' && 'text' in part) {
              return typeof part.text === 'string' ? part.text : '';
            }

            return '';
          })
          .join('');
      }
    }
  }

  throw new Error('Gemma 4 returned an unsupported chat response shape.');
}

self.onmessage = async (event: MessageEvent<GemmaWorkerRequest>) => {
  const message = event.data;

  if (message.type !== 'generate') {
    return;
  }

  try {
    const textGenerator = await loadGenerator(message.modelId);

    postWorkerMessage({
      type: 'status',
      phase: 'generating',
      label: 'Generating structured lease analysis with Browser Gemma 4...',
    });

    const output = await textGenerator(
      [{ role: 'user', content: message.prompt }],
      {
        max_new_tokens: message.maxNewTokens ?? 1_400,
        do_sample: false,
      },
    );

    postWorkerMessage({
      type: 'result',
      id: message.id,
      text: extractGeneratedText(output),
    });
  } catch (error) {
    postWorkerMessage({
      type: 'error',
      id: message.id,
      error: error instanceof Error ? error.message : 'Browser Gemma 4 failed to run.',
    });
  }
};

export {};
