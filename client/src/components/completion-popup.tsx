import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trophy, Clock, Layers, Download, RotateCcw } from "lucide-react";

interface CompletionPopupProps {
  submissionData: any;
  onClose: () => void;
  onNewSubmission: () => void;
}

export default function CompletionPopup({ submissionData, onClose, onNewSubmission }: CompletionPopupProps) {
  if (!submissionData) return null;

  const totalBatches = Math.ceil(submissionData.totalRecords / submissionData.batchSize);
  const startTime = new Date(submissionData.createdAt);
  const endTime = new Date(submissionData.updatedAt);
  const timeDiff = Math.round((endTime.getTime() - startTime.getTime()) / 1000);
  const timeString = `${Math.floor(timeDiff / 60)}m ${timeDiff % 60}s`;

  const handleDownloadReport = () => {
    const report = {
      formTitle: submissionData.formTitle,
      fileName: submissionData.fileName,
      totalRecords: submissionData.totalRecords,
      batchSize: submissionData.batchSize,
      totalBatches,
      completedAt: new Date().toISOString(),
      duration: timeString,
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `formflow-report-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div 
      className="fixed inset-0 bg-foreground/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      data-testid="completion-popup"
    >
      <Card 
        className="max-w-md w-full scale-in shadow-2xl" 
        onClick={(e) => e.stopPropagation()}
      >
        <CardContent className="p-8 text-center">
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br from-secondary to-primary mb-6 relative">
            <Trophy className="h-14 w-14 text-white" />
            <div className="absolute -top-2 -right-2 w-8 h-8 bg-accent rounded-full flex items-center justify-center">
              <span className="text-white text-sm">⭐</span>
            </div>
          </div>
          <h2 className="text-3xl font-bold text-foreground mb-2">All Done!</h2>
          <p className="text-muted-foreground mb-6">
            Successfully submitted all{' '}
            <span className="font-semibold text-foreground">{submissionData.totalRecords}</span>
            {' '}records
          </p>
          <div className="bg-gradient-to-r from-secondary/10 to-primary/10 rounded-lg p-6 mb-6">
            <div className="flex items-center justify-center gap-8">
              <div>
                <Clock className="h-8 w-8 text-primary mb-2 mx-auto" />
                <div className="text-sm text-muted-foreground">Time Taken</div>
                <div className="text-lg font-bold text-foreground font-mono">{timeString}</div>
              </div>
              <div className="w-px h-16 bg-border"></div>
              <div>
                <Layers className="h-8 w-8 text-secondary mb-2 mx-auto" />
                <div className="text-sm text-muted-foreground">Batches</div>
                <div className="text-lg font-bold text-foreground font-mono">{totalBatches}</div>
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            <Button 
              variant="outline" 
              onClick={handleDownloadReport}
              className="flex-1 gap-2"
              data-testid="button-download-report"
            >
              <Download className="h-4 w-4" />
              Download Report
            </Button>
            <Button 
              onClick={onNewSubmission}
              className="flex-1 gap-2"
              data-testid="button-new-submission"
            >
              <RotateCcw className="h-4 w-4" />
              New Submission
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
