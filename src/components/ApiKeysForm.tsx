import { useState } from "react";
import { Eye, EyeOff, Key, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface ApiAccount {
  id: string;
  label: string;
  apiKey: string;
  apiSecret: string;
  apiPassphrase: string;
}

interface ApiKeysFormProps {
  accounts: ApiAccount[];
  onChange: (accounts: ApiAccount[]) => void;
}

export function ApiKeysForm({ accounts, onChange }: ApiKeysFormProps) {
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  const addAccount = () => {
    const newAccount: ApiAccount = {
      id: crypto.randomUUID(),
      label: `Account ${accounts.length + 1}`,
      apiKey: "",
      apiSecret: "",
      apiPassphrase: "",
    };
    onChange([...accounts, newAccount]);
  };

  const removeAccount = (id: string) => {
    onChange(accounts.filter((a) => a.id !== id));
  };

  const updateAccount = (id: string, field: keyof ApiAccount, value: string) => {
    onChange(accounts.map((a) => (a.id === id ? { ...a, [field]: value } : a)));
  };

  const toggleSecret = (id: string) => {
    setShowSecrets((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-4">
      {accounts.map((account, index) => (
        <div key={account.id} className="card-trading p-5 space-y-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse_glow" />
              <Input
                value={account.label}
                onChange={(e) => updateAccount(account.id, "label", e.target.value)}
                className="h-7 text-sm font-semibold bg-transparent border-none p-0 focus-visible:ring-0 w-40"
              />
            </div>
            {accounts.length > 1 && (
              <button onClick={() => removeAccount(account.id)} className="text-muted-foreground hover:text-loss transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">API Key</Label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="Enter API Key"
                  value={account.apiKey}
                  onChange={(e) => updateAccount(account.id, "apiKey", e.target.value)}
                  className="pl-9 font-mono text-sm bg-secondary border-border"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">API Secret</Label>
              <div className="relative">
                <Input
                  type={showSecrets[account.id] ? "text" : "password"}
                  placeholder="Enter API Secret"
                  value={account.apiSecret}
                  onChange={(e) => updateAccount(account.id, "apiSecret", e.target.value)}
                  className="pr-10 font-mono text-sm bg-secondary border-border"
                />
                <button
                  onClick={() => toggleSecret(account.id)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showSecrets[account.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">API Passphrase</Label>
              <Input
                type="password"
                placeholder="Enter API Passphrase"
                value={account.apiPassphrase}
                onChange={(e) => updateAccount(account.id, "apiPassphrase", e.target.value)}
                className="font-mono text-sm bg-secondary border-border"
              />
            </div>
          </div>
        </div>
      ))}

      <Button
        variant="outline"
        size="sm"
        onClick={addAccount}
        className="w-full border-dashed border-border text-muted-foreground hover:text-primary hover:border-primary"
      >
        <Plus className="w-4 h-4 mr-2" />
        Add Another Account
      </Button>
    </div>
  );
}
