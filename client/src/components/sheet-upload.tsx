import { useCallback, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CloudUpload, FolderOpen, FileSpreadsheet, Table, Link2 } from "lucide-react";
import { useDropzone } from "react-dropzone";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface SheetUploadProps {
  sheetData: any[];
  setSheetData: (data: any[]) => void;
  fileName: string;
  setFileName: (name: string) => void;
}

export default function SheetUpload({ sheetData, setSheetData, fileName, setFileName }: SheetUploadProps) {
  const { toast } = useToast();
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [sheetUrl, setSheetUrl] = useState("");

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const response = await apiRequest("POST", "/api/sheets/upload", formData);
      return response.json();
    },
    onSuccess: (data) => {
      setSheetData(data.records);
      setPreviewData(data.preview);
      setColumns(data.columns);
      setFileName(data.fileName);
      toast({
        title: "Sheet uploaded successfully",
        description: `Loaded ${data.records.length} records`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Upload failed",
        description: error.message || "Please try again with a valid spreadsheet file",
        variant: "destructive",
      });
    },
  });

  const urlMutation = useMutation({
    mutationFn: async (url: string) => {
      const response = await apiRequest("POST", "/api/sheets/fetch", { url });
      return response.json();
    },
    onSuccess: (data) => {
      setSheetData(data.records);
      setPreviewData(data.preview);
      setColumns(data.columns);
      setFileName(data.fileName);
      toast({
        title: "Sheet loaded successfully",
        description: `Loaded ${data.records.length} records from Google Sheets`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to load sheet",
        description: error.message || "Please check the URL and try again",
        variant: "destructive",
      });
    },
  });

  const handleUrlSubmit = () => {
    if (!sheetUrl) return;
    urlMutation.mutate(sheetUrl);
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      uploadMutation.mutate(file);
    }
  }, [uploadMutation]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv'],
    },
    multiple: false,
  });

  return (
    <Card className="slide-up shadow-md border overflow-hidden" style={{ animationDelay: '0.2s' }}>
      <CardHeader className="border-b bg-muted/30">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-secondary/10">
            <FileSpreadsheet className="h-6 w-6 text-secondary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-foreground">Upload Google Sheet</h2>
            <p className="text-sm text-muted-foreground">Upload your spreadsheet with form data</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-6">
        <Tabs defaultValue="upload" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="upload" className="gap-2">
              <CloudUpload className="h-4 w-4" />
              Upload File
            </TabsTrigger>
            <TabsTrigger value="url" className="gap-2">
              <Link2 className="h-4 w-4" />
              Google Sheets URL
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="mt-0">
            <div
              {...getRootProps()}
              className={`dropzone border-2 border-dashed rounded-xl p-8 text-center cursor-pointer bg-muted/20 hover:bg-muted/40 transition-all ${
                isDragActive ? 'drag-over border-primary bg-primary/5' : 'border-border'
              }`}
              data-testid="dropzone-upload"
            >
              <input {...getInputProps()} data-testid="input-file" />
              <div className="space-y-4">
                <div className="flex justify-center">
                  <div className="flex items-center justify-center w-20 h-20 rounded-full bg-secondary/10">
                    <CloudUpload className="h-10 w-10 text-secondary" />
                  </div>
                </div>
                <div>
                  <p className="text-lg font-medium text-foreground mb-1">
                    {isDragActive ? 'Drop your file here' : 'Drop your file here or click to browse'}
                  </p>
                  <p className="text-sm text-muted-foreground">Supports .xlsx, .xls, .csv files</p>
                </div>
                <Button type="button" variant="secondary" className="gap-2" disabled={uploadMutation.isPending}>
                  <FolderOpen className="h-4 w-4" />
                  {uploadMutation.isPending ? 'Processing...' : 'Choose File'}
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="url" className="mt-0">
            <div className="space-y-4">
              <div>
                <Label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
                  <Link2 className="h-4 w-4 text-primary" />
                  Google Sheets URL
                </Label>
                <Input
                  type="url"
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  value={sheetUrl}
                  onChange={(e) => setSheetUrl(e.target.value)}
                  className="transition-all"
                  data-testid="input-sheet-url"
                />
              </div>
              <div className="bg-muted/50 rounded-lg p-4 border">
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Tip:</span> Make sure your Google Sheet is shared as "Anyone with the link can view"
                </p>
              </div>
              <Button 
                onClick={handleUrlSubmit}
                disabled={!sheetUrl || urlMutation.isPending}
                className="w-full gap-2"
                data-testid="button-fetch-sheet"
              >
                <Link2 className="h-4 w-4" />
                {urlMutation.isPending ? 'Loading...' : 'Load Sheet'}
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        {sheetData.length > 0 && (
          <div className="mt-6" data-testid="data-preview">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <Table className="h-4 w-4 text-secondary" />
                Data Preview
              </h3>
              <Badge variant="outline" className="font-mono">
                {sheetData.length} records
              </Badge>
            </div>
            <div className="overflow-x-auto border border-border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-muted border-b border-border">
                  <tr>
                    {columns.map((col, index) => (
                      <th key={index} className="px-4 py-3 text-left font-medium text-foreground">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {previewData.slice(0, 3).map((row, index) => (
                    <tr key={index} className="hover:bg-muted/50 transition-colors">
                      {columns.map((col, colIndex) => (
                        <td key={colIndex} className="px-4 py-3 text-foreground truncate max-w-xs">
                          {row[col] || '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Showing first 3 rows of {fileName}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
