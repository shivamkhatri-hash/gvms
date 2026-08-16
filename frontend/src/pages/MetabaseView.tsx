import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, ShieldCheck, Activity, RefreshCw } from 'lucide-react';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { samplesService } from '../services/samples.service';
import { Spinner } from '../components/common/Spinner';

export const MetabaseView: React.FC = () => {
  const [embedUrl, setEmbedUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  const loadSecureEmbed = () => {
    setIsLoading(true);
    setError('');
    samplesService
      .getMetabaseEmbedUrl()
      .then((res) => {
        setEmbedUrl(res.url);
      })
      .catch((err) => {
        console.error(err);
        setError('Failed to generate secure Metabase signed session token.');
      })
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    loadSecureEmbed();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-100 shadow-xs">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Secure Metabase BI Portal</h1>
          <p className="text-xs text-slate-500 mt-1">
            Encrypted analytics session utilizing JWT HS256 signatures to authorize read access to <code className="font-mono text-ongc-blue">ongc_lab</code> database schemas.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            icon={<RefreshCw className="w-4 h-4" />}
            onClick={() => loadSecureEmbed()}
            isLoading={isLoading}
          >
            Refresh Session
          </Button>
        </div>
      </div>

      {/* Integration Security Status Card */}
      <Card className="bg-slate-50 border-slate-200">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-200">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <p className="font-bold text-slate-800">Metabase Private Integration Active</p>
              <p className="text-slate-500 text-[11px]">Metabase host port disabled. Accessible strictly via backend token signatures.</p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-emerald-700 font-semibold uppercase tracking-wider text-[10px] bg-emerald-100/50 border border-emerald-200 px-2 py-0.5 rounded">
            Secure Embedding Enabled
          </div>
        </div>
      </Card>

      {/* Embedded IFrame Viewport */}
      <Card noPadding className="h-[750px] overflow-hidden border-slate-200 shadow-lg relative">
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-20">
            <Spinner size="lg" />
          </div>
        ) : error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-rose-500 text-sm gap-2">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={() => loadSecureEmbed()}>Retry Sign-on</Button>
          </div>
        ) : (
          <iframe
            src={embedUrl}
            title="Metabase Business Intelligence"
            className="w-full h-full border-0"
            allowTransparency
            sandbox="allow-scripts allow-same-origin"
          />
        )}
      </Card>
    </div>
  );
};
export default MetabaseView;
