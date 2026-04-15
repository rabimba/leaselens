'use client';

import { useEffect, useRef, useState } from 'react';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  Copy,
  Cpu,
  DollarSign,
  FileText,
  Globe,
  Info,
  Key,
  Link as LinkIcon,
  Loader2,
  MapPin,
  MonitorSmartphone,
} from 'lucide-react';

import {
  ANALYSIS_JSON_SCHEMA,
  buildLocalAnalysisPrompt,
  getProviderLabel,
  normalizeAnalysisResult,
  parseJSONFromModelOutput,
  providerSupportsLiveLookup,
  type AnalysisInput,
  type AnalysisResult,
  type ModelProvider,
} from '@/lib/analysis';
import type { GemmaWorkerResponse } from '@/lib/gemma-worker-types';
import { extractTextFromPdf } from '@/lib/pdf';
import { AddressAutocompleteInput } from '@/components/address-autocomplete-input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

interface AnalysisSnapshot {
  budget: string;
  destination: string;
  leasePdfFilename: string | null;
  listingText: string;
  listingUrl: string;
  propertyAddress: string;
  provider: ModelProvider;
}

const leaseSchema = {
  type: Type.OBJECT,
  properties: {
    fitScore: { type: Type.NUMBER, description: '0 to 100 score of how well the lease fits the budget and overall fairness.' },
    overallVerdict: { type: Type.STRING, description: 'A short plain-English summary of the lease.' },
    summary: { type: Type.STRING, description: 'A longer summary of the findings.' },
    hiddenFees: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          estimatedCost: { type: Type.STRING },
          evidence: { type: Type.STRING },
          severity: { type: Type.STRING, description: "'low', 'medium', or 'high'" },
        },
      },
    },
    riskyClauses: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          explanation: { type: Type.STRING },
          evidence: { type: Type.STRING },
          severity: { type: Type.STRING, description: "'low', 'medium', or 'high'" },
        },
      },
    },
    questionsToAsk: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    landlordEmailDraft: { type: Type.STRING, description: 'A polite draft email to the landlord asking the questions and expressing interest.' },
    budgetFit: { type: Type.STRING, description: 'Explanation of how well the rent and fees fit the user budget.' },
  },
  required: ['fitScore', 'overallVerdict', 'summary', 'hiddenFees', 'riskyClauses', 'questionsToAsk', 'landlordEmailDraft', 'budgetFit'],
};

const commuteSchema = {
  type: Type.OBJECT,
  properties: {
    commuteSummary: { type: Type.STRING, description: 'Summary of the commute to the destination.' },
    areaPros: { type: Type.ARRAY, items: { type: Type.STRING } },
    areaCons: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ['commuteSummary', 'areaPros', 'areaCons'],
};

async function fileToBase64(file: File) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';

  for (let index = 0; index < bytes.byteLength; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }

  return btoa(binary);
}

function normalizeBaseUrl(url: string) {
  return url.replace(/\/+$/, '');
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60) || 'lease-analysis';
}

function downloadFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function analyzeWithGemini(
  input: {
    propertyAddress: string;
    listingUrl: string;
    listingText: string;
    destination: string;
    budget: string;
    pdfFile: File | null;
  },
  apiKey: string,
  updateStatus: (message: string, progress?: number | null) => void,
) {
  const ai = new GoogleGenAI({ apiKey: apiKey || process.env.NEXT_PUBLIC_GEMINI_API_KEY });

  let pdfBase64 = '';
  let mimeType = '';

  if (input.pdfFile) {
    updateStatus('Encoding the lease PDF for Gemini...', 20);
    pdfBase64 = await fileToBase64(input.pdfFile);
    mimeType = input.pdfFile.type;
  }

  const leasePrompt = `
    You are an expert tenant advocate and lease analyzer.
    Analyze the provided apartment listing and/or lease agreement to help a renter spot hidden traps.
    
    User Constraints:
    - Monthly Budget: $${input.budget}
    
    Property Address: ${input.propertyAddress || 'Not provided'}
    Listing URL: ${input.listingUrl || 'Not provided'}
    Listing Text: ${input.listingText || 'Not provided'}
    ${input.pdfFile ? 'A lease PDF is also attached.' : 'No lease PDF attached.'}
    
    Provide a detailed analysis in JSON format based on the schema.
    Be objective, clear, and use plain English.
    Only show evidence-backed issues. Quote the evidence from the text/PDF.
    If confidence is low or information is missing, say so explicitly in the summary/verdict.
  `;

  const commutePrompt = `
    You are a local neighborhood and commute expert.
    Analyze the area around the apartment listing and the commute to the user's destination.
    
    Apartment Address: ${input.propertyAddress || 'Not provided'}
    Apartment Listing URL: ${input.listingUrl || 'Not provided'}
    Apartment Listing Text: ${input.listingText || 'Not provided'}
    Work/School Destination: ${input.destination}
    
    Use Google Maps to find the commute time, transit options, and nearby essentials (groceries, safety, vibe).
    
    CRITICAL: You MUST output ONLY valid JSON. Do not include any markdown formatting, backticks, or other text.
    The JSON must exactly match this schema:
    {
      "commuteSummary": "Summary of the commute to the destination.",
      "areaPros": ["pro 1", "pro 2"],
      "areaCons": ["con 1", "con 2"]
    }
    
    If confidence is low or exact location is unknown, say so explicitly in the summary.
  `;

  const leaseParts: Array<Record<string, unknown>> = [{ text: leasePrompt }];
  if (pdfBase64) {
    leaseParts.push({
      inlineData: {
        mimeType: mimeType || 'application/pdf',
        data: pdfBase64,
      },
    });
  }

  updateStatus('Running Gemini lease analysis and commute lookup...', 45);

  const leasePromise = ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: { parts: leaseParts },
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: 'application/json',
      responseSchema: leaseSchema,
      tools: input.listingUrl ? [{ googleSearch: {} }] : undefined,
      toolConfig: input.listingUrl ? { includeServerSideToolInvocations: true } : undefined,
    },
  });

  const commutePromise = ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: { parts: [{ text: commutePrompt }] },
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      tools: [{ googleMaps: {} }],
      toolConfig: { includeServerSideToolInvocations: true },
    },
  });

  const [leaseResponse, commuteResponse] = await Promise.all([leasePromise, commutePromise]);

  if (!leaseResponse.text || !commuteResponse.text) {
    throw new Error('Gemini did not return a complete response.');
  }

  updateStatus('Finalizing Gemini analysis...', 90);

  const parsedLease = JSON.parse(leaseResponse.text);
  let parsedCommute: Record<string, unknown>;

  try {
    const cleanText = commuteResponse.text.replace(/```json\n?|\n?```/g, '').trim();
    parsedCommute = JSON.parse(cleanText);
  } catch {
    parsedCommute = {
      commuteSummary: 'Commute analysis failed to return valid data.',
      areaPros: [],
      areaCons: [],
    };
  }

  return normalizeAnalysisResult({
    ...parsedLease,
    ...parsedCommute,
  });
}

async function analyzeWithOllama(
  input: AnalysisInput,
  baseUrl: string,
  model: string,
  updateStatus: (message: string, progress?: number | null) => void,
) {
  updateStatus(`Connecting to Ollama at ${normalizeBaseUrl(baseUrl)}...`, 30);

  try {
    const response = await fetch(`${normalizeBaseUrl(baseUrl)}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        stream: false,
        format: ANALYSIS_JSON_SCHEMA,
        options: {
          temperature: 0,
        },
        messages: [
          {
            role: 'system',
            content: 'You are LeaseLens, a careful renter advocate and neighborhood analyst.',
          },
          {
            role: 'user',
            content: buildLocalAnalysisPrompt(input),
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `Ollama responded with HTTP ${response.status}.`);
    }

    updateStatus(`Generating analysis with Ollama (${model})...`, 75);

    const payload = (await response.json()) as {
      message?: {
        content?: string;
      };
    };
    const content = payload.message?.content;

    if (!content) {
      throw new Error('Ollama returned an empty response.');
    }

    return normalizeAnalysisResult(parseJSONFromModelOutput(content));
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('Could not reach Ollama. Make sure `ollama serve` is running and the browser can access it.');
    }

    throw error;
  }
}

export default function Home() {
  const [propertyAddress, setPropertyAddress] = useState('');
  const [listingUrl, setListingUrl] = useState('');
  const [listingText, setListingText] = useState('');
  const [destination, setDestination] = useState('');
  const [budget, setBudget] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);

  const [provider, setProvider] = useState<ModelProvider>('gemini');
  const [apiKey, setApiKey] = useState('');
  const [mapsApiKey, setMapsApiKey] = useState(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '');
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState('http://127.0.0.1:11434');
  const [ollamaModel, setOllamaModel] = useState('gemma4:e2b');
  const [browserModelId, setBrowserModelId] = useState('onnx-community/gemma-4-E2B-it-ONNX');

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [showDemoNote, setShowDemoNote] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusProgress, setStatusProgress] = useState<number | null>(null);
  const [webGpuSupported, setWebGpuSupported] = useState<boolean | null>(null);
  const [lastRunProvider, setLastRunProvider] = useState<ModelProvider | null>(null);
  const [analysisSnapshot, setAnalysisSnapshot] = useState<AnalysisSnapshot | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const gemmaWorkerRef = useRef<Worker | null>(null);

  useEffect(() => {
    setWebGpuSupported(typeof navigator !== 'undefined' && 'gpu' in navigator);

    return () => {
      gemmaWorkerRef.current?.terminate();
      gemmaWorkerRef.current = null;
    };
  }, []);

  const updateStatus = (message: string, progress?: number | null) => {
    setStatusMessage(message);
    setStatusProgress(progress ?? null);
  };

  const getGemmaWorker = () => {
    if (!gemmaWorkerRef.current) {
      gemmaWorkerRef.current = new Worker(new URL('../workers/gemma.worker.ts', import.meta.url));
    }

    return gemmaWorkerRef.current;
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      setPdfFile(event.target.files[0]);
    }
  };

  const loadDemoData = () => {
    setPropertyAddress('2901 Mission St, San Francisco, CA');
    setListingUrl('');
    setListingText('Beautiful 1BR apartment in the heart of the Mission District. Rent is $2800/month. Amenities include a newly renovated gym, rooftop pool, and in-unit washer/dryer. Tenant pays for electricity, water, and internet. Parking is available for an additional $250/month. Pets allowed with a $500 non-refundable deposit and $75/month pet rent. 12-month lease required. Trash valet is mandatory at $35/month.');
    setDestination('Salesforce Tower, San Francisco');
    setBudget('3000');
    setPdfFile(null);
    setResult(null);
    setError(null);
    setStatusMessage(null);
    setStatusProgress(null);
    setAnalysisSnapshot(null);
    setShowDemoNote(true);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const exportAnalysisAsJson = () => {
    if (!result) {
      return;
    }

    const payload = {
      exportedAt: new Date().toISOString(),
      provider: getProviderLabel(analysisSnapshot?.provider ?? lastRunProvider ?? provider),
      inputs: {
        propertyAddress: analysisSnapshot?.propertyAddress ?? propertyAddress,
        listingUrl: analysisSnapshot?.listingUrl ?? listingUrl,
        listingText: analysisSnapshot?.listingText ?? listingText,
        destination: analysisSnapshot?.destination ?? destination,
        budget: analysisSnapshot?.budget ?? budget,
        leasePdfFilename: analysisSnapshot?.leasePdfFilename ?? pdfFile?.name ?? null,
      },
      result,
    };

    downloadFile(
      `${slugify(analysisSnapshot?.propertyAddress || analysisSnapshot?.listingUrl || propertyAddress || listingUrl || 'lease-analysis')}.json`,
      JSON.stringify(payload, null, 2),
      'application/json',
    );
  };

  const exportAnalysisAsMarkdown = () => {
    if (!result) {
      return;
    }

    const markdown = [
      '# LeaseLens Analysis Report',
      '',
      `Exported: ${new Date().toLocaleString()}`,
      `Provider: ${getProviderLabel(analysisSnapshot?.provider ?? lastRunProvider ?? provider)}`,
      '',
      '## Inputs',
      `- Property address: ${analysisSnapshot?.propertyAddress || propertyAddress || 'Not provided'}`,
      `- Listing URL: ${analysisSnapshot?.listingUrl || listingUrl || 'Not provided'}`,
      `- Destination: ${analysisSnapshot?.destination || destination}`,
      `- Budget: $${analysisSnapshot?.budget || budget}`,
      `- Lease PDF: ${analysisSnapshot?.leasePdfFilename || pdfFile?.name || 'Not provided'}`,
      '',
      '## Verdict',
      `- Fit score: ${result.fitScore}/100`,
      `- Overall verdict: ${result.overallVerdict}`,
      '',
      result.summary,
      '',
      '## Budget Fit',
      result.budgetFit,
      '',
      '## Hidden Fees',
      ...(result.hiddenFees.length > 0
        ? result.hiddenFees.map((fee) => `- ${fee.title} (${fee.estimatedCost}, ${fee.severity}): ${fee.evidence}`)
        : ['- None detected']),
      '',
      '## Risky Clauses',
      ...(result.riskyClauses.length > 0
        ? result.riskyClauses.map((clause) => `- ${clause.title} (${clause.severity}): ${clause.explanation} Evidence: ${clause.evidence}`)
        : ['- None detected']),
      '',
      '## Commute & Area',
      result.commuteSummary,
      '',
      '### Area Pros',
      ...(result.areaPros.length > 0 ? result.areaPros.map((entry) => `- ${entry}`) : ['- None listed']),
      '',
      '### Area Cons',
      ...(result.areaCons.length > 0 ? result.areaCons.map((entry) => `- ${entry}`) : ['- None listed']),
      '',
      '## Questions to Ask',
      ...(result.questionsToAsk.length > 0 ? result.questionsToAsk.map((entry, index) => `${index + 1}. ${entry}`) : ['None generated']),
      '',
      '## Draft Email',
      result.landlordEmailDraft,
      '',
    ].join('\n');

    downloadFile(
      `${slugify(analysisSnapshot?.propertyAddress || analysisSnapshot?.listingUrl || propertyAddress || listingUrl || 'lease-analysis')}.md`,
      markdown,
      'text/markdown;charset=utf-8',
    );
  };

  const analyzeWithBrowserGemma = async (input: AnalysisInput) => {
    const worker = getGemmaWorker();
    const prompt = buildLocalAnalysisPrompt(input);
    const requestId = crypto.randomUUID();

    updateStatus('Preparing Browser Gemma 4...', 5);

    return new Promise<AnalysisResult>((resolve, reject) => {
      const handleMessage = (event: MessageEvent<GemmaWorkerResponse>) => {
        const message = event.data;

        if (message.type === 'status') {
          updateStatus(message.label, message.progress ?? null);
          return;
        }

        if ('id' in message && message.id && message.id !== requestId) {
          return;
        }

        worker.removeEventListener('message', handleMessage);

        if (message.type === 'error') {
          reject(new Error(message.error));
          return;
        }

        try {
          resolve(normalizeAnalysisResult(parseJSONFromModelOutput(message.text)));
        } catch (error) {
          reject(error instanceof Error ? error : new Error('Browser Gemma 4 returned invalid JSON.'));
        }
      };

      worker.addEventListener('message', handleMessage);
      worker.postMessage({
        type: 'generate',
        id: requestId,
        modelId: browserModelId,
        prompt,
        maxNewTokens: 1_400,
      });
    });
  };

  const analyzeLease = async () => {
    const liveLookupEnabled = providerSupportsLiveLookup(provider);
    const resolvedGeminiApiKey = apiKey || process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';

    if (!listingUrl && !listingText && !pdfFile) {
      setError('Please provide at least a listing URL, listing text, or a lease PDF.');
      return;
    }

    if (!destination || !budget) {
      setError('Please provide your destination and budget.');
      return;
    }

    if (provider === 'gemini' && !resolvedGeminiApiKey) {
      setError('Provide a Gemini API key in the UI or via NEXT_PUBLIC_GEMINI_API_KEY.');
      return;
    }

    if (!liveLookupEnabled && !listingText && !pdfFile) {
      setError('Ollama and Browser Gemma cannot inspect listing URLs directly. Paste the listing text or upload a lease PDF.');
      return;
    }

    if (provider === 'browser' && webGpuSupported === false) {
      setError('Browser Gemma 4 requires a WebGPU-capable browser.');
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setResult(null);
    setShowDemoNote(false);
    updateStatus('Preparing analysis...', 10);

    try {
      let nextResult: AnalysisResult;

      if (provider === 'gemini') {
        nextResult = await analyzeWithGemini(
          {
            propertyAddress,
            listingUrl,
            listingText,
            destination,
            budget,
            pdfFile,
          },
          resolvedGeminiApiKey,
          updateStatus,
        );
      } else {
        let pdfText = '';

        if (pdfFile) {
          updateStatus('Extracting text from the lease PDF for local analysis...', 20);
          pdfText = await extractTextFromPdf(pdfFile);

          if (!pdfText) {
            throw new Error('The uploaded PDF did not contain extractable text. For scanned PDFs, use Gemini or paste the lease text manually.');
          }
        }

        const localInput: AnalysisInput = {
          propertyAddress,
          listingUrl,
          listingText,
          destination,
          budget,
          pdfText,
        };

        if (provider === 'ollama') {
          nextResult = await analyzeWithOllama(localInput, ollamaBaseUrl, ollamaModel, updateStatus);
        } else {
          nextResult = await analyzeWithBrowserGemma(localInput);
        }
      }

      setResult(nextResult);
      setLastRunProvider(provider);
      setAnalysisSnapshot({
        budget,
        destination,
        leasePdfFilename: pdfFile?.name ?? null,
        listingText,
        listingUrl,
        propertyAddress,
        provider,
      });
      updateStatus('Analysis complete.', 100);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred during analysis.';
      setError(message);
      setStatusMessage(null);
      setStatusProgress(null);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'high':
        return 'text-red-600 bg-red-50 border-red-200';
      case 'medium':
        return 'text-amber-600 bg-amber-50 border-amber-200';
      case 'low':
        return 'text-blue-600 bg-blue-50 border-blue-200';
      default:
        return 'text-slate-600 bg-slate-50 border-slate-200';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'high':
        return <AlertTriangle className="w-4 h-4 text-red-600" />;
      case 'medium':
        return <AlertTriangle className="w-4 h-4 text-amber-600" />;
      case 'low':
        return <Info className="w-4 h-4 text-blue-600" />;
      default:
        return <Info className="w-4 h-4 text-slate-600" />;
    }
  };

  const activeProviderLabel = getProviderLabel(provider);
  const liveLookupEnabled = providerSupportsLiveLookup(provider);
  const resultUsesLiveLookup = providerSupportsLiveLookup(lastRunProvider ?? provider);

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <header className="relative overflow-hidden border-b border-slate-200 bg-white px-4 pt-20 pb-16 text-center sm:px-6 lg:px-8">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-50 via-white to-white"></div>

        <div className="relative z-10 mx-auto max-w-3xl">
          <div className="mb-8 inline-flex items-center justify-center rounded-full border border-indigo-100 bg-indigo-50 px-4 py-1.5 shadow-sm">
            <span className="flex items-center gap-2 text-sm font-semibold text-indigo-700">
              <AlertTriangle className="w-4 h-4" /> Don&apos;t sign a bad lease.
            </span>
          </div>
          <h1 className="mb-6 text-5xl leading-tight font-extrabold tracking-tight text-slate-900 sm:text-6xl">
            AI-powered lease analysis for <span className="bg-gradient-to-r from-indigo-600 to-blue-500 bg-clip-text text-transparent">modern renters.</span>
          </h1>
          <p className="mx-auto mb-10 max-w-2xl text-xl leading-relaxed text-slate-600">
            Spot hidden fees, illegal clauses, and nightmare commutes before you sign. Run the analysis with Gemini, local Ollama, or Gemma 4 directly in your browser.
          </p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button size="lg" className="h-14 rounded-full px-8 text-lg shadow-lg shadow-indigo-200" onClick={() => document.getElementById('analyzer-form')?.scrollIntoView({ behavior: 'smooth' })}>
              Start Analysis <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
            <Button size="lg" variant="outline" className="h-14 rounded-full bg-white px-8 text-lg hover:bg-slate-50" onClick={loadDemoData}>
              Load Demo Data
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8" id="analyzer-form">
        <Alert className="mb-8 border-blue-200 bg-blue-50 text-blue-800">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertTitle>Disclaimer</AlertTitle>
          <AlertDescription>
            LeaseLens provides informational decision support only. It is not legal advice. Always consult a qualified attorney for legal concerns.
          </AlertDescription>
        </Alert>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          <div className="space-y-6 lg:col-span-5">
            <Card className="border-slate-200 bg-white/70 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-sm font-medium tracking-wider text-slate-500 uppercase">
                  <Key className="w-4 h-4" /> Model Provider
                </CardTitle>
                <CardDescription>Select which engine powers the analysis.</CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs
                  value={provider}
                  onValueChange={(value) => {
                    setProvider(value as ModelProvider);
                    setError(null);
                    setStatusMessage(null);
                    setStatusProgress(null);
                  }}
                  className="w-full"
                >
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="gemini">Gemini</TabsTrigger>
                    <TabsTrigger value="ollama">Ollama</TabsTrigger>
                    <TabsTrigger value="browser">Browser</TabsTrigger>
                  </TabsList>

                  <TabsContent value="gemini" className="mt-4 space-y-4">
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <Globe className="h-4 w-4 text-indigo-600" />
                      Hosted analysis with Google Search and Maps tools.
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="apiKey">Gemini API Key (Optional)</Label>
                      <Input
                        id="apiKey"
                        type="password"
                        placeholder="Provide your own key to bypass shared limits"
                        value={apiKey}
                        onChange={(event) => setApiKey(event.target.value)}
                      />
                    </div>
                  </TabsContent>

                  <TabsContent value="ollama" className="mt-4 space-y-4">
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <Cpu className="h-4 w-4 text-emerald-600" />
                      Runs against your local Ollama server with a Gemma-family model.
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ollamaBaseUrl">Ollama Base URL</Label>
                      <Input
                        id="ollamaBaseUrl"
                        placeholder="http://127.0.0.1:11434"
                        value={ollamaBaseUrl}
                        onChange={(event) => setOllamaBaseUrl(event.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ollamaModel">Ollama Model</Label>
                      <Input
                        id="ollamaModel"
                        placeholder="gemma4:e2b"
                        value={ollamaModel}
                        onChange={(event) => setOllamaModel(event.target.value)}
                      />
                    </div>
                    <Alert className="border-amber-200 bg-amber-50 text-amber-900">
                      <Info className="h-4 w-4 text-amber-700" />
                      <AlertDescription>
                        Ollama does not browse listing URLs or call Google Maps. Paste the listing text or upload a text-based lease PDF for best results.
                      </AlertDescription>
                    </Alert>
                  </TabsContent>

                  <TabsContent value="browser" className="mt-4 space-y-4">
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <MonitorSmartphone className="h-4 w-4 text-violet-600" />
                      Gemma 4 runs directly in the browser with Transformers.js over WebGPU.
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="browserModelId">Browser Model ID</Label>
                      <Input
                        id="browserModelId"
                        placeholder="onnx-community/gemma-4-E2B-it-ONNX"
                        value={browserModelId}
                        onChange={(event) => setBrowserModelId(event.target.value)}
                      />
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                      <span className="text-slate-600">WebGPU Support</span>
                      <Badge
                        variant="outline"
                        className={
                          webGpuSupported === null
                            ? 'border-slate-200 text-slate-600'
                            : webGpuSupported
                              ? 'border-emerald-200 text-emerald-700'
                              : 'border-amber-200 text-amber-700'
                        }
                      >
                        {webGpuSupported === null ? 'Checking' : webGpuSupported ? 'Detected' : 'Required'}
                      </Badge>
                    </div>
                    <Alert className="border-indigo-200 bg-indigo-50 text-indigo-900">
                      <Info className="h-4 w-4 text-indigo-700" />
                      <AlertDescription>
                        The first run downloads the Gemma 4 ONNX weights from Hugging Face and can take a while. Browser Gemma also cannot fetch listing URLs or live map data.
                      </AlertDescription>
                    </Alert>
                  </TabsContent>
                </Tabs>
                <div className="mt-4 space-y-2">
                  <Label htmlFor="mapsApiKey">Google Maps API Key (Optional)</Label>
                  <Input
                    id="mapsApiKey"
                    type="password"
                    placeholder="For address autocomplete"
                    value={mapsApiKey}
                    onChange={(event) => setMapsApiKey(event.target.value)}
                  />
                  <p className="text-xs text-slate-500">Used by the address autocomplete fields. You can also set `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white/70 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="text-xl">1. Property Details</CardTitle>
                <CardDescription>
                  {liveLookupEnabled ? 'Provide the listing URL or paste the text.' : 'Paste the listing text for local models. URLs are only used as extra context.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <AddressAutocompleteInput
                  apiKey={mapsApiKey}
                  id="propertyAddress"
                  label="Property Address"
                  placeholder="Start typing the property address..."
                  value={propertyAddress}
                  onChange={setPropertyAddress}
                  helpText="Autocomplete uses Google Maps Places, but manual entry still works."
                />
                <div className="space-y-2">
                  <Label htmlFor="listingUrl" className="flex items-center gap-2">
                    <LinkIcon className="w-4 h-4 text-slate-500" /> Listing URL
                  </Label>
                  <Input
                    id="listingUrl"
                    placeholder="https://zillow.com/..."
                    value={listingUrl}
                    onChange={(event) => setListingUrl(event.target.value)}
                  />
                  {!liveLookupEnabled && (
                    <p className="text-xs text-amber-700">Local providers only see the URL string. Paste the listing text or upload the lease PDF for actual content analysis.</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="listingText" className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-slate-500" /> Listing Text
                  </Label>
                  <Textarea
                    id="listingText"
                    placeholder="Paste the apartment description here..."
                    className="h-24 resize-none"
                    value={listingText}
                    onChange={(event) => setListingText(event.target.value)}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white/70 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="text-xl">2. Your Constraints</CardTitle>
                <CardDescription>Help us determine if this is a good fit.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <AddressAutocompleteInput
                  apiKey={mapsApiKey}
                  id="destination"
                  label="Work/School Destination"
                  placeholder="Start typing the destination..."
                  value={destination}
                  onChange={setDestination}
                />
                <div className="space-y-2">
                  <Label htmlFor="budget" className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-slate-500" /> Monthly Budget ($)
                  </Label>
                  <Input
                    id="budget"
                    type="number"
                    placeholder="2000"
                    value={budget}
                    onChange={(event) => setBudget(event.target.value)}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white/70 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="text-xl">3. The Lease (Optional)</CardTitle>
                <CardDescription>
                  {provider === 'gemini'
                    ? 'Upload the lease agreement PDF for deep analysis.'
                    : 'Upload a text-based lease PDF. The app extracts text locally before sending it to the selected model.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {showDemoNote && (
                  <Alert className="border-indigo-200 bg-indigo-50 text-indigo-800">
                    <Info className="h-4 w-4 text-indigo-600" />
                    <AlertTitle>Demo Mode Active</AlertTitle>
                    <AlertDescription>
                      For the full experience, please upload the sample <span className="font-semibold">lease_agreement.pdf</span> provided by the team.
                    </AlertDescription>
                  </Alert>
                )}
                <div className="space-y-2">
                  <Label htmlFor="leasePdf">Lease PDF</Label>
                  <Input
                    id="leasePdf"
                    type="file"
                    accept="application/pdf"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    className="cursor-pointer"
                  />
                </div>
              </CardContent>
              <CardFooter className="flex-col items-stretch gap-4">
                <Button
                  className="h-14 w-full rounded-xl text-lg shadow-md shadow-indigo-200/50"
                  onClick={analyzeLease}
                  disabled={isAnalyzing || (provider === 'browser' && webGpuSupported === false)}
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Analyzing with {activeProviderLabel}...
                    </>
                  ) : (
                    `Analyze With ${activeProviderLabel}`
                  )}
                </Button>
                {statusMessage && (
                  <div className="space-y-2">
                    <p className="text-sm text-slate-600">{statusMessage}</p>
                    {statusProgress !== null && <Progress value={statusProgress} className="h-2.5" />}
                  </div>
                )}
              </CardFooter>
            </Card>

            {error && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Card className="border-slate-200 bg-white/70 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium tracking-wider text-slate-500 uppercase">Provider Notes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-slate-600">
                <p><span className="font-medium text-slate-800">Gemini:</span> best for listing URLs and live commute lookup because it can use Google Search and Maps.</p>
                <p><span className="font-medium text-slate-800">Ollama:</span> fully local if you already run `ollama serve` and have a Gemma model pulled.</p>
                <p><span className="font-medium text-slate-800">Browser Gemma 4:</span> no local server required, but it depends on WebGPU and a large first-time model download.</p>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-7">
            {isAnalyzing && (
              <Card className="flex min-h-[600px] h-full flex-col items-center justify-center border-slate-200 p-8 text-center shadow-sm">
                <Loader2 className="mb-6 h-12 w-12 animate-spin text-indigo-600" />
                <h3 className="mb-2 text-2xl font-semibold text-slate-900">Running {activeProviderLabel}...</h3>
                <p className="max-w-sm text-slate-500">
                  {statusMessage || 'Reading the lease, checking for hidden fees, and building your renter risk dashboard.'}
                </p>
                {statusProgress !== null && (
                  <div className="mt-6 w-full max-w-sm space-y-2">
                    <Progress value={statusProgress} className="h-2.5" />
                    <p className="text-xs text-slate-400">{Math.max(0, Math.min(100, statusProgress))}%</p>
                  </div>
                )}
              </Card>
            )}

            {!isAnalyzing && !result && (
              <div className="flex min-h-[600px] h-full flex-col justify-center space-y-6">
                <Card className="flex flex-col items-center justify-center border-slate-200 border-dashed bg-slate-50/50 p-8 text-center shadow-none">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100">
                    <FileText className="h-8 w-8 text-indigo-600" />
                  </div>
                  <h3 className="mb-2 text-xl font-medium text-slate-900">Ready to Analyze</h3>
                  <p className="max-w-md text-slate-500">
                    Fill out the details on the left and click &quot;Analyze&quot; to see your personalized dashboard.
                  </p>
                </Card>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <Card className="border-slate-200 bg-white shadow-sm">
                    <CardContent className="flex flex-col items-center gap-3 p-5 text-center">
                      <div className="rounded-full bg-red-50 p-2.5"><DollarSign className="w-5 h-5 text-red-600" /></div>
                      <h4 className="font-semibold text-slate-900">Hidden Costs</h4>
                      <p className="text-sm leading-relaxed text-slate-500">Uncover mandatory fees, pet rent, and utility traps not in the headline price.</p>
                    </CardContent>
                  </Card>
                  <Card className="border-slate-200 bg-white shadow-sm">
                    <CardContent className="flex flex-col items-center gap-3 p-5 text-center">
                      <div className="rounded-full bg-amber-50 p-2.5"><AlertTriangle className="w-5 h-5 text-amber-600" /></div>
                      <h4 className="font-semibold text-slate-900">Risky Language</h4>
                      <p className="text-sm leading-relaxed text-slate-500">Spot unfair eviction clauses, maintenance liabilities, and deposit risks.</p>
                    </CardContent>
                  </Card>
                  <Card className="border-slate-200 bg-white shadow-sm">
                    <CardContent className="flex flex-col items-center gap-3 p-5 text-center">
                      <div className="rounded-full bg-blue-50 p-2.5"><MapPin className="w-5 h-5 text-blue-600" /></div>
                      <h4 className="font-semibold text-slate-900">Commute & Area</h4>
                      <p className="text-sm leading-relaxed text-slate-500">Get a commute summary and neighborhood pros/cons based on the available location details.</p>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}

            {!isAnalyzing && result && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-end">
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge variant="outline" className="border-slate-300 bg-white text-slate-700">
                      Generated with {getProviderLabel(lastRunProvider ?? provider)}
                    </Badge>
                    <Button variant="outline" size="sm" onClick={exportAnalysisAsMarkdown}>
                      Export Markdown
                    </Button>
                    <Button variant="outline" size="sm" onClick={exportAnalysisAsJson}>
                      Export JSON
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                  <Card className="overflow-hidden border-slate-200 shadow-sm md:col-span-1">
                    <div className="h-2 w-full bg-indigo-600"></div>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs font-bold tracking-wider text-slate-500 uppercase">Fit Score</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="mb-4 flex items-end gap-2">
                        <span className="text-6xl font-extrabold tracking-tighter text-slate-900">{result.fitScore}</span>
                        <span className="mb-1.5 text-xl font-medium text-slate-400">/ 100</span>
                      </div>
                      <Progress value={result.fitScore} className="h-2.5" />
                    </CardContent>
                  </Card>

                  <Card className="flex flex-col justify-center border-slate-200 shadow-sm md:col-span-2">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs font-bold tracking-wider text-slate-500 uppercase">Overall Verdict</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="mb-3 text-xl leading-snug font-semibold text-slate-900">{result.overallVerdict}</p>
                      <p className="text-sm leading-relaxed text-slate-600">{result.summary}</p>
                    </CardContent>
                  </Card>
                </div>

                <Card className="border-indigo-100 bg-indigo-50/50 shadow-sm">
                  <CardContent className="flex items-start gap-4 p-5">
                    <div className="rounded-full bg-indigo-100 p-2 shrink-0">
                      <DollarSign className="w-6 h-6 text-indigo-700" />
                    </div>
                    <div>
                      <h4 className="text-lg font-bold text-slate-900">Budget Fit</h4>
                      <p className="mt-1 leading-relaxed text-slate-700">{result.budgetFit}</p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-slate-200 shadow-sm">
                  <Tabs defaultValue="risks" className="w-full">
                    <div className="border-b border-slate-100 px-6 pt-6">
                      <TabsList className="mb-6 grid w-full grid-cols-3">
                        <TabsTrigger value="risks">Risks & Fees</TabsTrigger>
                        <TabsTrigger value="commute">Area & Commute</TabsTrigger>
                        <TabsTrigger value="action">Action Plan</TabsTrigger>
                      </TabsList>
                    </div>

                    <TabsContent value="risks" className="p-6 pt-2 outline-none">
                      <div className="space-y-8">
                        <div>
                          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
                            <DollarSign className="w-5 h-5 text-slate-500" /> Hidden Fees
                          </h3>
                          {result.hiddenFees.length > 0 ? (
                            <div className="space-y-3">
                              {result.hiddenFees.map((fee, index) => (
                                <div key={index} className={`rounded-lg border p-4 ${getSeverityColor(fee.severity)}`}>
                                  <div className="mb-1 flex items-start justify-between">
                                    <div className="flex items-center gap-2">
                                      {getSeverityIcon(fee.severity)}
                                      <span className="font-semibold">{fee.title}</span>
                                    </div>
                                    <Badge variant="outline" className="bg-white/50">{fee.estimatedCost}</Badge>
                                  </div>
                                  <p className="mt-2 border-l-2 border-slate-300 pl-3 text-sm italic opacity-90">&quot;{fee.evidence}&quot;</p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="italic text-slate-500">No hidden fees detected.</p>
                          )}
                        </div>

                        <Separator />

                        <div>
                          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
                            <AlertTriangle className="w-5 h-5 text-slate-500" /> Risky Clauses
                          </h3>
                          {result.riskyClauses.length > 0 ? (
                            <div className="space-y-3">
                              {result.riskyClauses.map((clause, index) => (
                                <div key={index} className={`rounded-lg border p-4 ${getSeverityColor(clause.severity)}`}>
                                  <div className="mb-1 flex items-center gap-2">
                                    {getSeverityIcon(clause.severity)}
                                    <span className="font-semibold">{clause.title}</span>
                                  </div>
                                  <p className="mt-2 text-sm opacity-90">{clause.explanation}</p>
                                  <p className="mt-2 border-l-2 border-slate-300 pl-3 text-sm italic opacity-90">&quot;{clause.evidence}&quot;</p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="italic text-slate-500">No risky clauses detected.</p>
                          )}
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="commute" className="p-6 pt-2 outline-none">
                      <div className="space-y-6">
                        <div className="prose prose-slate max-w-none">
                          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
                            <MapPin className="w-5 h-5 text-slate-500" /> Commute & Area Summary
                          </h3>
                          <p className="whitespace-pre-wrap leading-relaxed text-slate-700">{result.commuteSummary}</p>
                        </div>

                        {!resultUsesLiveLookup && (
                          <Alert className="border-amber-200 bg-amber-50 text-amber-900">
                            <Info className="h-4 w-4 text-amber-700" />
                            <AlertDescription>
                              This result was generated without live Maps/Search tools, so the commute section depends entirely on the address detail present in your listing or lease text.
                            </AlertDescription>
                          </Alert>
                        )}

                        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                          {result.areaPros.length > 0 && (
                            <div className="rounded-lg border border-green-100 bg-green-50 p-4">
                              <h4 className="mb-3 flex items-center gap-2 font-medium text-green-800">
                                <CheckCircle className="w-4 h-4" /> Area Pros
                              </h4>
                              <ul className="space-y-2">
                                {result.areaPros.map((pro, index) => (
                                  <li key={index} className="flex items-start gap-2 text-sm text-green-700">
                                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-green-500"></span>
                                    {pro}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {result.areaCons.length > 0 && (
                            <div className="rounded-lg border border-red-100 bg-red-50 p-4">
                              <h4 className="mb-3 flex items-center gap-2 font-medium text-red-800">
                                <AlertTriangle className="w-4 h-4" /> Area Cons
                              </h4>
                              <ul className="space-y-2">
                                {result.areaCons.map((con, index) => (
                                  <li key={index} className="flex items-start gap-2 text-sm text-red-700">
                                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-red-500"></span>
                                    {con}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="action" className="p-6 pt-2 outline-none">
                      <div className="space-y-8">
                        <div>
                          <div className="mb-4 flex items-center justify-between">
                            <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                              <CheckCircle className="w-5 h-5 text-slate-500" /> Questions to Ask
                            </h3>
                            <Button variant="ghost" size="sm" onClick={() => copyToClipboard(result.questionsToAsk.join('\n'))}>
                              <Copy className="mr-2 w-4 h-4" /> Copy All
                            </Button>
                          </div>
                          <ul className="space-y-2">
                            {result.questionsToAsk.map((question, index) => (
                              <li key={index} className="flex items-start gap-3 rounded-md border border-slate-100 bg-slate-50 p-3">
                                <span className="mt-0.5 font-bold text-indigo-600">{index + 1}.</span>
                                <span className="text-slate-700">{question}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        <Separator />

                        <div>
                          <div className="mb-4 flex items-center justify-between">
                            <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                              <FileText className="w-5 h-5 text-slate-500" /> Draft Email to Landlord
                            </h3>
                            <Button variant="ghost" size="sm" onClick={() => copyToClipboard(result.landlordEmailDraft)}>
                              <Copy className="mr-2 w-4 h-4" /> Copy Email
                            </Button>
                          </div>
                          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 font-mono text-sm leading-relaxed whitespace-pre-wrap text-slate-700">
                            {result.landlordEmailDraft}
                          </div>
                        </div>
                      </div>
                    </TabsContent>
                  </Tabs>
                </Card>
              </motion.div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
