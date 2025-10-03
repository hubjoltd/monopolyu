import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Sliders, Play, Volume2 } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAudio } from "@/hooks/use-audio";
import type { Submission } from "@shared/schema";

interface BatchControlsProps {
  formData: any;
  sheetData: any[];
  fileName: string;
  currentSubmission: any;
  setCurrentSubmission: (submission: any) => void;
  onBatchComplete: () => void;
  onAllComplete: () => void;
}

export default function BatchControls({
  formData,
  sheetData,
  fileName,
  currentSubmission,
  setCurrentSubmission,
  onBatchComplete,
  onAllComplete
}: BatchControlsProps) {
  const [batchSize, setBatchSize] = useState(100);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const { toast } = useToast();
  const { playSuccess } = useAudio();

  const numberOfBatches = Math.ceil(sheetData.length / batchSize);
  const estimatedTimeMinutes = Math.ceil((numberOfBatches * 10) / 60); // Estimate 10 seconds per batch

  const createSubmissionMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/submissions", {
        formUrl: formData.url,
        formTitle: formData.title,
        fileName,
        totalRecords: sheetData.length,
        batchSize,
        data: sheetData,
      });
      return response.json();
    },
    onSuccess: (submission) => {
      setCurrentSubmission(submission);
      startProcessingMutation.mutate(submission.id);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to start submission",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const startProcessingMutation = useMutation({
    mutationFn: async (submissionId: string) => {
      const response = await apiRequest("POST", `/api/submissions/${submissionId}/process`);
      return response.json();
    },
  });

  // Poll submission status
  const { data: submissionStatus } = useQuery<Submission>({
    queryKey: ['/api/submissions', currentSubmission?.id],
    enabled: !!currentSubmission?.id && currentSubmission?.status !== 'completed',
    refetchInterval: 2000,
  });

  // Update current submission when status changes
  if (submissionStatus && submissionStatus.id === currentSubmission?.id) {
    if (submissionStatus !== currentSubmission) {
      setCurrentSubmission(submissionStatus);
      
      // Handle batch completion
      if (submissionStatus.status === 'processing' && 
          (submissionStatus.processedRecords ?? 0) > (currentSubmission?.processedRecords ?? 0)) {
        if (soundEnabled) {
          playSuccess();
        }
        onBatchComplete();
      }
      
      // Handle completion
      if (submissionStatus.status === 'completed') {
        if (soundEnabled) {
          playSuccess();
        }
        onAllComplete();
      }
    }
  }

  const canStart = formData && sheetData.length > 0 && !currentSubmission?.id;
  const isProcessing = currentSubmission?.status === 'processing';

  const handleStart = () => {
    if (!canStart) return;
    createSubmissionMutation.mutate();
  };

  return (
    <Card className="slide-up shadow-md border overflow-hidden" style={{ animationDelay: '0.3s' }}>
      <CardHeader className="border-b bg-accent/5">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-accent/20">
            <Sliders className="h-6 w-6 text-accent" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Batch Controls</h2>
            <p className="text-xs text-muted-foreground">Configure submission settings</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-6 space-y-6">
        <div>
          <Label className="block text-sm font-medium text-foreground mb-3">
            Records per Batch
          </Label>
          <div className="flex items-center gap-4">
            <Slider
              value={[batchSize]}
              onValueChange={(value) => setBatchSize(value[0])}
              min={1}
              max={500}
              step={10}
              className="flex-1"
              disabled={isProcessing}
              data-testid="slider-batch-size"
            />
            <div className="px-4 py-2 bg-primary/10 text-primary font-mono font-semibold rounded-lg min-w-[80px] text-center">
              {batchSize}
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">Maximum: 500 records per submission</p>
        </div>

        {sheetData.length > 0 && (
          <div className="pt-4 border-t border-border">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total Records</span>
                <span className="font-mono font-semibold text-foreground">{sheetData.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Number of Batches</span>
                <span className="font-mono font-semibold text-foreground">{numberOfBatches}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Estimated Time</span>
                <span className="font-mono font-semibold text-foreground">~{estimatedTimeMinutes} min</span>
              </div>
            </div>
          </div>
        )}

        <div className="pt-4 border-t border-border">
          <div className="flex items-center space-x-3">
            <Checkbox 
              id="sound-enabled" 
              checked={soundEnabled}
              onCheckedChange={(checked) => setSoundEnabled(checked === true)}
              data-testid="checkbox-sound"
            />
            <div className="flex-1">
              <Label htmlFor="sound-enabled" className="text-sm font-medium text-foreground cursor-pointer">
                Sound Notifications
              </Label>
              <p className="text-xs text-muted-foreground">Play sound after each batch</p>
            </div>
            <Volume2 className="h-4 w-4 text-primary" />
          </div>
        </div>

        <Button 
          onClick={handleStart}
          disabled={!canStart || createSubmissionMutation.isPending}
          className="w-full gap-3 py-4 shadow-lg hover:shadow-xl"
          data-testid="button-start-submission"
        >
          <Play className="h-4 w-4" />
          {createSubmissionMutation.isPending ? 'Starting...' : 'Start Submission'}
        </Button>
      </CardContent>
    </Card>
  );
}
