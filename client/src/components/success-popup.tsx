import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle } from "lucide-react";

interface SuccessPopupProps {
  submissionData: any;
  onClose: () => void;
}

export default function SuccessPopup({ submissionData, onClose }: SuccessPopupProps) {
  if (!submissionData) return null;

  const batchNumber = Math.floor(submissionData.processedRecords / submissionData.batchSize);
  const remaining = submissionData.totalRecords - submissionData.processedRecords;

  return (
    <div 
      className="fixed inset-0 bg-foreground/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
      data-testid="success-popup"
    >
      <Card 
        className="max-w-md w-full scale-in shadow-2xl" 
        onClick={(e) => e.stopPropagation()}
      >
        <CardContent className="p-8 text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-secondary/10 mb-6">
            <CheckCircle className="h-12 w-12 text-secondary" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Batch Completed!</h2>
          <p className="text-muted-foreground mb-6">
            Successfully submitted{' '}
            <span className="font-semibold text-foreground">{submissionData.batchSize} records</span>
            {' '}to the form
          </p>
          <div className="grid grid-cols-2 gap-4 mb-6 p-4 bg-muted/50 rounded-lg">
            <div>
              <div className="text-2xl font-bold text-secondary font-mono">
                {submissionData.processedRecords}
              </div>
              <div className="text-xs text-muted-foreground">Total Submitted</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-muted-foreground font-mono">
                {remaining}
              </div>
              <div className="text-xs text-muted-foreground">Remaining</div>
            </div>
          </div>
          <Button 
            onClick={onClose}
            className="w-full"
            data-testid="button-continue"
          >
            Continue
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
