import { useState } from "react";
import SplashScreen from "@/components/splash-screen";
import FormSelection from "@/components/form-selection";
import SheetUpload from "@/components/sheet-upload";
import BatchControls from "@/components/batch-controls";
import StatusCard from "@/components/status-card";
import AuthStatus from "@/components/auth-status";
import SuccessPopup from "@/components/success-popup";
import CompletionPopup from "@/components/completion-popup";
import { HelpCircle, Info } from "lucide-react";

export default function Home() {
  const [showSplash, setShowSplash] = useState(true);
  const [formUrl, setFormUrl] = useState("");
  const [formData, setFormData] = useState<any>(null);
  const [sheetData, setSheetData] = useState<any[]>([]);
  const [fileName, setFileName] = useState("");
  const [currentSubmission, setCurrentSubmission] = useState<any>(null);
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const [showCompletionPopup, setShowCompletionPopup] = useState(false);

  if (showSplash) {
    return <SplashScreen onComplete={() => setShowSplash(false)} />;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-40 shadow-sm">
        <div className="container mx-auto px-4 py-4 max-w-7xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-3xl text-primary">
                ✈️
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">FormFlow</h1>
                <p className="text-sm text-muted-foreground">Automated Form Submission</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="hidden md:flex items-center gap-2 bg-muted px-4 py-2 rounded-lg">
                <Info className="h-4 w-4 text-primary" />
                <span className="text-sm text-muted-foreground">Up to 500 records per batch</span>
              </div>
              <button className="p-2 hover:bg-muted rounded-lg transition-colors">
                <HelpCircle className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Step Indicator */}
        <div className="mb-8 slide-up">
          <div className="flex items-center justify-between max-w-3xl mx-auto">
            <div className="flex items-center gap-3 flex-1">
              <div className={`flex items-center justify-center w-10 h-10 rounded-full font-semibold ${
                formData ? 'bg-primary text-primary-foreground' : 'bg-border text-muted-foreground'
              }`}>
                {formData ? '✓' : '1'}
              </div>
              <span className="text-sm font-medium text-foreground hidden sm:inline">Select Form</span>
              <div className={`flex-1 h-1 rounded ${formData ? 'bg-primary' : 'bg-border'}`}></div>
            </div>
            <div className="flex items-center gap-3 flex-1">
              <div className={`flex items-center justify-center w-10 h-10 rounded-full font-semibold ${
                sheetData.length > 0 ? 'bg-primary text-primary-foreground' : 'bg-border text-muted-foreground'
              }`}>
                {sheetData.length > 0 ? '✓' : '2'}
              </div>
              <span className="text-sm font-medium text-foreground hidden sm:inline">Upload Sheet</span>
              <div className={`flex-1 h-1 rounded ${sheetData.length > 0 ? 'bg-primary' : 'bg-border'}`}></div>
            </div>
            <div className="flex items-center gap-3">
              <div className={`flex items-center justify-center w-10 h-10 rounded-full font-semibold ${
                currentSubmission?.status === 'completed' ? 'bg-primary text-primary-foreground' : 'bg-border text-muted-foreground'
              }`}>
                {currentSubmission?.status === 'completed' ? '✓' : '3'}
              </div>
              <span className="text-sm font-medium text-muted-foreground hidden sm:inline">Submit</span>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            <FormSelection 
              formUrl={formUrl}
              setFormUrl={setFormUrl}
              formData={formData}
              setFormData={setFormData}
            />
            
            <SheetUpload 
              sheetData={sheetData}
              setSheetData={setSheetData}
              fileName={fileName}
              setFileName={setFileName}
            />
          </div>

          {/* Control Panel */}
          <div className="space-y-6">
            <AuthStatus />
            
            <BatchControls
              formData={formData}
              sheetData={sheetData}
              fileName={fileName}
              currentSubmission={currentSubmission}
              setCurrentSubmission={setCurrentSubmission}
              onBatchComplete={() => setShowSuccessPopup(true)}
              onAllComplete={() => setShowCompletionPopup(true)}
            />
            
            <StatusCard 
              currentSubmission={currentSubmission}
            />
          </div>
        </div>
      </div>

      {showSuccessPopup && (
        <SuccessPopup 
          submissionData={currentSubmission}
          onClose={() => setShowSuccessPopup(false)}
        />
      )}

      {showCompletionPopup && (
        <CompletionPopup
          submissionData={currentSubmission}
          onClose={() => setShowCompletionPopup(false)}
          onNewSubmission={() => {
            setFormUrl("");
            setFormData(null);
            setSheetData([]);
            setFileName("");
            setCurrentSubmission(null);
            setShowCompletionPopup(false);
          }}
        />
      )}
    </div>
  );
}
