'use client';

import React, { useState, useEffect } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface CanvasConnectorProps {
  supabase: SupabaseClient;
  userId: string;
  onConnected?: (domain: string) => void;
}

export const CanvasConnector: React.FC<CanvasConnectorProps> = ({
  supabase,
  userId,
  onConnected
}) => {
  const [canvasUrl, setCanvasUrl] = useState<string>('');
  const [canvasToken, setCanvasToken] = useState<string>('');
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load existing credentials from profiles table if stored
  useEffect(() => {
    const loadStoredCredentials = async () => {
      if (!userId) return;
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('canvas_domain, canvas_token')
          .eq('user_id', userId)
          .maybeSingle();

        if (data?.canvas_domain && data?.canvas_token) {
          setCanvasUrl(data.canvas_domain);
          setCanvasToken(data.canvas_token);
          setIsConnected(true);
        }
      } catch {
        // Silently fail if columns are being provisioned
      }
    };
    loadStoredCredentials();
  }, [supabase, userId]);

  const normalizeDomain = (rawUrl: string): string => {
    let domain = rawUrl.trim();
    if (!domain.startsWith('http://') && !domain.startsWith('https://')) {
      domain = `https://${domain}`;
    }
    return domain.replace(/\/+$/, '');
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    const formattedDomain = normalizeDomain(canvasUrl);
    const token = canvasToken.trim();

    if (!formattedDomain || !token) {
      setStatusMessage({
        type: 'error',
        text: 'Please provide both your Canvas Instance URL and Access Token.'
      });
      return;
    }

    try {
      setIsVerifying(true);

      // 1. Verify connection against Canvas REST API (/api/v1/users/self/profile)
      const testRes = await fetch(`${formattedDomain}/api/v1/users/self/profile`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json'
        }
      });

      if (!testRes.ok) {
        if (testRes.status === 401) {
          throw new Error('Authentication failed. The Canvas Access Token is invalid or expired.');
        }
        throw new Error(`Failed to reach Canvas instance (HTTP ${testRes.status}). Verify your Canvas domain.`);
      }

      const canvasUser = await testRes.json();

      // 2. Persist canvas credentials to user's profiles row
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          canvas_domain: formattedDomain,
          canvas_token: token,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId);

      if (updateError) throw updateError;

      setIsConnected(true);
      const studentName = canvasUser.name || canvasUser.sortable_name || 'Canvas Student';
      setStatusMessage({
        type: 'success',
        text: `Successfully connected to Canvas as ${studentName}!`
      });

      if (onConnected) {
        onConnected(formattedDomain);
      }
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Unable to connect to Canvas instance. Please check your URL and Token.'
      });
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl text-slate-100 max-w-xl w-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-bold text-slate-100">Canvas LMS Integration</h3>
          <p className="text-xs text-slate-400 mt-0.5">Link your institution Canvas account to auto-import courses.</p>
        </div>
        {isConnected && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Connected
          </span>
        )}
      </div>

      {statusMessage && (
        <div
          className={`mb-4 p-3 rounded-xl text-xs border ${
            statusMessage.type === 'success'
              ? 'bg-emerald-950/50 border-emerald-800 text-emerald-300'
              : 'bg-red-950/50 border-red-800 text-red-300'
          }`}
        >
          {statusMessage.text}
        </div>
      )}

      <form onSubmit={handleConnect} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1.5">Canvas Instance URL</label>
          <input
            type="text"
            placeholder="https://canvas.myschool.edu"
            value={canvasUrl}
            onChange={(e) => setCanvasUrl(e.target.value)}
            disabled={isVerifying}
            className="w-full px-3.5 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1.5">Personal Access Token</label>
          <input
            type="password"
            placeholder="Generate in Canvas -> Account -> Settings"
            value={canvasToken}
            onChange={(e) => setCanvasToken(e.target.value)}
            disabled={isVerifying}
            className="w-full px-3.5 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-mono"
            required
          />
          <p className="text-[11px] text-slate-500 mt-1.5">
            To generate: In Canvas, go to <span className="text-slate-400 font-medium">Account → Settings → Approved Integrations → + New Access Token</span>.
          </p>
        </div>

        <button
          type="submit"
          disabled={isVerifying}
          className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs rounded-xl shadow-lg shadow-indigo-600/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isVerifying ? (
            <>
              <svg className="animate-spin h-3.5 w-3.5 text-white" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <span>Verifying & Saving Connection...</span>
            </>
          ) : isConnected ? (
            'Update Canvas Connection'
          ) : (
            'Connect Canvas LMS'
          )}
        </button>
      </form>
    </div>
  );
};
