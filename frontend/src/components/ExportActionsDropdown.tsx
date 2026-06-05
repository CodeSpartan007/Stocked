'use client';

import { API_BASE } from '../lib/api';

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, FileText, Grid, Download } from 'lucide-react';

interface ExportActionsDropdownProps {
  reportType: 'summary' | 'transactions' | 'analytics';
  stockId?: string;
  startDate?: string;
  endDate?: string;
}

export default function ExportActionsDropdown({
  reportType,
  stockId,
  startDate,
  endDate,
}: ExportActionsDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside clicks
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleDownload = async (format: 'PDF' | 'XLSX') => {
    try {
      setDownloading(true);
      setIsOpen(false);

      const response = await fetch(`${API_BASE}/api/exports/generate`,
{
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reportType,
          format,
          stockId,
          startDate,
          endDate,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate export stream.');
      }

      // Stream the response down as a Blob
      const blob = await response.blob();

      // Resolve filename from response Content-Disposition header
      const disposition = response.headers.get('content-disposition');
      let filename = `${stockId || 'PORTFOLIO'}_${reportType.toUpperCase()}_REPORT.${
        format === 'PDF' ? 'pdf' : 'xlsx'
      }`;
      
      if (disposition && disposition.indexOf('attachment') !== -1) {
        const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
        const matches = filenameRegex.exec(disposition);
        if (matches != null && matches[1]) {
          filename = matches[1].replace(/['"]/g, '');
        }
      }

      // Trigger client-side direct save download
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Direct download pipeline failed:', error);
      alert('Reporting Generation Failure: Please ensure the backend microservice is running.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <div>
        <button
          type="button"
          disabled={downloading}
          onClick={() => setIsOpen(!isOpen)}
          className="inline-flex items-center justify-center gap-2.5 px-4 py-2 text-xs font-bold text-slate-100 bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-xl hover:border-indigo-500/40 hover:bg-slate-900/90 active:scale-[0.98] transition-all duration-300 shadow-[0_4px_20px_rgba(0,0,0,0.15)] disabled:opacity-50 disabled:pointer-events-none"
        >
          {downloading ? (
            <>
              <svg
                className="animate-spin h-3.5 w-3.5 text-indigo-400"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span>Generating Report...</span>
            </>
          ) : (
            <>
              <Download className="h-3.5 w-3.5 text-indigo-400" />
              <span>Export Report</span>
              <ChevronDown className={`h-3 w-3 text-slate-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
            </>
          )}
        </button>
      </div>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-2 w-56 origin-top-right rounded-xl border border-slate-800/80 bg-slate-950/95 backdrop-blur-2xl shadow-2xl ring-1 ring-slate-950 focus:outline-none animate-slide-in p-1">
          <div className="py-0.5 space-y-1">
            <button
              onClick={() => handleDownload('PDF')}
              className="flex w-full items-center gap-3 px-3 py-2 text-xs font-semibold text-slate-200 hover:text-white hover:bg-indigo-500/10 hover:border-indigo-500/20 border border-transparent rounded-lg transition-all duration-200"
            >
              <FileText className="h-4 w-4 text-indigo-400" />
              <div className="text-left">
                <p>Download PDF Report</p>
                <p className="text-[9px] text-slate-500 font-normal">Branded, structured, dynamic paging</p>
              </div>
            </button>

            <button
              onClick={() => handleDownload('XLSX')}
              className="flex w-full items-center gap-3 px-3 py-2 text-xs font-semibold text-slate-200 hover:text-white hover:bg-emerald-500/10 hover:border-emerald-500/20 border border-transparent rounded-lg transition-all duration-200"
            >
              <Grid className="h-4 w-4 text-emerald-400" />
              <div className="text-left">
                <p>Download Excel Grid</p>
                <p className="text-[9px] text-slate-500 font-normal">Sticky headers, accounting format masks</p>
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
