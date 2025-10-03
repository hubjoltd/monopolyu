import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Loader2, CheckCircle, Upload, Clock } from "lucide-react";

interface StatusCardProps {
  currentSubmission: any;
}

export default function StatusCard({ currentSubmission }: StatusCardProps) {
  const progressPercentage = currentSubmission 
    ? Math.round((currentSubmission.processedRecords / currentSubmission.totalRecords) * 100)
    : 0;

  const submitted = currentSubmission?.processedRecords || 0;
  const remaining = currentSubmission 
    ? currentSubmission.totalRecords - currentSubmission.processedRecords 
    : 0;

  const isProcessing = currentSubmission?.status === 'processing';

  return (
    <>
      <Card className="slide-up shadow-md border overflow-hidden" style={{ animationDelay: '0.4s' }}>
        <CardHeader className="border-b">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Submission Status
          </h2>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-mono font-semibold text-foreground">{progressPercentage}%</span>
          </div>
          <div className="relative h-3 bg-muted rounded-full overflow-hidden">
            <div 
              className="absolute inset-y-0 left-0 bg-primary rounded-full transition-all duration-500"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4 pt-4">
            <div className="text-center p-3 bg-secondary/10 rounded-lg">
              <div className="text-2xl font-bold text-secondary font-mono">{submitted}</div>
              <div className="text-xs text-muted-foreground mt-1">Submitted</div>
            </div>
            <div className="text-center p-3 bg-muted rounded-lg">
              <div className="text-2xl font-bold text-muted-foreground font-mono">{remaining}</div>
              <div className="text-xs text-muted-foreground mt-1">Remaining</div>
            </div>
          </div>

          {isProcessing && (
            <div className="pt-4 border-t border-border" data-testid="active-submission">
              <div className="flex items-center gap-3 text-sm">
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Loader2 className="h-5 w-5 text-primary animate-spin" />
                  </div>
                </div>
                <div className="flex-1">
                  <div className="font-medium text-foreground">
                    Processing batch {Math.floor(submitted / currentSubmission.batchSize) + 1} of {Math.ceil(currentSubmission.totalRecords / currentSubmission.batchSize)}...
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Submitting records {submitted + 1}-{Math.min(submitted + currentSubmission.batchSize, currentSubmission.totalRecords)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="slide-up shadow-md border overflow-hidden" style={{ animationDelay: '0.5s' }}>
        <CardHeader className="border-b">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Clock className="h-5 w-5 text-muted-foreground" />
            Recent Activity
          </h2>
        </CardHeader>
        <CardContent className="p-4 space-y-2 max-h-64 overflow-y-auto">
          {!currentSubmission && (
            <div className="text-center py-8 text-muted-foreground">
              <Upload className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No activity yet</p>
            </div>
          )}
          
          {currentSubmission?.status === 'completed' && (
            <div className="flex items-start gap-3 p-3 hover:bg-muted/50 rounded-lg transition-colors">
              <CheckCircle className="h-5 w-5 text-secondary mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground font-medium truncate">Submission completed</p>
                <p className="text-xs text-muted-foreground">{currentSubmission.totalRecords} records submitted</p>
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">Now</span>
            </div>
          )}
          
          {isProcessing && (
            <div className="flex items-start gap-3 p-3 hover:bg-muted/50 rounded-lg transition-colors">
              <Loader2 className="h-5 w-5 text-primary mt-0.5 animate-spin" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground font-medium truncate">Processing in progress</p>
                <p className="text-xs text-muted-foreground">{submitted} of {currentSubmission.totalRecords} records</p>
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">Now</span>
            </div>
          )}
          
          {currentSubmission && (
            <div className="flex items-start gap-3 p-3 hover:bg-muted/50 rounded-lg transition-colors">
              <Upload className="h-5 w-5 text-primary mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground font-medium truncate">Submission started</p>
                <p className="text-xs text-muted-foreground">{currentSubmission.fileName}</p>
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {new Date(currentSubmission.createdAt).toLocaleTimeString()}
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
