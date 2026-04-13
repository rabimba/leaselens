import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, CheckCircle2, TrendingUp, Users, Zap } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function PitchPage() {
  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="text-center space-y-4 mb-12">
          <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200 px-3 py-1 text-sm">
            Hackathon Submission
          </Badge>
          <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight">
            LeaseLens: The AI Tenant Advocate
          </h1>
          <p className="text-xl text-slate-600 max-w-2xl mx-auto">
            Empowering renters with instant, AI-driven lease analysis and negotiation leverage.
          </p>
        </div>

        <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
          <CardContent className="p-8 md:p-12 prose prose-slate prose-indigo max-w-none">
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-12">
              <div>
                <h3 className="flex items-center gap-2 text-2xl font-bold text-slate-900 mt-0">
                  <AlertTriangleIcon className="w-6 h-6 text-amber-500" /> The Problem
                </h3>
                <p className="text-slate-700 leading-relaxed">
                  Every year, 44 million US renter households sign legally binding, 50-page contracts they don&apos;t understand. Landlords use standardized leases packed with hidden fees, illegal eviction clauses, and aggressive maintenance liabilities. Renters, lacking legal expertise and pressured by fast-moving markets, sign blindly. The result? Thousands of dollars lost to &quot;trash valet&quot; fees, unreturned deposits, and nightmare commutes that weren&apos;t apparent from the listing.
                </p>
              </div>
              <div>
                <h3 className="flex items-center gap-2 text-2xl font-bold text-slate-900 mt-0">
                  <Zap className="w-6 h-6 text-indigo-500" /> The Product
                </h3>
                <p className="text-slate-700 leading-relaxed">
                  LeaseLens is an AI-powered tenant advocate. It ingests apartment listings and dense lease PDFs, cross-references them with local context via Google Maps, and outputs a plain-English risk dashboard in under 15 seconds. It highlights hidden costs, flags predatory language, evaluates commute viability, and generates ready-to-send negotiation emails.
                </p>
              </div>
            </div>

            <hr className="border-slate-100 my-8" />

            <h3 className="text-2xl font-bold text-slate-900">Why Now?</h3>
            <p className="text-slate-700 leading-relaxed">
              Until recently, parsing dense, unstructured legal PDFs required expensive human lawyers. Today, LLMs with massive context windows and fast reasoning capabilities (like Gemini 1.5 Flash) can process 50-page leases instantly and cheaply. Simultaneously, renters are facing an unprecedented affordability crisis; they need leverage and transparency more than ever.
            </p>

            <h3 className="text-2xl font-bold text-slate-900 mt-8">How It Works</h3>
            <ol className="space-y-2 text-slate-700">
              <li><strong>Ingestion:</strong> The user pastes a listing URL or uploads a lease PDF.</li>
              <li><strong>Analysis:</strong> Gemini analyzes the document, extracting financial obligations and legal risks.</li>
              <li><strong>Grounding:</strong> The Google Maps tool grounds the listing location against the user&apos;s workplace to calculate real commute times and neighborhood viability.</li>
              <li><strong>Output:</strong> A deterministic JSON response populates a sleek, scannable React dashboard.</li>
            </ol>

            <div className="bg-slate-50 rounded-xl p-6 my-8 border border-slate-200">
              <h3 className="text-xl font-bold text-slate-900 mt-0 mb-4">Demo Flow</h3>
              <p className="text-slate-700 leading-relaxed mb-0">
                The user arrives at a clean, consumer-friendly interface. They click &quot;Load Demo Data&quot; to populate a sample listing, budget, and destination. Upon clicking &quot;Analyze,&quot; LeaseLens processes the data and reveals a &quot;Fit Score.&quot; The dashboard exposes a hidden $35/mo trash fee, flags a risky &quot;tenant pays for all plumbing repairs&quot; clause, and warns that the commute involves three transit transfers. Finally, the user copies an AI-generated email to negotiate the terms.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 my-12">
              <div>
                <h3 className="flex items-center gap-2 text-2xl font-bold text-slate-900 mt-0">
                  <Users className="w-6 h-6 text-blue-500" /> Target Users
                </h3>
                <ul className="space-y-2 text-slate-700 mt-4">
                  <li><strong>Gen Z & Millennials:</strong> Digital natives moving frequently in major metro areas.</li>
                  <li><strong>International Students:</strong> Renters unfamiliar with local leasing norms and legal jargon.</li>
                  <li><strong>First-Time Renters:</strong> Young professionals signing their first major contract.</li>
                </ul>
              </div>
              <div>
                <h3 className="flex items-center gap-2 text-2xl font-bold text-slate-900 mt-0">
                  <DollarSignIcon className="w-6 h-6 text-green-500" /> Business Model
                </h3>
                <ul className="space-y-2 text-slate-700 mt-4">
                  <li><strong>Basic (Free):</strong> Listing analysis and commute check.</li>
                  <li><strong>Pro ($9.99/report):</strong> Deep PDF lease analysis, legal risk flagging, and negotiation coaching.</li>
                  <li><strong>B2B API:</strong> Licensing the analysis engine to real estate marketplaces as a &quot;Lease Transparency Score.&quot;</li>
                </ul>
              </div>
            </div>

            <hr className="border-slate-100 my-8" />

            <h3 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
              <TrendingUp className="w-6 h-6 text-indigo-600" /> Why This Can Become a Venture-Scale Company
            </h3>
            <p className="text-slate-700 leading-relaxed">
              Moving is one of the highest-intent transaction points in a consumer&apos;s life. By acting as the trusted advisor <em>before</em> the lease is signed, LeaseLens captures the user at the exact moment they are making major financial decisions. This establishes a wedge to cross-sell highly lucrative adjacent services: renters insurance, moving services, utility setup, and rent reporting. LeaseLens isn&apos;t just a legal tool; it&apos;s the financial gateway for the modern renter.
            </p>

            <h3 className="flex items-center gap-2 text-2xl font-bold text-slate-900 mt-8">
              <CheckCircle2 className="w-6 h-6 text-emerald-500" /> Why It Should Win This Hackathon
            </h3>
            <p className="text-slate-700 leading-relaxed">
              LeaseLens perfectly demonstrates the power of Gemini&apos;s native capabilities. It combines multimodal document processing (PDFs), fast reasoning (ThinkingLevel.LOW), structured JSON outputs, and tool use (Google Maps) into a highly polished, instantly usable product. It solves a real, painful problem with a clear path to monetization, delivered in a VC-ready prototype.
            </p>

          </CardContent>
        </Card>

        <div className="text-center pb-12">
          <Link href="/">
            <Button size="lg" className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-full px-8 shadow-lg shadow-indigo-200">
              Try the Product Demo <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </Link>
        </div>

      </div>
    </div>
  );
}

// Simple icon components for the pitch page
function AlertTriangleIcon(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

function DollarSignIcon(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" x2="12" y1="2" y2="22" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}
