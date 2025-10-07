import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, Link, Lightbulb, FileText } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface FormSelectionProps {
  formUrl: string;
  setFormUrl: (url: string) => void;
  formData: any;
  setFormData: (data: any) => void;
}

export default function FormSelection({ formUrl, setFormUrl, formData, setFormData }: FormSelectionProps) {
  const { toast } = useToast();
  const [isValidating, setIsValidating] = useState(false);

  const validateFormMutation = useMutation({
    mutationFn: async (url: string) => {
      const response = await apiRequest("POST", "/api/forms/validate", { url });
      return response.json();
    },
    onSuccess: (data) => {
      setFormData(data);
      toast({
        title: "Form validated successfully",
        description: `Found ${data.fields.length} fields in the form`,
      });
    },
    onError: (error: any) => {
      // Still set basic form data even on validation failure
      setFormData({
        url: formUrl,
        title: "Google Form",
        description: "Auto-detection failed, but you can proceed with submission",
        fields: []
      });
      toast({
        title: "Could not auto-detect form fields",
        description: "You can still proceed with submission - the system will attempt to map fields automatically",
      });
    },
    onSettled: () => {
      setIsValidating(false);
    },
  });

  const handleUrlChange = (value: string) => {
    setFormUrl(value);
    if (value && value.includes('docs.google.com/forms')) {
      setIsValidating(true);
      validateFormMutation.mutate(value);
    } else {
      setFormData(null);
    }
  };

  return (
    <Card className="slide-up shadow-md border overflow-hidden" style={{ animationDelay: '0.1s' }}>
      <CardHeader className="border-b bg-muted/30">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10">
            <ClipboardList className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-foreground">Select Target Form</h2>
            <p className="text-sm text-muted-foreground">Choose the Google Form to submit data to</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-6 space-y-4">
        <div>
          <Label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
            <Link className="h-4 w-4 text-primary" />
            Google Form URL
          </Label>
          <Input
            type="url"
            placeholder="https://docs.google.com/forms/d/..."
            value={formUrl}
            onChange={(e) => handleUrlChange(e.target.value)}
            className="transition-all"
            data-testid="input-form-url"
          />
        </div>

        <div className="bg-muted/50 rounded-lg p-4 border">
          <div className="flex items-start gap-3">
            <Lightbulb className="h-5 w-5 text-accent mt-1" />
            <div className="flex-1">
              <h3 className="font-medium text-foreground mb-1">Quick Tip</h3>
              <p className="text-sm text-muted-foreground">
                Paste the Google Form URL from your browser. The form must be publicly accessible or shared with you.
              </p>
            </div>
          </div>
        </div>

        {isValidating && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full"></div>
            Validating form...
          </div>
        )}

        {formData && (
          <div className="p-4 bg-secondary/5 border-2 border-dashed border-secondary/30 rounded-lg">
            <div className="flex items-center gap-3 mb-3">
              <FileText className="h-5 w-5 text-secondary" />
              <div className="flex-1">
                <h3 className="font-semibold text-foreground">{formData.title}</h3>
                <p className="text-xs text-muted-foreground">{formData.description}</p>
              </div>
              <Badge variant="secondary" className="bg-secondary/20 text-secondary">
                Detected
              </Badge>
            </div>
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                <span className="mr-2">📋</span>
                {formData.fields.length} fields detected with entry IDs
              </div>
              <div className="flex flex-col gap-2">
                {formData.fields.map((field: any, index: number) => (
                  <div key={index} className="flex items-center gap-2 p-2 bg-muted/30 rounded-md border border-border/40">
                    <Badge variant="outline" className="text-xs font-mono shrink-0 bg-primary/5">
                      {field.id}
                    </Badge>
                    <span className="text-sm text-foreground">{field.title}</span>
                    {field.required && (
                      <Badge variant="secondary" className="text-xs ml-auto">Required</Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
