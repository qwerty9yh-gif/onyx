import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';

type TabKey = 'sales' | 'inventory' | 'products' | 'cashiers' | 'customers';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'sales', label: 'Sales' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'products', label: 'Products' },
  { key: 'cashiers', label: 'Cashiers' },
  { key: 'customers', label: 'Customers' },
];

interface MetaBlock {
  [key: string]: unknown;
}

function MetaValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span>—</span>;
  if (typeof value === 'number') return <span>${value.toFixed(2)}</span>;
  if (typeof value === 'object') return <span className="text-gray-400">[data]</span>;
  return <span>{String(value)}</span>;
}

export const ReportsPage: React.FC = () => {
  const [tab, setTab] = useState<TabKey>('sales');

  const { data, isLoading } = useQuery({
    queryKey: ['report', tab],
    queryFn: () => api.get(`/reports/${tab}`).then((res) => res.data),
  });

  const meta: MetaBlock = (data?.meta || {}) as MetaBlock;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-sm text-gray-600 mt-1">Business performance reports</p>
        </div>
        <Button variant="secondary" onClick={() => window.print()}>
          <Download size={16} className="mr-2" /> Print
        </Button>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? 'border-red-600 text-red-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        {isLoading ? (
          <div className="animate-pulse space-y-2">
            {[...Array(6)].map((_, i) => <div key={i} className="h-4 bg-gray-200 rounded w-1/2" />)}
          </div>
        ) : (
          <>
            <h2 className="text-lg font-semibold mb-4 capitalize">{tab} Report Summary</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Object.entries(meta)
                .filter(([, v]) => typeof v !== 'object')
                .map(([k, v]) => (
                  <div key={k} className="border rounded-lg p-4">
                    <p className="text-xs text-gray-500 uppercase">{k.replace(/([A-Z])/g, ' $1').trim()}</p>
                    <p className="text-lg font-bold mt-1"><MetaValue value={v} /></p>
                  </div>
                ))}
            </div>
            {Object.keys(meta).length === 0 && (
              <p className="text-sm text-gray-500">No summary data available.</p>
            )}
            <p className="mt-6 text-xs text-gray-400">
              Detailed {tab} data is available via the API at <code>/api/reports/{tab}</code>.
            </p>
          </>
        )}
      </div>
    </div>
  );
};
