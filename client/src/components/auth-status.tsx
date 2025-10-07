import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle, XCircle, Loader2, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface AuthStatus {
  isAuthenticated: boolean;
  email?: string;
  lastLogin?: string;
}

export default function AuthStatus() {
  const { data: authStatus, isLoading } = useQuery<AuthStatus>({
    queryKey: ['/api/auth/status'],
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <Card className="slide-up" style={{ animationDelay: '0.4s' }} data-testid="card-auth-status">
        <CardHeader className="border-b bg-muted/30">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <h3 className="text-sm font-semibold">Checking authentication...</h3>
          </div>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="slide-up" style={{ animationDelay: '0.4s' }} data-testid="card-auth-status">
      <CardHeader className="border-b bg-muted/30">
        <div className="flex items-center gap-3">
          {authStatus?.isAuthenticated ? (
            <CheckCircle className="h-5 w-5 text-green-500" data-testid="icon-authenticated" />
          ) : (
            <XCircle className="h-5 w-5 text-yellow-500" data-testid="icon-not-authenticated" />
          )}
          <div className="flex-1">
            <h3 className="text-sm font-semibold">Service Account Authentication</h3>
            <p className="text-xs text-muted-foreground">
              {authStatus?.isAuthenticated ? "Active" : "Not configured"}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {authStatus?.isAuthenticated ? (
          <div className="space-y-3">
            {authStatus.email && (
              <div className="text-sm">
                <span className="text-muted-foreground">Service Account:</span>
                <p className="font-medium mt-1 break-all" data-testid="text-service-email">{authStatus.email}</p>
              </div>
            )}
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Make sure to share your Google Forms with this service account email to enable automatic submissions.
              </AlertDescription>
            </Alert>
          </div>
        ) : (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Service account not configured. Please add GOOGLE_SERVICE_ACCOUNT_JSON to your environment secrets.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
