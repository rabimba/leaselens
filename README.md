<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# LeaseLens

LeaseLens analyzes apartment listings and lease text for hidden fees, risky clauses, budget fit, and commute risk. The app now supports three model backends:

- `Gemini`: hosted analysis with Google Search and Google Maps tool use.
- `Ollama`: local inference against a Gemma-family model such as `gemma4:e2b`.
- `Browser Gemma 4`: on-device inference in the browser using Transformers.js and `onnx-community/gemma-4-E2B-it-ONNX`.

The UI also supports Google Maps Places autocomplete for the property and destination address fields, plus JSON/Markdown export of the generated report.

## Run locally

**Prerequisites:** Node.js 20+

1. Install dependencies:
   `npm install`
2. Start the app:
   `npm run dev`
3. Open [http://localhost:3000](http://localhost:3000)

## Provider setup

### Gemini

Set `NEXT_PUBLIC_GEMINI_API_KEY` in `.env.local`, or paste a key into the UI.

### Google Maps address autocomplete

Set `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` in `.env.local`, or paste a key into the UI.

The key must be allowed to use:

- `Maps JavaScript API`
- `Places API` / Places autocomplete in the Maps JavaScript API

### Ollama

1. Install and start Ollama.
2. Pull a Gemma 4 model, for example:
   `ollama pull gemma4:e2b`
3. Ensure the Ollama server is running:
   `ollama serve`
4. In the UI, choose `Ollama` and keep the default base URL `http://127.0.0.1:11434` unless your server is elsewhere.

### Browser Gemma 4

1. Choose `Browser` in the UI.
2. Use a WebGPU-capable browser.
3. On first run, the app downloads the ONNX weights for `onnx-community/gemma-4-E2B-it-ONNX` from Hugging Face.

## Notes

- Gemini is the only provider that can actively inspect listing URLs and use live Maps/Search tools.
- Ollama and Browser Gemma work best when you paste the listing text or upload a text-based lease PDF.
- For local providers, LeaseLens extracts PDF text in the browser before sending the prompt to the selected model.
- Results can be exported from the dashboard as either `JSON` or `Markdown`.
