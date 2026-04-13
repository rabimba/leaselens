'use client';

import { useState, useRef } from 'react';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import { motion } from 'motion/react';
import { FileText, Link as LinkIcon, MapPin, DollarSign, AlertTriangle, CheckCircle, Info, Copy, Loader2, ArrowRight, Key } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';

interface AnalysisResult {
  fitScore: number;
  overallVerdict: string;
  summary: string;
  hiddenFees: { title: string; estimatedCost: string; evidence: string; severity: 'low' | 'medium' | 'high' }[];
  riskyClauses: { title: string; explanation: string; evidence: string; severity: 'low' | 'medium' | 'high' }[];
  commuteSummary: string;
  areaPros: string[];
  areaCons: string[];
  budgetFit: string;
  questionsToAsk: string[];
  landlordEmailDraft: string;
}

export default function Home() {
  const [listingUrl, setListingUrl] = useState('');
  const [listingText, setListingText] = useState('');
  const [destination, setDestination] = useState('');
  const [budget, setBudget] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [showDemoNote, setShowDemoNote] = useState(false);
  const [apiKey, setApiKey] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setPdfFile(e.target.files[0]);
    }
  };

  const loadDemoData = () => {
    setListingUrl('');
    setListingText('Beautiful 1BR apartment in the heart of the Mission District. Rent is $2800/month. Amenities include a newly renovated gym, rooftop pool, and in-unit washer/dryer. Tenant pays for electricity, water, and internet. Parking is available for an additional $250/month. Pets allowed with a $500 non-refundable deposit and $75/month pet rent. 12-month lease required. Trash valet is mandatory at $35/month.');
    setDestination('Salesforce Tower, San Francisco');
    setBudget('3000');
    setShowDemoNote(true);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // Could add a toast here
  };

  const analyzeLease = async () => {
    if (!listingUrl && !listingText && !pdfFile) {
      setError('Please provide at least a listing URL, listing text, or a lease PDF.');
      return;
    }
    if (!destination || !budget) {
      setError('Please provide your destination and budget.');
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setResult(null);
    setShowDemoNote(false);

    try {
      const ai = new GoogleGenAI({ apiKey: apiKey || process.env.NEXT_PUBLIC_GEMINI_API_KEY });
      
      let pdfBase64 = '';
      let mimeType = '';
      
      if (pdfFile) {
        const buffer = await pdfFile.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        pdfBase64 = btoa(binary);
        mimeType = pdfFile.type;
      }

      const leasePrompt = `
        You are an expert tenant advocate and lease analyzer.
        Analyze the provided apartment listing and/or lease agreement to help a renter spot hidden traps.
        
        User Constraints:
        - Monthly Budget: $${budget}
        
        Listing URL: ${listingUrl || 'Not provided'}
        Listing Text: ${listingText || 'Not provided'}
        ${pdfFile ? 'A lease PDF is also attached.' : 'No lease PDF attached.'}
        
        Provide a detailed analysis in JSON format based on the schema.
        Be objective, clear, and use plain English.
        Only show evidence-backed issues. Quote the evidence from the text/PDF.
        If confidence is low or information is missing, say so explicitly in the summary/verdict.
      `;

      const commutePrompt = `
        You are a local neighborhood and commute expert.
        Analyze the area around the apartment listing and the commute to the user's destination.
        
        Apartment Listing URL: ${listingUrl || 'Not provided'}
        Apartment Listing Text: ${listingText || 'Not provided'}
        Work/School Destination: ${destination}
        
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

      const leaseParts: any[] = [{ text: leasePrompt }];
      if (pdfBase64) {
        leaseParts.push({
          inlineData: {
            mimeType: mimeType || 'application/pdf',
            data: pdfBase64
          }
        });
      }

      const commuteParts: any[] = [{ text: commutePrompt }];

      const leaseSchema = {
        type: Type.OBJECT,
        properties: {
          fitScore: { type: Type.NUMBER, description: "0 to 100 score of how well the lease fits the budget and overall fairness." },
          overallVerdict: { type: Type.STRING, description: "A short plain-English summary of the lease." },
          summary: { type: Type.STRING, description: "A longer summary of the findings." },
          hiddenFees: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                estimatedCost: { type: Type.STRING },
                evidence: { type: Type.STRING },
                severity: { type: Type.STRING, description: "'low', 'medium', or 'high'" }
              }
            }
          },
          riskyClauses: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                explanation: { type: Type.STRING },
                evidence: { type: Type.STRING },
                severity: { type: Type.STRING, description: "'low', 'medium', or 'high'" }
              }
            }
          },
          questionsToAsk: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          },
          landlordEmailDraft: { type: Type.STRING, description: "A polite draft email to the landlord asking the questions and expressing interest." },
          budgetFit: { type: Type.STRING, description: "Explanation of how well the rent and fees fit the user's budget." }
        },
        required: ["fitScore", "overallVerdict", "summary", "hiddenFees", "riskyClauses", "questionsToAsk", "landlordEmailDraft", "budgetFit"]
      };

      const commuteSchema = {
        type: Type.OBJECT,
        properties: {
          commuteSummary: { type: Type.STRING, description: "Summary of the commute to the destination." },
          areaPros: { type: Type.ARRAY, items: { type: Type.STRING } },
          areaCons: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["commuteSummary", "areaPros", "areaCons"]
      };

      const leasePromise = ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: { parts: leaseParts },
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: leaseSchema,
          tools: listingUrl ? [{ googleSearch: {} }] : undefined,
          toolConfig: listingUrl ? { includeServerSideToolInvocations: true } : undefined,
        }
      });

      const commutePromise = ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: { parts: commuteParts },
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          tools: [{ googleMaps: {} }],
          toolConfig: { includeServerSideToolInvocations: true },
        }
      });

      const [leaseResponse, commuteResponse] = await Promise.all([leasePromise, commutePromise]);

      if (leaseResponse.text && commuteResponse.text) {
        const parsedLease = JSON.parse(leaseResponse.text);
        
        let parsedCommute;
        try {
          const cleanText = commuteResponse.text.replace(/```json\n?|\n?```/g, '').trim();
          parsedCommute = JSON.parse(cleanText);
        } catch (e) {
          console.error("Failed to parse commute JSON:", e);
          parsedCommute = { commuteSummary: "Commute analysis failed to return valid data.", areaPros: [], areaCons: [] };
        }
        
        const finalResult: AnalysisResult = {
          ...parsedLease,
          ...parsedCommute
        };
        
        setResult(finalResult);
      } else {
        throw new Error("No response from AI");
      }

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred during analysis.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'high': return 'text-red-600 bg-red-50 border-red-200';
      case 'medium': return 'text-amber-600 bg-amber-50 border-amber-200';
      case 'low': return 'text-blue-600 bg-blue-50 border-blue-200';
      default: return 'text-slate-600 bg-slate-50 border-slate-200';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'high': return <AlertTriangle className="w-4 h-4 text-red-600" />;
      case 'medium': return <AlertTriangle className="w-4 h-4 text-amber-600" />;
      case 'low': return <Info className="w-4 h-4 text-blue-600" />;
      default: return <Info className="w-4 h-4 text-slate-600" />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* Hero Section */}
      <header className="relative bg-white border-b border-slate-200 pt-20 pb-16 px-4 sm:px-6 lg:px-8 text-center overflow-hidden">
        {/* Subtle background gradient */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-50 via-white to-white -z-10"></div>
        
        <div className="max-w-3xl mx-auto relative z-10">
          <div className="inline-flex items-center justify-center px-4 py-1.5 bg-indigo-50 border border-indigo-100 rounded-full mb-8 shadow-sm">
            <span className="text-sm font-semibold text-indigo-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> Don&apos;t sign a bad lease.
            </span>
          </div>
          <h1 className="text-5xl sm:text-6xl font-extrabold text-slate-900 tracking-tight mb-6 leading-tight">
            AI-powered lease analysis for <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-blue-500">modern renters.</span>
          </h1>
          <p className="text-xl text-slate-600 mb-10 max-w-2xl mx-auto leading-relaxed">
            Spot hidden fees, illegal clauses, and nightmare commutes before you sign. Upload your lease to get a plain-English risk dashboard in seconds.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button size="lg" className="h-14 px-8 text-lg rounded-full shadow-lg shadow-indigo-200" onClick={() => document.getElementById('analyzer-form')?.scrollIntoView({ behavior: 'smooth' })}>
              Start Analysis <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
            <Button size="lg" variant="outline" className="h-14 px-8 text-lg rounded-full bg-white hover:bg-slate-50" onClick={loadDemoData}>
              Load Demo Data
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12" id="analyzer-form">
        
        {/* Disclaimer */}
        <Alert className="mb-8 bg-blue-50 border-blue-200 text-blue-800">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertTitle>Disclaimer</AlertTitle>
          <AlertDescription>
            LeaseLens provides informational decision support only. It is not legal advice. Always consult a qualified attorney for legal concerns.
          </AlertDescription>
        </Alert>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Form Column */}
          <div className="lg:col-span-5 space-y-6">
            <Card className="shadow-[0_8px_30px_rgb(0,0,0,0.04)] border-slate-200 bg-white/70 backdrop-blur-xl">
              <CardHeader className="pb-4">
                <CardTitle className="text-sm font-medium text-slate-500 uppercase tracking-wider flex items-center gap-2">
                  <Key className="w-4 h-4" /> Settings
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label htmlFor="apiKey">Gemini API Key (Optional)</Label>
                  <Input 
                    id="apiKey" 
                    type="password"
                    placeholder="Provide your own key to bypass limits" 
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-[0_8px_30px_rgb(0,0,0,0.04)] border-slate-200 bg-white/70 backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="text-xl">1. Property Details</CardTitle>
                <CardDescription>Provide the listing URL or paste the text.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="listingUrl" className="flex items-center gap-2">
                    <LinkIcon className="w-4 h-4 text-slate-500" /> Listing URL
                  </Label>
                  <Input 
                    id="listingUrl" 
                    placeholder="https://zillow.com/..." 
                    value={listingUrl}
                    onChange={(e) => setListingUrl(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="listingText" className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-slate-500" /> Listing Text (Fallback)
                  </Label>
                  <Textarea 
                    id="listingText" 
                    placeholder="Paste the apartment description here..." 
                    className="h-24 resize-none"
                    value={listingText}
                    onChange={(e) => setListingText(e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-[0_8px_30px_rgb(0,0,0,0.04)] border-slate-200 bg-white/70 backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="text-xl">2. Your Constraints</CardTitle>
                <CardDescription>Help us determine if this is a good fit.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="destination" className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-slate-500" /> Work/School Destination
                  </Label>
                  <Input 
                    id="destination" 
                    placeholder="e.g. 1600 Amphitheatre Pkwy or 'Downtown'" 
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="budget" className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-slate-500" /> Monthly Budget ($)
                  </Label>
                  <Input 
                    id="budget" 
                    type="number" 
                    placeholder="2000" 
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-[0_8px_30px_rgb(0,0,0,0.04)] border-slate-200 bg-white/70 backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="text-xl">3. The Lease (Optional)</CardTitle>
                <CardDescription>Upload the lease agreement PDF for deep analysis.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {showDemoNote && (
                  <Alert className="bg-indigo-50 border-indigo-200 text-indigo-800">
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
              <CardFooter>
                <Button 
                  className="w-full text-lg h-14 rounded-xl shadow-md shadow-indigo-200/50" 
                  onClick={analyzeLease}
                  disabled={isAnalyzing}
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Analyzing...
                    </>
                  ) : (
                    'Analyze Lease'
                  )}
                </Button>
              </CardFooter>
            </Card>

            {error && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>

          {/* Results Column */}
          <div className="lg:col-span-7">
            {isAnalyzing && (
              <Card className="h-full min-h-[600px] flex flex-col items-center justify-center p-8 text-center border-slate-200 shadow-sm">
                <Loader2 className="h-12 w-12 text-indigo-600 animate-spin mb-6" />
                <h3 className="text-2xl font-semibold text-slate-900 mb-2">Reading the fine print...</h3>
                <p className="text-slate-500 max-w-sm">
                  Our AI is analyzing the listing, checking for hidden fees, and evaluating the commute to your destination. This usually takes about 10-20 seconds.
                </p>
              </Card>
            )}

            {!isAnalyzing && !result && (
              <div className="h-full flex flex-col justify-center space-y-6 min-h-[600px]">
                <Card className="flex flex-col items-center justify-center p-8 text-center border-slate-200 border-dashed bg-slate-50/50 shadow-none">
                  <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mb-4">
                    <FileText className="h-8 w-8 text-indigo-600" />
                  </div>
                  <h3 className="text-xl font-medium text-slate-900 mb-2">Ready to Analyze</h3>
                  <p className="text-slate-500 max-w-md">
                    Fill out the details on the left and click &quot;Analyze Lease&quot; to see your personalized dashboard.
                  </p>
                </Card>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card className="bg-white border-slate-200 shadow-sm">
                    <CardContent className="p-5 flex flex-col items-center text-center gap-3">
                      <div className="p-2.5 bg-red-50 rounded-full"><DollarSign className="w-5 h-5 text-red-600" /></div>
                      <h4 className="font-semibold text-slate-900">Hidden Costs</h4>
                      <p className="text-sm text-slate-500 leading-relaxed">Uncover mandatory fees, pet rent, and utility traps not in the headline price.</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-white border-slate-200 shadow-sm">
                    <CardContent className="p-5 flex flex-col items-center text-center gap-3">
                      <div className="p-2.5 bg-amber-50 rounded-full"><AlertTriangle className="w-5 h-5 text-amber-600" /></div>
                      <h4 className="font-semibold text-slate-900">Risky Language</h4>
                      <p className="text-sm text-slate-500 leading-relaxed">Spot unfair eviction clauses, maintenance liabilities, and deposit risks.</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-white border-slate-200 shadow-sm">
                    <CardContent className="p-5 flex flex-col items-center text-center gap-3">
                      <div className="p-2.5 bg-blue-50 rounded-full"><MapPin className="w-5 h-5 text-blue-600" /></div>
                      <h4 className="font-semibold text-slate-900">Commute & Area</h4>
                      <p className="text-sm text-slate-500 leading-relaxed">Get real transit times and neighborhood pros/cons for your specific routine.</p>
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
                {/* Top Stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <Card className="border-slate-200 shadow-sm overflow-hidden md:col-span-1">
                    <div className="bg-indigo-600 h-2 w-full"></div>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider">Fit Score</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-end gap-2 mb-4">
                        <span className="text-6xl font-extrabold text-slate-900 tracking-tighter">{result.fitScore}</span>
                        <span className="text-xl text-slate-400 font-medium mb-1.5">/ 100</span>
                      </div>
                      <Progress value={result.fitScore} className="h-2.5" />
                    </CardContent>
                  </Card>

                  <Card className="border-slate-200 shadow-sm md:col-span-2 flex flex-col justify-center">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider">Overall Verdict</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xl text-slate-900 font-semibold mb-3 leading-snug">{result.overallVerdict}</p>
                      <p className="text-slate-600 text-sm leading-relaxed">{result.summary}</p>
                    </CardContent>
                  </Card>
                </div>

                <Card className="border-indigo-100 shadow-sm bg-indigo-50/50">
                  <CardContent className="p-5 flex items-start gap-4">
                    <div className="p-2 bg-indigo-100 rounded-full shrink-0">
                      <DollarSign className="w-6 h-6 text-indigo-700" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-lg">Budget Fit</h4>
                      <p className="text-slate-700 mt-1 leading-relaxed">{result.budgetFit}</p>
                    </div>
                  </CardContent>
                </Card>

                {/* Tabs for Details */}
                <Card className="border-slate-200 shadow-sm">
                  <Tabs defaultValue="risks" className="w-full">
                    <div className="px-6 pt-6 border-b border-slate-100">
                      <TabsList className="grid w-full grid-cols-3 mb-6">
                        <TabsTrigger value="risks">Risks & Fees</TabsTrigger>
                        <TabsTrigger value="commute">Area & Commute</TabsTrigger>
                        <TabsTrigger value="action">Action Plan</TabsTrigger>
                      </TabsList>
                    </div>
                    
                    <TabsContent value="risks" className="p-6 pt-2 outline-none">
                      <div className="space-y-8">
                        <div>
                          <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                            <DollarSign className="w-5 h-5 text-slate-500" /> Hidden Fees
                          </h3>
                          {result.hiddenFees.length > 0 ? (
                            <div className="space-y-3">
                              {result.hiddenFees.map((fee, i) => (
                                <div key={i} className={`p-4 rounded-lg border ${getSeverityColor(fee.severity)}`}>
                                  <div className="flex justify-between items-start mb-1">
                                    <div className="flex items-center gap-2">
                                      {getSeverityIcon(fee.severity)}
                                      <span className="font-semibold">{fee.title}</span>
                                    </div>
                                    <Badge variant="outline" className="bg-white/50">{fee.estimatedCost}</Badge>
                                  </div>
                                  <p className="text-sm mt-2 opacity-90 italic border-l-2 border-slate-300 pl-3">&quot;{fee.evidence}&quot;</p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-slate-500 italic">No hidden fees detected.</p>
                          )}
                        </div>

                        <Separator />

                        <div>
                          <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5 text-slate-500" /> Risky Clauses
                          </h3>
                          {result.riskyClauses.length > 0 ? (
                            <div className="space-y-3">
                              {result.riskyClauses.map((clause, i) => (
                                <div key={i} className={`p-4 rounded-lg border ${getSeverityColor(clause.severity)}`}>
                                  <div className="flex items-center gap-2 mb-1">
                                    {getSeverityIcon(clause.severity)}
                                    <span className="font-semibold">{clause.title}</span>
                                  </div>
                                  <p className="text-sm mt-2 opacity-90">{clause.explanation}</p>
                                  <p className="text-sm mt-2 opacity-90 italic border-l-2 border-slate-300 pl-3">&quot;{clause.evidence}&quot;</p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-slate-500 italic">No risky clauses detected.</p>
                          )}
                        </div>
                      </div>
                    </TabsContent>
                    
                    <TabsContent value="commute" className="p-6 pt-2 outline-none">
                      <div className="space-y-6">
                        <div className="prose prose-slate max-w-none">
                          <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                            <MapPin className="w-5 h-5 text-slate-500" /> Commute & Area Summary
                          </h3>
                          <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">{result.commuteSummary}</p>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {result.areaPros.length > 0 && (
                            <div className="bg-green-50 rounded-lg p-4 border border-green-100">
                              <h4 className="font-medium text-green-800 mb-3 flex items-center gap-2">
                                <CheckCircle className="w-4 h-4" /> Area Pros
                              </h4>
                              <ul className="space-y-2">
                                {result.areaPros.map((pro, i) => (
                                  <li key={i} className="text-sm text-green-700 flex items-start gap-2">
                                    <span className="mt-1.5 w-1 h-1 rounded-full bg-green-500 shrink-0"></span>
                                    {pro}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          
                          {result.areaCons.length > 0 && (
                            <div className="bg-red-50 rounded-lg p-4 border border-red-100">
                              <h4 className="font-medium text-red-800 mb-3 flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4" /> Area Cons
                              </h4>
                              <ul className="space-y-2">
                                {result.areaCons.map((con, i) => (
                                  <li key={i} className="text-sm text-red-700 flex items-start gap-2">
                                    <span className="mt-1.5 w-1 h-1 rounded-full bg-red-500 shrink-0"></span>
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
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                              <CheckCircle className="w-5 h-5 text-slate-500" /> Questions to Ask
                            </h3>
                            <Button variant="ghost" size="sm" onClick={() => copyToClipboard(result.questionsToAsk.join('\n'))}>
                              <Copy className="w-4 h-4 mr-2" /> Copy All
                            </Button>
                          </div>
                          <ul className="space-y-2">
                            {result.questionsToAsk.map((q, i) => (
                              <li key={i} className="flex items-start gap-3 p-3 bg-slate-50 rounded-md border border-slate-100">
                                <span className="text-indigo-600 font-bold mt-0.5">{i + 1}.</span>
                                <span className="text-slate-700">{q}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        <Separator />

                        <div>
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                              <FileText className="w-5 h-5 text-slate-500" /> Draft Email to Landlord
                            </h3>
                            <Button variant="ghost" size="sm" onClick={() => copyToClipboard(result.landlordEmailDraft)}>
                              <Copy className="w-4 h-4 mr-2" /> Copy Email
                            </Button>
                          </div>
                          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 whitespace-pre-wrap text-slate-700 font-mono text-sm leading-relaxed">
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
